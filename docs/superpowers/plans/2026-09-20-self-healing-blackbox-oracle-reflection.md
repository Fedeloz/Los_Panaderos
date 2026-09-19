# Self-healing loop (black box, oracle, reflection) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record every HappyRobot decision with its frozen world, grade it against a hindsight oracle, explain the gap with a reflection agent, and feed corrections back (lessons, annotations, northstars, gated prompt patches).

**Architecture:** Five small stdlib modules under `simulator/` (`blackbox`, `telemetry`, `oracle`, `reflection`, `healing`) hooked into `Controller._decide` through one background analysis step; a new HappyRobot workflow "Post-mortem Los Panaderos" produces the reflection; a `/api/postmortem` endpoint and a UI panel expose results. Spec: `docs/superpowers/specs/2026-09-20-self-healing-blackbox-oracle-reflection-design.md`.

**Tech Stack:** Python 3.12 stdlib (`sqlite3`, `pickle`, `zlib`, `threading`, `unittest`), vanilla JS, HappyRobot MCP (`trigger_run`, `monitor_runs`, `manage_versions`, `update_workflow_nodes`, `manage_northstars`).

## Global Constraints

- Python standard library only; no new dependencies.
- Storage: SQLite at `.runtime/blackbox.sqlite` (gitignored via `.runtime/`).
- At most two extra MCP calls per decision for telemetry; reflection is one extra run in the background.
- The clock never waits on analysis; analysis failures are logged as `system` history entries only.
- Tier 3 never publishes a workflow version.
- Commit with `/usr/bin/git commit` (system git 2.25 lacks `--trailer`).
- Run tests from `Los_Panaderos/` with `python3 -m unittest discover -s tests -v`.

---

## File structure

| File | Responsibility |
|---|---|
| `simulator/blackbox.py` (new) | SQLite flight recorder: decisions, telemetry, evaluations, reflections, lessons; snapshot/restore. |
| `simulator/telemetry.py` (new) | Parse run agent outputs into steps; compute signals. |
| `simulator/oracle.py` (new) | Candidate generation, seeded rollouts, cost, regret, gap type. |
| `simulator/reflection.py` (new) | Build post-mortem payload, trigger reflection workflow, parse diagnosis. |
| `simulator/healing.py` (new) | Tier 1 lessons + mark, Tier 2 northstars, Tier 3 gated patch + A/B. |
| `simulator/analysis.py` (new) | Orchestrates 2→3→4→5 for one decision in a background thread. |
| `simulator/happyrobot.py` (modify) | Expose `last_run_id`, `last_listing` after `decide`. |
| `simulator/engine.py` (modify) | `payload()` adds `lessons_learned`; `Simulation.lessons` attribute. |
| `simulator/server.py` (modify) | Hooks in `_decide`, `reset`; `/api/postmortem`. |
| `simulator/static/index.html`, `app.js`, `style.css` (modify) | Post-mortem panel. |
| `tests/test_blackbox.py`, `tests/test_telemetry.py`, `tests/test_oracle.py`, `tests/test_healing.py`, `tests/test_analysis.py` (new) | Unit tests. |
| `tests/fixtures/scout_loop_run.json` (new) | Reference run Scout Agent output (run `58a5e3dc`). |
| `README.md`, `docs/demo-validation.md` (modify) | Document the loop and the reference case. |

---

### Task 1: Black box flight recorder

**Files:**
- Create: `simulator/blackbox.py`
- Test: `tests/test_blackbox.py`

**Interfaces:**
- Produces: `class BlackBox(path)` with
  `record_decision(sim, payload, run_id, latency, decision, status, reject_reason='') -> int`,
  `finish_outcome(decision_id, sim) -> dict`, `load_snapshot(decision_id) -> Simulation`,
  `save_telemetry(decision_id, steps, signals)`, `save_evaluation(decision_id, result)`,
  `save_reflection(decision_id, run_id, text, diagnosis)`, `add_lesson(rule, decision_id)`,
  `active_lessons(limit=5) -> list[str]`, `list_decisions(incident_id) -> list[dict]`,
  `decision(decision_id) -> dict`, `snapshot_metrics(sim) -> dict`.

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_blackbox.py
import json, unittest
from tempfile import TemporaryDirectory
from pathlib import Path
from simulator.engine import Simulation
from simulator.blackbox import BlackBox

def decision():
    return dict(primary_command='hold', mission='m', drone_reason='r',
                extinguisher_orders=[dict(drone_id='drone-1', command='hold', target_x=12, target_y=32, district_id='', reason='r')],
                scout_orders=[], truck_orders=[dict(truck_id='engine-1', command='continue', reason='r')])

class BlackBoxTests(unittest.TestCase):
    def setUp(self):
        self.tmp = TemporaryDirectory(); self.box = BlackBox(Path(self.tmp.name)/'bb.sqlite')
        self.sim = Simulation(fleet_counts=dict(scouts=0, extinguishers=1, trucks=1)); self.sim.ignite(); self.sim.farmer_call()
    def tearDown(self): self.box.close(); self.tmp.cleanup()

    def test_record_restore_round_trip(self):
        payload = self.sim.payload('farmer_call')
        did = self.box.record_decision(self.sim, payload, 'run-1', 1.5, decision(), 'applied')
        restored = self.box.load_snapshot(did)
        self.assertEqual(restored.tick, self.sim.tick); self.assertEqual(restored.incident_id, self.sim.incident_id)
        self.assertEqual(restored.state()['cells'], self.sim.state()['cells'])
        row = self.box.decision(did)
        self.assertEqual(row['run_id'], 'run-1'); self.assertEqual(row['status'], 'applied')
        self.assertEqual(json.loads(row['payload_json'])['event_type'], 'farmer_call')

    def test_outcome_deltas_after_steps(self):
        did = self.box.record_decision(self.sim, self.sim.payload(), 'run-1', 1.0, decision(), 'applied')
        self.sim.step(20)
        out = self.box.finish_outcome(did, self.sim)
        self.assertEqual(out['elapsed_steps'], 20)
        self.assertGreaterEqual(out['newly_burned_cells'], 1)
        self.assertIn('people', out); self.assertIn('farm', out['people'])

    def test_rejected_decision_keeps_reason(self):
        did = self.box.record_decision(self.sim, self.sim.payload(), 'run-2', 1.0, decision(), 'rejected', 'Target outside map.')
        self.assertEqual(self.box.decision(did)['reject_reason'], 'Target outside map.')

    def test_lessons_dedupe_and_cap(self):
        for i in range(7): self.box.add_lesson(f'Rule {i}', None)
        self.box.add_lesson('rule 6', None)  # case/whitespace duplicate
        lessons = self.box.active_lessons(5)
        self.assertEqual(len(lessons), 5); self.assertEqual(lessons[0], 'Rule 6')

    def test_list_decisions_by_incident(self):
        self.box.record_decision(self.sim, self.sim.payload(), 'run-1', 1.0, decision(), 'applied')
        other = Simulation(); other.ignite(); other.farmer_call()
        self.box.record_decision(other, other.payload(), 'run-9', 1.0, decision(), 'applied')
        rows = self.box.list_decisions(self.sim.incident_id)
        self.assertEqual([r['run_id'] for r in rows], ['run-1'])
```

- [ ] **Step 2: Run to verify failure**

Run: `cd Los_Panaderos && python3 -m unittest tests.test_blackbox -v`
Expected: `ModuleNotFoundError: No module named 'simulator.blackbox'`

- [ ] **Step 3: Implement `simulator/blackbox.py`**

```python
"""SQLite flight recorder for HappyRobot decisions. Stores the frozen world the
agent saw, its decision, platform telemetry, oracle grades and reflections."""
import copy, json, pickle, sqlite3, threading, time, zlib
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS decisions(id INTEGER PRIMARY KEY, incident_id TEXT, tick INTEGER, event_type TEXT,
  created_at REAL, payload_json TEXT, snapshot_blob BLOB, run_id TEXT, latency_s REAL, status TEXT,
  decision_json TEXT, reject_reason TEXT, metrics_json TEXT, outcome_json TEXT);
CREATE TABLE IF NOT EXISTS telemetry(decision_id INTEGER, agent TEXT, step_index INTEGER, timestamp TEXT,
  reasoning TEXT, action TEXT, arguments_json TEXT, outcome_json TEXT);
CREATE TABLE IF NOT EXISTS signals(decision_id INTEGER PRIMARY KEY, signals_json TEXT);
CREATE TABLE IF NOT EXISTS evaluations(decision_id INTEGER PRIMARY KEY, result_json TEXT);
CREATE TABLE IF NOT EXISTS reflections(decision_id INTEGER PRIMARY KEY, run_id TEXT, text TEXT, diagnosis_json TEXT, created_at REAL);
CREATE TABLE IF NOT EXISTS lessons(id INTEGER PRIMARY KEY, rule TEXT, norm TEXT UNIQUE, source_decision_id INTEGER, created_at REAL, active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS patches(id INTEGER PRIMARY KEY, decision_id INTEGER, version_id TEXT, report_path TEXT, created_at REAL);
"""


class BlackBox:
    def __init__(self, path):
        self.path = Path(path); self.path.parent.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()
        self.db = sqlite3.connect(str(self.path), check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        with self.lock: self.db.executescript(SCHEMA)

    def close(self):
        with self.lock: self.db.close()

    @staticmethod
    def snapshot_metrics(sim):
        burning = sum(sim.burning(c) for row in sim.cells for c in row)
        return dict(tick=sim.tick, burning=burning, burned=sum(c.get('burned', 0) > 0 for row in sim.cells for c in row),
                    burnt_people=sum(g.get('burnt', 0) for g in sim.groups.values()),
                    drone_extinguished=sim.suppressed, truck_extinguished=sim.crew_extinguished,
                    people={k: g['status'] for k, g in sim.groups.items()})

    def record_decision(self, sim, payload, run_id, latency, decision, status, reject_reason=''):
        try: blob = zlib.compress(pickle.dumps(copy.deepcopy(sim), protocol=pickle.HIGHEST_PROTOCOL))
        except Exception: blob = None
        with self.lock:
            cur = self.db.execute('INSERT INTO decisions(incident_id,tick,event_type,created_at,payload_json,snapshot_blob,run_id,latency_s,status,decision_json,reject_reason,metrics_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
                (sim.incident_id, sim.tick, payload.get('event_type'), time.time(), json.dumps(payload), blob, run_id, latency, status,
                 json.dumps(decision), reject_reason, json.dumps(self.snapshot_metrics(sim))))
            self.db.commit(); return cur.lastrowid

    def set_status(self, decision_id, status, reject_reason=''):
        with self.lock:
            self.db.execute('UPDATE decisions SET status=?, reject_reason=? WHERE id=?', (status, reject_reason, decision_id)); self.db.commit()

    def finish_outcome(self, decision_id, sim):
        row = self.decision(decision_id)
        if row is None: return None
        before = json.loads(row['metrics_json']); after = self.snapshot_metrics(sim)
        out = dict(elapsed_steps=after['tick'] - before['tick'], newly_burned_cells=after['burned'] - before['burned'],
                   people_burnt=after['burnt_people'] - before['burnt_people'],
                   drone_extinguished=after['drone_extinguished'] - before['drone_extinguished'],
                   truck_extinguished=after['truck_extinguished'] - before['truck_extinguished'],
                   people=after['people'], people_changes={k: (before['people'][k], v) for k, v in after['people'].items() if before['people'].get(k) != v})
        with self.lock:
            self.db.execute('UPDATE decisions SET outcome_json=? WHERE id=?', (json.dumps(out), decision_id)); self.db.commit()
        return out

    def load_snapshot(self, decision_id):
        row = self.decision(decision_id)
        if row is None or row['snapshot_blob'] is None: return None
        return pickle.loads(zlib.decompress(row['snapshot_blob']))

    def decision(self, decision_id):
        with self.lock: row = self.db.execute('SELECT * FROM decisions WHERE id=?', (decision_id,)).fetchone()
        return dict(row) if row else None

    def list_decisions(self, incident_id):
        with self.lock:
            rows = self.db.execute('SELECT d.id,d.tick,d.event_type,d.created_at,d.run_id,d.latency_s,d.status,d.decision_json,d.reject_reason,d.outcome_json,'
                                   's.signals_json,e.result_json,r.text AS reflection,r.diagnosis_json FROM decisions d '
                                   'LEFT JOIN signals s ON s.decision_id=d.id LEFT JOIN evaluations e ON e.decision_id=d.id '
                                   'LEFT JOIN reflections r ON r.decision_id=d.id WHERE d.incident_id=? ORDER BY d.id', (incident_id,)).fetchall()
        return [dict(r) for r in rows]

    def save_telemetry(self, decision_id, steps, signals):
        with self.lock:
            self.db.execute('DELETE FROM telemetry WHERE decision_id=?', (decision_id,))
            self.db.executemany('INSERT INTO telemetry VALUES(?,?,?,?,?,?,?,?)',
                [(decision_id, s['agent'], i, s['timestamp'], s['reasoning'], s['action'], json.dumps(s['arguments']), json.dumps(s['outcome'])) for i, s in enumerate(steps)])
            self.db.execute('INSERT OR REPLACE INTO signals VALUES(?,?)', (decision_id, json.dumps(signals))); self.db.commit()

    def telemetry(self, decision_id):
        with self.lock: rows = self.db.execute('SELECT * FROM telemetry WHERE decision_id=? ORDER BY step_index', (decision_id,)).fetchall()
        return [dict(r, arguments=json.loads(r['arguments_json']), outcome=json.loads(r['outcome_json'])) for r in rows]

    def save_evaluation(self, decision_id, result):
        with self.lock: self.db.execute('INSERT OR REPLACE INTO evaluations VALUES(?,?)', (decision_id, json.dumps(result))); self.db.commit()

    def save_reflection(self, decision_id, run_id, text, diagnosis):
        with self.lock: self.db.execute('INSERT OR REPLACE INTO reflections VALUES(?,?,?,?,?)', (decision_id, run_id, text, json.dumps(diagnosis), time.time())); self.db.commit()

    def add_lesson(self, rule, decision_id):
        norm = ' '.join(str(rule).lower().split())
        if not norm: return
        with self.lock:
            self.db.execute('INSERT OR REPLACE INTO lessons(rule,norm,source_decision_id,created_at,active) VALUES(?,?,?,?,1)', (str(rule).strip(), norm, decision_id, time.time())); self.db.commit()

    def active_lessons(self, limit=5):
        with self.lock: rows = self.db.execute('SELECT rule FROM lessons WHERE active=1 ORDER BY id DESC LIMIT ?', (limit,)).fetchall()
        return [r['rule'] for r in rows]

    def save_patch(self, decision_id, version_id, report_path):
        with self.lock: self.db.execute('INSERT INTO patches(decision_id,version_id,report_path,created_at) VALUES(?,?,?,?)', (decision_id, version_id, str(report_path), time.time())); self.db.commit()

    def patches(self):
        with self.lock: rows = self.db.execute('SELECT * FROM patches ORDER BY id DESC').fetchall()
        return [dict(r) for r in rows]
```

- [ ] **Step 4: Run tests**

Run: `python3 -m unittest tests.test_blackbox -v` — Expected: 5 PASS.

- [ ] **Step 5: Commit**

```bash
/usr/bin/git add simulator/blackbox.py tests/test_blackbox.py
/usr/bin/git commit -m "Add SQLite black box recorder for HappyRobot decisions"
```

---

### Task 2: Telemetry harvester and signals

**Files:**
- Create: `simulator/telemetry.py`, `tests/fixtures/scout_loop_run.json`
- Modify: `simulator/happyrobot.py:202-229` (`decide`)
- Test: `tests/test_telemetry.py`

**Interfaces:**
- Consumes: `HappyRobot.tool(name, arguments)`; `HappyRobot.text(result)`.
- Produces: `parse_events(agent, data) -> list[Step]` where `Step = dict(agent, timestamp, reasoning, action, arguments: dict|str, outcome: dict|str)`;
  `harvest(robot, run_id, listing_text=None) -> list[Step]`; `signals(steps, payload) -> dict` with keys
  `repeated_tool_calls, empty_reasoning_steps, agent_seconds, contradictions, terminated_cleanly, steps_per_agent`.
- `HappyRobot.decide` sets `self.last_run_id` and `self.last_listing` (the outputs listing text).

- [ ] **Step 1: Save the reference fixture**

Fetch with MCP `monitor_runs action=outputs run_id=58a5e3dc-08ea-407f-9658-ba2025deedd7 output_id=36f3a221-5f59-43fb-8333-e08dce49e325`, copy the `Data:` JSON object verbatim into `tests/fixtures/scout_loop_run.json` (the object with `name`, `steps`, `events`, `tool_calls`).

- [ ] **Step 2: Write the failing tests**

```python
# tests/test_telemetry.py
import json, unittest
from pathlib import Path
from unittest.mock import patch
from simulator import telemetry
from simulator.happyrobot import HappyRobot

FIX = json.loads((Path(__file__).parent/'fixtures/scout_loop_run.json').read_text())

class TelemetryTests(unittest.TestCase):
    def test_parse_reference_run(self):
        steps = telemetry.parse_events('Scout Agent', FIX)
        self.assertEqual(len(steps), 13)
        self.assertEqual(steps[0]['action'], 'report_scout_plan'); self.assertEqual(steps[-1]['action'], '_terminate')
        self.assertIsInstance(steps[0]['arguments'], dict)

    def test_signals_detect_loop(self):
        steps = telemetry.parse_events('Scout Agent', FIX)
        sig = telemetry.signals(steps, dict(world_state=json.dumps(dict(fleet=[], fire_trucks=[]))))
        self.assertEqual(sig['repeated_tool_calls']['Scout Agent'], 12)
        self.assertTrue(sig['terminated_cleanly']); self.assertGreater(sig['agent_seconds']['Scout Agent'], 240)
        self.assertGreaterEqual(sig['empty_reasoning_steps'], 9); self.assertTrue(sig['loop_detected'])

    def test_contradiction_when_fleet_exists(self):
        steps = [dict(agent='Drone Agent', timestamp='t', reasoning='No extinguisher unit is supplied, so hold.', action='report_to_central', arguments={}, outcome={})]
        payload = dict(world_state=json.dumps(dict(fleet=[dict(role='extinguisher', drone_id='drone-1')], fire_trucks=[])), thermal_detections=json.dumps(dict(burning_cells=[])))
        self.assertIn('claims_no_extinguisher', telemetry.signals(steps, payload)['contradictions'])

    def test_harvest_fetches_agent_outputs_only(self):
        listing = ('## Resultado de la mision\n- Output ID: 11111111-1111-1111-1111-111111111111\n- Status: succeeded\n'
                   '## Drone Agent\n- Output ID: 22222222-2222-2222-2222-222222222222\n- Status: succeeded\n'
                   '## Scout Agent\n- Output ID: 33333333-3333-3333-3333-333333333333\n- Status: succeeded\n')
        data = 'Data: '+json.dumps(dict(name='Drone Agent', steps=1, events=json.dumps([dict(timestamp='t', reasoning='r', action='report_to_central', arguments='{}', outcome='')])))
        h = HappyRobot()
        with patch.object(h, 'tool', return_value={'content': [{'text': data}]}) as call:
            steps = telemetry.harvest(h, 'run', listing)
        self.assertEqual(call.call_count, 2); self.assertEqual({s['agent'] for s in steps}, {'Drone Agent'})

    def test_decide_exposes_run_id_and_listing(self):
        run = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'; output = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
        mission = dict(primary_command='hold', mission='m', drone_reason='r', extinguisher_orders=[], scout_orders=[], truck_orders=[])
        answers = [{'content': [{'text': f'Run ID: {run}\nStatus: completed'}]},
                   {'content': [{'text': f'## Edge\nOutput ID: {output}\nStatus: succeeded\nTimestamp: 2026-09-19T12:00:00Z'}]},
                   {'content': [{'text': 'Data: '+json.dumps({'response': mission})}]}]
        h = HappyRobot()
        from tempfile import TemporaryDirectory
        with TemporaryDirectory() as tmp, patch('simulator.happyrobot.ROOT', Path(tmp)), patch.object(h, 'tool', side_effect=answers):
            h.decide({'event_type': 'farmer_call'})
        self.assertEqual(h.last_run_id, run); self.assertIn(output, h.last_listing)
```

- [ ] **Step 3: Run to verify failure** — `python3 -m unittest tests.test_telemetry -v` → `No module named 'simulator.telemetry'`.

- [ ] **Step 4: Modify `HappyRobot.decide`** — in `simulator/happyrobot.py`, add to `__init__`: `self.last_run_id = None; self.last_listing = ''`. In `decide`, after `listing = self.tool('monitor_runs', ...)` add:

```python
        self.last_run_id = run_id
        self.last_listing = self.text(listing)
```

(the existing `output_id = self.latest_output(self.text(listing))` stays.)

- [ ] **Step 5: Implement `simulator/telemetry.py`**

```python
"""Harvest HappyRobot run telemetry (per-agent reasoning steps) and derive signals."""
import json, re
from datetime import datetime

def _loads(value):
    if isinstance(value, (dict, list)) or value in (None, ''): return value if value is not None else {}
    try: return json.loads(value)
    except (TypeError, ValueError): return value

def parse_events(agent, data):
    events = _loads(data.get('events', [])) if isinstance(data, dict) else []
    if not isinstance(events, list): return []
    return [dict(agent=agent, timestamp=e.get('timestamp', ''), reasoning=e.get('reasoning') or '', action=e.get('action') or '',
                 arguments=_loads(e.get('arguments')), outcome=_loads(e.get('outcome'))) for e in events if isinstance(e, dict)]

def agent_outputs(listing_text):
    """(agent name, output id) for every '## <name> Agent' block in a run outputs listing."""
    found = []
    for block in listing_text.split('## ')[1:]:
        name = block.split('\n', 1)[0].strip()
        oid = re.search(r'Output ID:\s*([0-9a-f-]{36})', block)
        if name.endswith('Agent') and oid: found.append((name, oid.group(1)))
    return found

def harvest(robot, run_id, listing_text=None):
    if listing_text is None:
        listing_text = robot.text(robot.tool('monitor_runs', dict(action='outputs', run_id=run_id)))
    steps = []
    for name, oid in agent_outputs(listing_text):
        text = robot.text(robot.tool('monitor_runs', dict(action='outputs', run_id=run_id, output_id=oid)))
        match = re.search(r'Data:\s*(\{.*)', text, re.S)
        if not match: continue
        try: data = json.JSONDecoder().raw_decode(match.group(1))[0]
        except ValueError: continue
        steps.extend(parse_events(name, data))
    return steps

def _seconds(a, b):
    try: return (datetime.fromisoformat(b.replace('Z', '+00:00')) - datetime.fromisoformat(a.replace('Z', '+00:00'))).total_seconds()
    except ValueError: return 0.0

def signals(steps, payload):
    per, repeated, seconds = {}, {}, {}
    for s in steps: per.setdefault(s['agent'], []).append(s)
    for agent, items in per.items():
        actions = [s['action'] for s in items if s['action'] != '_terminate']
        repeated[agent] = sum(1 for a, b in zip(actions, actions[1:]) if a == b)
        seconds[agent] = round(_seconds(items[0]['timestamp'], items[-1]['timestamp']), 1)
    world = _loads(payload.get('world_state', '{}')) or {}
    thermal = _loads(payload.get('thermal_detections', '{}')) or {}
    text = ' '.join(s['reasoning'].lower() for s in steps)
    contradictions = []
    if world.get('fleet') and any(v.get('role') == 'extinguisher' for v in world['fleet']) and re.search(r'no (authoritative )?extinguisher', text): contradictions.append('claims_no_extinguisher')
    if world.get('fire_trucks') and re.search(r'no (authoritative )?(fire_trucks|truck)', text): contradictions.append('claims_no_truck')
    if not thermal.get('burning_cells') and re.search(r'confirmed fire|fire is confirmed', text): contradictions.append('claims_confirmed_fire')
    return dict(steps_per_agent={a: len(v) for a, v in per.items()}, repeated_tool_calls=repeated,
                empty_reasoning_steps=sum(1 for s in steps if not s['reasoning'].strip() and s['action'] != '_terminate'),
                agent_seconds=seconds, contradictions=contradictions,
                terminated_cleanly=bool(steps) and steps[-1]['action'] == '_terminate',
                loop_detected=any(n >= 2 for n in repeated.values()))
```

- [ ] **Step 6: Run tests** — `python3 -m unittest tests.test_telemetry tests.test_simulator.ParserTests -v` → all PASS.

- [ ] **Step 7: Commit**

```bash
/usr/bin/git add simulator/telemetry.py simulator/happyrobot.py tests/test_telemetry.py tests/fixtures/scout_loop_run.json
/usr/bin/git commit -m "Harvest HappyRobot run telemetry and detect tool-call loops"
```

---

### Task 3: Hindsight oracle

**Files:**
- Create: `simulator/oracle.py`
- Test: `tests/test_oracle.py`

**Interfaces:**
- Consumes: a `Simulation` snapshot (from `BlackBox.load_snapshot`), the actual decision dict (mission shape), optional `signals`.
- Produces: `evaluate(snapshot, actual_decision, signals=None, horizon=16, seeds=(9,10,11), max_joint=20, time_budget=10.0) -> dict` with keys
  `actual_cost, best_cost, regret, actual_rank, candidate_count, best_decision, actual_valid, gap_type, hidden_fire_at_decision, truncated, weights, horizon, seeds`.
  `cost(sim, before) -> float`; `candidates(snapshot) -> list[dict]`; `WEIGHTS` dict.

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_oracle.py
import copy, unittest
from simulator.engine import Simulation
from simulator import oracle

def mission(ext=None, truck=None, scout=None):
    return dict(primary_command=(ext or [{}])[0].get('command', 'hold'), mission='m', drone_reason='r',
                extinguisher_orders=ext or [], scout_orders=scout or [], truck_orders=truck or [])

def hold(sim):
    return mission([dict(drone_id='drone-1', command='hold', target_x=int(sim.drone['x']), target_y=int(sim.drone['y']), district_id='', reason='r')],
                   [dict(truck_id='engine-1', command='continue', reason='r')])

class OracleTests(unittest.TestCase):
    def setUp(self):
        self.sim = Simulation(fleet_counts=dict(scouts=0, extinguishers=1, trucks=1))
        self.sim.set_wind(x=0, y=-2.5); self.sim.ignite(); self.sim.farmer_call()

    def test_candidates_are_valid_and_include_evacuations(self):
        cands = oracle.candidates(self.sim)
        self.assertGreater(len(cands), 3)
        self.assertTrue(any(o['command'] == 'evacuate_farm' for c in cands for o in c['extinguisher_orders']))
        for c in cands:
            s = copy.deepcopy(self.sim); s.apply(c, 'cmd', s.incident_id, s.tick)  # must not raise

    def test_deterministic_cost(self):
        a = oracle.evaluate(self.sim, hold(self.sim), horizon=4, seeds=(9,))
        b = oracle.evaluate(self.sim, hold(self.sim), horizon=4, seeds=(9,))
        self.assertEqual(a['actual_cost'], b['actual_cost'])

    def test_evacuation_beats_hold_when_fire_reaches_farm(self):
        # Move the fire next to the farm so the horizon shows the difference.
        fx, fy = self.sim.farm; s = self.sim
        for x, y in [(fx-3, fy), (fx-2, fy), (fx-2, fy+1)]: s.cells[y][x].update(heat=.6, age=0, fuel=1., terrain='field')
        s.observe()
        result = oracle.evaluate(s, hold(s), horizon=12, seeds=(9,))
        self.assertGreater(result['regret'], 0)
        self.assertTrue(any(o['command'] == 'evacuate_farm' for o in result['best_decision']['extinguisher_orders']) or
                        any(o['command'].startswith('evacuate') for o in result['best_decision']['scout_orders']))

    def test_hidden_fire_yields_information_gap(self):
        s = self.sim; x, y = 30, 23
        s.cells[y][x].update(heat=.5, age=0)  # hidden: far from every sensor
        result = oracle.evaluate(s, hold(s), horizon=8, seeds=(9,))
        self.assertTrue(result['hidden_fire_at_decision'])
        if result['regret'] > oracle.JUDGEMENT_THRESHOLD: self.assertEqual(result['gap_type'], 'information')

    def test_invalid_actual_is_execution_gap(self):
        bad = mission([dict(drone_id='drone-1', command='contain', target_x=5, target_y=5, district_id='', reason='r')], [dict(truck_id='engine-1', command='continue', reason='r')])
        result = oracle.evaluate(self.sim, bad, horizon=2, seeds=(9,))
        self.assertFalse(result['actual_valid']); self.assertEqual(result['gap_type'], 'execution')

    def test_loop_signal_is_execution_gap(self):
        result = oracle.evaluate(self.sim, hold(self.sim), signals=dict(loop_detected=True), horizon=2, seeds=(9,))
        self.assertEqual(result['gap_type'], 'execution')
```

- [ ] **Step 2: Run to verify failure** — `python3 -m unittest tests.test_oracle -v` → `No module named 'simulator.oracle'`.

- [ ] **Step 3: Implement `simulator/oracle.py`**

```python
"""Hindsight oracle: replays a frozen decision state with ground truth to grade the
actual decision against a bounded set of alternatives. It grades, it never decides."""
import copy, itertools, math, random, time

WEIGHTS = dict(people_burnt=1000., unwarned_downwind=50., blocked=20., burned=5., extinguished=-3.)
JUDGEMENT_THRESHOLD = 100.
SECTOR_COS = 0.7

def _downwind_urgency(sim, group):
    fires = sim.fire_points() or ([sim.report] if sim.called else [])
    strength = math.hypot(*sim.wind)
    for x, y in fires:
        dx, dy = group['x'] - x, group['y'] - y; d = math.hypot(dx, dy)
        if d <= 8: return 1.
        if strength and d and (dx*sim.wind[0] + dy*sim.wind[1]) / (d*strength) >= SECTOR_COS: return 1. if sim.fire_points() else .2
    return 0.

def cost(sim, before):
    after = dict(burned=sum(c.get('burned', 0) > 0 for row in sim.cells for c in row), burnt=sum(g.get('burnt', 0) for g in sim.groups.values()),
                 ext=sim.suppressed + sim.crew_extinguished)
    unwarned = sum(g['count']/1000. * _downwind_urgency(sim, g) for g in sim.groups.values() if g['status'] == 'unwarned')
    blocked = sum(g['status'] == 'blocked' for g in sim.groups.values())
    return round(WEIGHTS['people_burnt']*(after['burnt']-before['burnt']) + WEIGHTS['unwarned_downwind']*unwarned + WEIGHTS['blocked']*blocked
                 + WEIGHTS['burned']*(after['burned']-before['burned']) + WEIGHTS['extinguished']*(after['ext']-before['ext']), 3)

def _before(sim):
    return dict(burned=sum(c.get('burned', 0) > 0 for row in sim.cells for c in row), burnt=sum(g.get('burnt', 0) for g in sim.groups.values()), ext=sim.suppressed + sim.crew_extinguished)

def _order(drone, command, x, y, district=''):
    return dict(drone_id=drone['drone_id'], command=command, target_x=int(x), target_y=int(y), district_id=district, reason='oracle candidate')

def _vehicle_options(sim):
    sim.observe()
    unwarned = [(k, g) for k, g in sim.groups.items() if g['status'] == 'unwarned']
    strength = math.hypot(*sim.wind)
    leading = sorted(sim.observation, key=lambda c: -(c['x']*sim.wind[0] + c['y']*sim.wind[1]))[:2] if strength else sim.observation[:2]
    per = []
    for d in sim.extinguishers:
        opts = [_order(d, 'hold', d['x'], d['y'])]
        opts += [_order(d, 'scout', p['x'], p['y']) for p in sim.smoke_scout_positions()[:3]]
        opts += [_order(d, 'contain', p['x'], p['y']) for p in sim.safe_drone_positions(d)[:3]]
        opts += [_order(d, 'evacuate_farm' if g['kind'] == 'farm' else 'evacuate_town', *g['home'], k) for k, g in unwarned]
        per.append(('extinguisher_orders', opts))
    for t in sim.trucks:
        opts = [dict(truck_id=t['truck_id'], command='continue', target_x=0, target_y=0, reason='oracle candidate')]
        targets = [(c['x'], c['y']) for c in leading] or ([sim.report] if sim.called else [])
        opts += [dict(truck_id=t['truck_id'], command='attack_sector', target_x=int(x), target_y=int(y), reason='oracle candidate') for x, y in targets]
        per.append(('truck_orders', opts))
    for s in sim.scouts:
        rx, ry = sim.report
        ring = [[rx-4, ry], [rx, ry+4], [rx+4, ry]]
        opts = [dict(drone_id=s['drone_id'], command='continue', waypoints=[], reason='oracle candidate'),
                dict(drone_id=s['drone_id'], command='patrol', waypoints=[[max(0, min(sim.width-1, x)), max(0, min(sim.height-1, y))] for x, y in ring], reason='oracle candidate')]
        opts += [dict(drone_id=s['drone_id'], command='evacuate_farm' if g['kind'] == 'farm' else 'evacuate_town', district_id=k, waypoints=[], reason='oracle candidate') for k, g in unwarned]
        per.append(('scout_orders', opts))
    return per

def _assemble(parts):
    dec = dict(mission='oracle candidate', drone_reason='oracle candidate', extinguisher_orders=[], scout_orders=[], truck_orders=[])
    for key, order in parts: dec[key].append(order)
    dec['primary_command'] = dec['extinguisher_orders'][0]['command'] if dec['extinguisher_orders'] else 'hold'
    return dec

def _valid(sim, decision):
    try: s = copy.deepcopy(sim); s.apply(decision, 'oracle', s.incident_id, s.tick); return True
    except (ValueError, KeyError, TypeError, StopIteration): return False

def candidates(sim, max_joint=20):
    per = _vehicle_options(copy.deepcopy(sim))
    if not per: return []
    combos = itertools.product(*[[(key, o) for o in opts] for key, opts in per])
    out, seen = [], set()
    for parts in itertools.islice(combos, 400):
        dec = _assemble(parts); sig = repr(sorted((k, repr(v)) for k, v in dec.items() if k.endswith('_orders')))
        if sig in seen or not _valid(sim, dec): continue
        seen.add(sig); out.append(dec)
    return out

def rollout(sim, decision, horizon, seed):
    s = copy.deepcopy(sim); s.rng = random.Random(seed); s.suppression_rng = random.Random(seed+1)
    before = _before(s)
    s.apply(decision, f'oracle-{seed}', s.incident_id, s.tick); s.step(horizon)
    return cost(s, before)

def _hidden_fire(sim):
    known = {(c['x'], c['y']) for c in sim.memory.values() if c['burning']}
    return [p for p in sim.fire_points() if p not in known]

def _rank_by_single(sim, decisions, horizon, seed):
    scored = [(rollout(sim, d, horizon, seed), i) for i, d in enumerate(decisions)]
    return [decisions[i] for _, i in sorted(scored, key=lambda t: t[0])]

def evaluate(snapshot, actual, signals=None, horizon=16, seeds=(9, 10, 11), max_joint=20, time_budget=10.0):
    start = time.monotonic(); signals = signals or {}
    sim = copy.deepcopy(snapshot); hidden = _hidden_fire(sim)
    actual_valid = _valid(sim, actual)
    pool = candidates(sim)
    truncated = False
    if len(pool) > max_joint:
        pool = _rank_by_single(sim, pool, min(horizon, 6), seeds[0])[:max_joint]; truncated = True
    def score(dec):
        return round(sum(rollout(sim, dec, horizon, s) for s in seeds) / len(seeds), 3)
    results = []
    for dec in pool:
        if time.monotonic() - start > time_budget: truncated = True; break
        results.append((score(dec), dec))
    actual_cost = score(actual) if actual_valid else None
    results.sort(key=lambda t: t[0])
    best_cost, best = results[0] if results else (actual_cost, actual)
    if actual_valid and (best_cost is None or actual_cost < best_cost): best_cost, best = actual_cost, actual
    regret = round(actual_cost - best_cost, 3) if actual_valid and best_cost is not None else None
    rank = 1 + sum(1 for c, _ in results if actual_valid and c < actual_cost) if actual_valid else None
    if not actual_valid or signals.get('loop_detected') or not signals.get('terminated_cleanly', True): gap = 'execution'
    elif regret is None or regret <= JUDGEMENT_THRESHOLD: gap = 'none'
    elif hidden and _needs_hidden(best, hidden, sim): gap = 'information'
    else: gap = 'judgement'
    return dict(actual_cost=actual_cost, best_cost=best_cost, regret=regret, actual_rank=rank, candidate_count=len(results)+int(actual_valid),
                best_decision=best, actual_valid=actual_valid, gap_type=gap, hidden_fire_at_decision=[list(p) for p in hidden[:20]],
                truncated=truncated, weights=WEIGHTS, horizon=horizon, seeds=list(seeds), elapsed_s=round(time.monotonic()-start, 2))

def _needs_hidden(best, hidden, sim):
    """True when the best decision's targets sit near hidden fire and away from any known fire."""
    known = [(c['x'], c['y']) for c in sim.memory.values() if c['burning']]
    targets = [(o.get('target_x'), o.get('target_y')) for k in ('extinguisher_orders', 'truck_orders') for o in best.get(k, []) if o.get('command') not in ('hold', 'continue')]
    targets += [tuple(sim.groups[o['district_id']]['home']) for o in best.get('scout_orders', []) if o.get('district_id') in sim.groups]
    for t in targets:
        if t[0] is None: continue
        near_hidden = min(math.dist(t, h) for h in hidden) <= 12
        near_known = known and min(math.dist(t, k) for k in known) <= 12
        if near_hidden and not near_known: return True
    return False
```

- [ ] **Step 4: Run tests** — `python3 -m unittest tests.test_oracle -v` → 6 PASS. If `test_evacuation_beats_hold...` fails because fire burns out before reaching the farm, raise the seeded cells' `heat` to `.9` and add `(fx-1, fy)`; the test asserts direction, not a magnitude.

- [ ] **Step 5: Commit**

```bash
/usr/bin/git add simulator/oracle.py tests/test_oracle.py
/usr/bin/git commit -m "Add hindsight oracle grading decisions by regret and gap type"
```

---

### Task 4: Reflection workflow and client

**Files:**
- Create: `simulator/reflection.py`
- Test: `tests/test_reflection.py`
- Platform: new workflow "Post-mortem Los Panaderos" (development).

**Interfaces:**
- Consumes: `HappyRobot.tool`, `HappyRobot.text`, `HappyRobot.decisions`-style parsing (reuse `HappyRobot.latest_output`).
- Produces: `build_payload(record, steps, signals, evaluation, prompt_excerpt='') -> dict` (strings only),
  `reflect(robot, payload, timeout=240) -> (text, diagnosis: dict, run_id)`; constants `REFLECTION_WORKFLOW`, `DIAGNOSIS_NODE`.
  Diagnosis keys: `gap_type, root_cause, evidence_step_indexes, prompt_section, proposed_rule, proposed_prompt_patch, confidence`.

- [ ] **Step 1: Create the workflow via MCP (agent does this, record IDs in code)**

1. `list_integrations search='webhook'` → Predefined Webhook event id; `list_integrations search='reasoning'` or `'agent'` → Reasoning Agent event id; also the AI Extract / output node used by `Resultado de la mision` (inspect with `get_node_details` on persistent id `01a0bad1-9191-7f3d-8200-f4e2e34ba5a1`).
2. `create_workflow name='Post-mortem Los Panaderos'` with inline nodes:
   - 0: Predefined Webhook, fields `decision_record, telemetry_steps, signals, oracle_result, prompt_excerpt` (string).
   - 1: Reasoning Agent "Reflexión" with tool `submit_diagnosis` (params above; response message: `"Diagnóstico recibido y registrado. Tu tarea ha terminado: no vuelvas a llamar a submit_diagnosis; finaliza ahora."`). Prompt (Spanish): role = auditor de decisiones de un simulador de incendios; inputs `{{0.decision_record}}`, `{{0.telemetry_steps}}`, `{{0.signals}}`, `{{0.oracle_result}}`, `{{0.prompt_excerpt}}`; instructions: identificar la brecha (execution/information/judgement/none) apoyándose en el oráculo, citar los índices de pasos de razonamiento que la evidencian, formular una `proposed_rule` de una frase accionable para el agente operativo, y si `confidence>=0.7` un `proposed_prompt_patch` para una `prompt_section` concreta; escribir reflexión ≤200 palabras en castellano; llamar a `submit_diagnosis` exactamente una vez y terminar. El oráculo es retrospectivo (conoce fuego oculto): una brecha `information` no es culpa del agente.
   - 2: Output node mirroring `Resultado de la mision` exposing `reflection` and the diagnosis fields.
3. `fix_broken_vars`, `manage_versions publish` to development. Record the workflow UUID and the output node's **persistent id** as `REFLECTION_WORKFLOW` and `DIAGNOSIS_NODE` in `simulator/reflection.py`.
4. Test once live with `trigger_run` using the reference fixture payload (`tests/fixtures/scout_loop_run.json`) and confirm a diagnosis is returned. Note the run id in `docs/demo-validation.md` (Task 8).

- [ ] **Step 2: Write the failing tests**

```python
# tests/test_reflection.py
import json, unittest
from unittest.mock import patch
from simulator import reflection
from simulator.happyrobot import HappyRobot

class ReflectionTests(unittest.TestCase):
    def test_payload_is_strings_and_bounded(self):
        steps = [dict(agent='Scout Agent', timestamp='t', reasoning='x'*5000, action='report_scout_plan', arguments={}, outcome={})]*20
        p = reflection.build_payload(dict(id=1, tick=5, event_type='farmer_call', decision_json='{}', status='applied', reject_reason='', latency_s=280.0),
                                     steps, dict(loop_detected=True), dict(regret=0, gap_type='execution'), 'ONE-SHOT TASK...')
        for v in p.values(): self.assertIsInstance(v, str)
        self.assertLess(len(p['telemetry_steps']), 30000)

    def test_reflect_parses_diagnosis(self):
        run = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'; out = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
        diag = dict(reflection='El agente repitió la llamada.', gap_type='execution', root_cause='tool response empty', evidence_step_indexes=[1, 2],
                    prompt_section='ONE-SHOT TASK', proposed_rule='Treat an empty tool result as success.', proposed_prompt_patch='', confidence=0.9)
        answers = [{'content': [{'text': f'Run ID: {run}\nStatus: completed'}]},
                   {'content': [{'text': f'## Diagnostico\n- Output ID: {out}\n- Status: succeeded\n- Timestamp: 2026-09-20T00:00:00Z'}]},
                   {'content': [{'text': 'Data: '+json.dumps(diag)}]}]
        h = HappyRobot()
        with patch.object(h, 'tool', side_effect=answers):
            text, diagnosis, rid = reflection.reflect(h, dict(decision_record='{}'))
        self.assertEqual(rid, run); self.assertEqual(diagnosis['gap_type'], 'execution'); self.assertIn('repitió', text)

    def test_malformed_diagnosis_raises(self):
        run = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'; out = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
        answers = [{'content': [{'text': f'Run ID: {run}\nStatus: completed'}]},
                   {'content': [{'text': f'## D\n- Output ID: {out}\n- Status: succeeded\n- Timestamp: 2026-09-20T00:00:00Z'}]},
                   {'content': [{'text': 'Data: {"hello": 1}'}]}]
        h = HappyRobot()
        with patch.object(h, 'tool', side_effect=answers), self.assertRaises(RuntimeError): reflection.reflect(h, {})
```

- [ ] **Step 3: Run to verify failure** — `python3 -m unittest tests.test_reflection -v` → import error.

- [ ] **Step 4: Implement `simulator/reflection.py`**

```python
"""Client for the 'Post-mortem Los Panaderos' HappyRobot workflow."""
import json, re

REFLECTION_WORKFLOW = '<workflow uuid from Step 1>'
DIAGNOSIS_NODE = '<output node persistent id from Step 1>'
REQUIRED = ('gap_type', 'root_cause', 'proposed_rule', 'confidence')
MAX_CHARS = 24000

def _trim(items, budget):
    text = json.dumps(items, ensure_ascii=False)
    while len(text) > budget and items:
        items = [dict(i, reasoning=str(i.get('reasoning', ''))[:400], arguments=str(i.get('arguments', ''))[:300]) for i in items][:max(1, len(items)-2)]
        text = json.dumps(items, ensure_ascii=False)
    return text

def build_payload(record, steps, signals, evaluation, prompt_excerpt=''):
    rec = {k: record.get(k) for k in ('id', 'tick', 'event_type', 'status', 'reject_reason', 'latency_s', 'run_id')}
    rec['decision'] = json.loads(record.get('decision_json') or '{}')
    rec['outcome'] = json.loads(record.get('outcome_json') or 'null')
    ev = dict(evaluation); ev.pop('weights', None)
    return dict(decision_record=json.dumps(rec, ensure_ascii=False)[:MAX_CHARS],
                telemetry_steps=_trim([dict(index=i, **s) for i, s in enumerate(steps)], MAX_CHARS),
                signals=json.dumps(signals, ensure_ascii=False), oracle_result=json.dumps(ev, ensure_ascii=False)[:MAX_CHARS],
                prompt_excerpt=str(prompt_excerpt)[:4000])

def reflect(robot, payload, timeout=240):
    result = robot.tool('trigger_run', dict(workflow_id=REFLECTION_WORKFLOW, environment='development', payload=json.dumps(payload), wait=True), timeout=timeout)
    text = robot.text(result)
    run = re.search(r'Run ID:\s*([0-9a-f-]{36})', text)
    if not run or not re.search(r'Status:\s*completed\b', text): raise RuntimeError('Reflection run did not complete.')
    listing = robot.tool('monitor_runs', dict(action='outputs', run_id=run.group(1), node_id=DIAGNOSIS_NODE))
    output_id = robot.latest_output(robot.text(listing))
    out = robot.text(robot.tool('monitor_runs', dict(action='outputs', run_id=run.group(1), output_id=output_id)))
    match = re.search(r'Data:\s*(\{.*)', out, re.S)
    data = json.JSONDecoder().raw_decode(match.group(1))[0] if match else {}
    if isinstance(data.get('response'), dict): data = data['response']
    if not all(k in data for k in REQUIRED): raise RuntimeError('Reflection returned no structured diagnosis.')
    diagnosis = {k: data.get(k) for k in ('gap_type', 'root_cause', 'evidence_step_indexes', 'prompt_section', 'proposed_rule', 'proposed_prompt_patch', 'confidence')}
    try: diagnosis['confidence'] = float(diagnosis['confidence'] or 0)
    except (TypeError, ValueError): diagnosis['confidence'] = 0.
    return str(data.get('reflection', ''))[:4000], diagnosis, run.group(1)
```

- [ ] **Step 5: Run tests** — PASS (3).

- [ ] **Step 6: Commit**

```bash
/usr/bin/git add simulator/reflection.py tests/test_reflection.py
/usr/bin/git commit -m "Add reflection workflow client for post-mortem diagnoses"
```

---

### Task 5: Healing tiers and lessons in the payload

**Files:**
- Create: `simulator/healing.py`
- Modify: `simulator/engine.py:38-80` (add `self.lessons=[]`), `simulator/engine.py:689-690` (payload adds `lessons_learned=self.lessons`)
- Test: `tests/test_healing.py`

**Interfaces:**
- Consumes: `BlackBox`, `HappyRobot.tool`, diagnosis dict, evaluation dict, `simulator.oracle.evaluate`, `HappyRobot.decisions/normalize`.
- Produces: `class Healer(box, robot, workflow_id, root)` with
  `tier1(decision_id, run_id, diagnosis, evaluation) -> dict`, `tier2(diagnosis) -> dict|None`,
  `tier3(decision_id, diagnosis, evaluation) -> dict|None`, `apply(decision_id, run_id, diagnosis, evaluation) -> dict`;
  `Simulation.lessons: list[str]`; payload key `world_state.lessons_learned`.

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_healing.py
import json, unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch, MagicMock
from simulator.engine import Simulation
from simulator.blackbox import BlackBox
from simulator.healing import Healer

DIAG = dict(gap_type='execution', root_cause='Empty tool result read as failure', evidence_step_indexes=[1], prompt_section='ONE-SHOT TASK',
            proposed_rule='An empty tool result means the report was accepted; terminate.', proposed_prompt_patch='After report_scout_plan returns, terminate even if the result is empty.', confidence=0.9)

class HealingTests(unittest.TestCase):
    def setUp(self):
        self.tmp = TemporaryDirectory(); root = Path(self.tmp.name)
        self.box = BlackBox(root/'bb.sqlite'); self.robot = MagicMock(); self.robot.text = lambda r: r['content'][0]['text']
        self.healer = Healer(self.box, self.robot, 'wf-uuid', root)
        self.sim = Simulation(); self.sim.ignite(); self.sim.farmer_call()
        self.did = self.box.record_decision(self.sim, self.sim.payload(), 'run-1', 1.0, dict(primary_command='hold'), 'applied')
    def tearDown(self): self.box.close(); self.tmp.cleanup()

    def test_tier1_stores_lesson_and_marks_run_critical(self):
        out = self.healer.tier1(self.did, 'run-1', DIAG, dict(regret=0, gap_type='execution'))
        self.assertEqual(self.box.active_lessons(), [DIAG['proposed_rule']])
        args = self.robot.tool.call_args.args
        self.assertEqual(args[0], 'monitor_runs'); self.assertEqual(args[1]['action'], 'mark'); self.assertEqual(args[1]['annotation'], 'critical')
        self.assertEqual(out['annotation'], 'critical')

    def test_tier1_marks_correct_when_no_gap(self):
        self.healer.tier1(self.did, 'run-1', dict(DIAG, gap_type='none', proposed_rule=''), dict(regret=0, gap_type='none'))
        self.assertEqual(self.robot.tool.call_args.args[1]['annotation'], 'correct'); self.assertEqual(self.box.active_lessons(), [])

    def test_tier2_needs_recurrence(self):
        self.assertIsNone(self.healer.tier2(DIAG))
        self.box.save_reflection(self.did, 'r', 't', DIAG)
        did2 = self.box.record_decision(self.sim, self.sim.payload(), 'run-2', 1.0, {}, 'applied'); self.box.save_reflection(did2, 'r2', 't', DIAG)
        self.robot.tool.return_value = {'content': [{'text': 'Northstar created id: ns-1'}]}
        out = self.healer.tier2(DIAG)
        self.assertEqual(self.robot.tool.call_args.args[0], 'manage_northstars'); self.assertIsNotNone(out)

    def test_tier3_forks_patches_and_never_publishes(self):
        self.robot.tool.side_effect = lambda name, args, **kw: {'content': [{'text': {
            'manage_versions': 'Forked version\n- ID: ver-2\n- Slug: abc',
            'get_workflow_details': '## Nodes\n- Scout Agent (agent) id: node-1 persistent: pers-1',
            'update_workflow_nodes': 'Updated 1 node', 'fix_broken_vars': 'No broken variables',
            'trigger_run': 'Run ID: cccccccc-cccc-cccc-cccc-cccccccccccc\nStatus: completed',
            'monitor_runs': '## Edge\n- Output ID: dddddddd-dddd-dddd-dddd-dddddddddddd\n- Status: succeeded\n- Timestamp: 2026-09-20T00:00:00Z\nData: '+json.dumps(dict(response=dict(primary_command='hold', mission='m', drone_reason='r', extinguisher_orders=[dict(drone_id='drone-1', command='hold', target_x=12, target_y=32, district_id='', reason='r')], scout_orders=[], truck_orders=[dict(truck_id='engine-1', command='continue', reason='r')])))}[name]}]}
        with patch('simulator.healing.oracle.evaluate', return_value=dict(actual_cost=1., best_cost=0., regret=1., gap_type='none')):
            report = self.healer.tier3(self.did, DIAG, dict(regret=250., best_cost=0., actual_cost=250.))
        names = [c.args[0] for c in self.robot.tool.call_args_list]
        self.assertIn('manage_versions', names); self.assertIn('update_workflow_nodes', names)
        self.assertFalse(any(c.args[1].get('action') == 'publish' for c in self.robot.tool.call_args_list if c.args[0] == 'manage_versions'))
        self.assertTrue(Path(report['report_path']).exists()); self.assertEqual(report['version_id'], 'ver-2')

    def test_tier3_skipped_below_confidence(self):
        self.assertIsNone(self.healer.tier3(self.did, dict(DIAG, confidence=0.5), dict(regret=250.)))

    def test_payload_carries_lessons(self):
        self.sim.lessons = ['Lesson A']
        world = json.loads(self.sim.payload()['world_state'])
        self.assertEqual(world['lessons_learned'], ['Lesson A'])
```

- [ ] **Step 2: Run to verify failure** — `python3 -m unittest tests.test_healing -v` → import error.

- [ ] **Step 3: Engine changes** — in `Simulation.__init__` after `self.mission = 'Awaiting a report'` add `self.lessons = []`. In `payload()` add to the `known` dict, right after `mission_context=self.mission_context(),`: `lessons_learned=list(self.lessons[:5]),`.

- [ ] **Step 4: Implement `simulator/healing.py`**

```python
"""Three-tier healing: lessons + run annotation (auto), northstars on recurrence (auto),
prompt patch on a forked version with an A/B over recorded decisions (never published)."""
import json, re, time
from pathlib import Path
from . import oracle
from .happyrobot import HappyRobot

ANNOTATION = dict(execution='critical', judgement='incorrect', information='correct', none='correct', unknown='correct')
PATCH_CONFIDENCE = 0.7
RECURRENCE = 2


class Healer:
    def __init__(self, box, robot, workflow_id, root):
        self.box, self.robot, self.workflow_id, self.root = box, robot, workflow_id, Path(root)

    def apply(self, decision_id, run_id, diagnosis, evaluation):
        report = dict(tier1=self.tier1(decision_id, run_id, diagnosis, evaluation))
        try: report['tier2'] = self.tier2(diagnosis)
        except Exception as exc: report['tier2'] = dict(error=str(exc)[:300])
        try: report['tier3'] = self.tier3(decision_id, diagnosis, evaluation)
        except Exception as exc: report['tier3'] = dict(error=str(exc)[:300])
        return report

    def tier1(self, decision_id, run_id, diagnosis, evaluation):
        gap = diagnosis.get('gap_type') or evaluation.get('gap_type') or 'unknown'
        rule = (diagnosis.get('proposed_rule') or '').strip()
        if rule and gap in ('execution', 'judgement'): self.box.add_lesson(rule, decision_id)
        annotation = ANNOTATION.get(gap, 'correct')
        args = dict(action='mark', run_id=run_id, annotation=annotation)
        if annotation != 'correct': args['correction'] = f"[{gap}] {diagnosis.get('root_cause', '')}"[:1000]
        if run_id: self.robot.tool('monitor_runs', args)
        return dict(annotation=annotation, lesson=rule if rule else None)

    def _recurrences(self, diagnosis):
        key = (diagnosis.get('gap_type'), (diagnosis.get('prompt_section') or '').strip().lower())
        with self.box.lock: rows = self.box.db.execute('SELECT diagnosis_json FROM reflections').fetchall()
        return sum(1 for r in rows if (lambda d: (d.get('gap_type'), (d.get('prompt_section') or '').strip().lower()))(json.loads(r['diagnosis_json'])) == key)

    def tier2(self, diagnosis):
        if diagnosis.get('gap_type') not in ('execution', 'judgement') or self._recurrences(diagnosis) < RECURRENCE: return None
        title = f"No repetir: {diagnosis.get('prompt_section') or diagnosis.get('gap_type')}"[:120]
        description = f"{diagnosis.get('root_cause', '')}. Regla: {diagnosis.get('proposed_rule', '')}"[:1500]
        result = self.robot.tool('manage_northstars', dict(action='create', workflow_id=self.workflow_id, title=title, description=description))
        return dict(title=title, result=self.robot.text(result)[:500])

    def tier3(self, decision_id, diagnosis, evaluation):
        patch = (diagnosis.get('proposed_prompt_patch') or '').strip()
        if not patch or float(diagnosis.get('confidence') or 0) < PATCH_CONFIDENCE: return None
        details = self.robot.text(self.robot.tool('get_workflow_details', dict(workflow_id=self.workflow_id)))
        live = re.search(r'- ID:\s*([0-9a-f-]{36})', details)
        fork = self.robot.text(self.robot.tool('manage_versions', dict(action='fork', workflow_id=self.workflow_id, version_id=live.group(1) if live else None)))
        version = re.search(r'ID:\s*([0-9a-zA-Z-]+)', fork)
        version_id = version.group(1) if version else None
        nodes = self.robot.text(self.robot.tool('get_workflow_details', dict(workflow_id=self.workflow_id, version_id=version_id)))
        section = (diagnosis.get('prompt_section') or '').lower()
        target = 'Scout Agent' if 'scout' in section or 'one-shot' in section else 'Drone Agent'
        node = re.search(rf'{target}.*?persistent:\s*([0-9a-zA-Z-]+)', nodes)
        node_id = node.group(1) if node else None
        self.robot.tool('update_workflow_nodes', dict(action='update', workflow_id=self.workflow_id, version_id=version_id,
                                                      nodes=[dict(persistent_id=node_id, prompt_append=patch)]))
        self.robot.tool('fix_broken_vars', dict(workflow_id=self.workflow_id, version_id=version_id))
        ab = self._ab_test(decision_id, version_id)
        path = self.root/'.runtime'/'patches'/f"{time.strftime('%Y%m%d-%H%M%S')}-decision{decision_id}.md"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(self._report(diagnosis, evaluation, version_id, ab, patch))
        self.box.save_patch(decision_id, version_id, path)
        return dict(version_id=version_id, report_path=str(path), ab=ab, published=False)

    def _ab_test(self, decision_id, version_id):
        row = self.box.decision(decision_id); snapshot = self.box.load_snapshot(decision_id)
        if row is None or snapshot is None: return dict(skipped='no snapshot')
        payload = json.loads(row['payload_json'])
        result = self.robot.tool('trigger_run', dict(workflow_id=self.workflow_id, version_id=version_id, environment='development', payload=json.dumps(payload), wait=True), timeout=330)
        text = self.robot.text(result)
        run = re.search(r'Run ID:\s*([0-9a-f-]{36})', text)
        if not run: return dict(skipped='patched run failed')
        listing = self.robot.text(self.robot.tool('monitor_runs', dict(action='outputs', run_id=run.group(1))))
        output_id = HappyRobot.latest_output(listing)
        out = self.robot.tool('monitor_runs', dict(action='outputs', run_id=run.group(1), output_id=output_id))
        choices = HappyRobot.decisions(out)
        if not choices: return dict(skipped='no decision in patched run')
        new = HappyRobot.normalize(choices[-1])
        before = json.loads(self.box.db.execute('SELECT result_json FROM evaluations WHERE decision_id=?', (decision_id,)).fetchone()[0]) if self.box.db.execute('SELECT 1 FROM evaluations WHERE decision_id=?', (decision_id,)).fetchone() else {}
        after = oracle.evaluate(snapshot, new, horizon=16, seeds=(9,))
        return dict(run_id=run.group(1), regret_before=before.get('regret'), regret_after=after.get('regret'), new_decision=new)

    @staticmethod
    def _report(diagnosis, evaluation, version_id, ab, patch):
        return (f"# Propuesta de parche (no publicada)\n\nVersión bifurcada: `{version_id}`\n\n## Diagnóstico\n- Brecha: {diagnosis.get('gap_type')}\n"
                f"- Causa raíz: {diagnosis.get('root_cause')}\n- Sección: {diagnosis.get('prompt_section')}\n- Confianza: {diagnosis.get('confidence')}\n\n"
                f"## Parche propuesto\n\n```\n{patch}\n```\n\n## A/B sobre la decisión grabada\n- Regret antes: {evaluation.get('regret')}\n- Regret después: {ab.get('regret_after')}\n"
                f"- Run parcheada: {ab.get('run_id')}\n\nPublicar es una decisión humana. Revisa la versión en el editor antes de hacerlo.\n")
```

If `update_workflow_nodes` in the live MCP schema does not accept `prompt_append`, read the node with `get_node_details` and send the full `prompt` field with the patch appended (adjust when executing Task 4 Step 1; keep the test asserting only that `update_workflow_nodes` was called).

- [ ] **Step 5: Run tests** — `python3 -m unittest tests.test_healing tests.test_simulator -v` → PASS.

- [ ] **Step 6: Commit**

```bash
/usr/bin/git add simulator/healing.py simulator/engine.py tests/test_healing.py
/usr/bin/git commit -m "Add three-tier healing with lessons, annotations, northstars and gated prompt patches"
```

---

### Task 6: Analysis orchestrator and controller hooks

**Files:**
- Create: `simulator/analysis.py`
- Modify: `simulator/server.py:39-60` (`Controller.__init__`), `:117-156` (`_decide`), `:189-203` (`reset`), `:267-290` (`do_GET`)
- Test: `tests/test_analysis.py`

**Interfaces:**
- Consumes: everything above.
- Produces: `class Analyst(box, robot, sim_lessons_setter, log)` with `analyse(decision_id, payload, run_id, listing) -> dict` (synchronous; the controller runs it in a thread);
  `Controller.box`, `Controller.analyst`, `Controller.last_decision_id`, `Controller.postmortem() -> dict`; `GET /api/postmortem`.

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_analysis.py
import json, time, unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch, MagicMock
from simulator.engine import Simulation
from simulator.blackbox import BlackBox
from simulator.analysis import Analyst

def hold(sim):
    return dict(primary_command='hold', mission='m', drone_reason='r', extinguisher_orders=[dict(drone_id='drone-1', command='hold', target_x=int(sim.drone['x']), target_y=int(sim.drone['y']), district_id='', reason='r')], scout_orders=[], truck_orders=[dict(truck_id='engine-1', command='continue', reason='r')])

class AnalystTests(unittest.TestCase):
    def test_analyse_runs_pipeline_and_stores_everything(self):
        with TemporaryDirectory() as tmp:
            box = BlackBox(Path(tmp)/'bb.sqlite'); sim = Simulation(fleet_counts=dict(scouts=0, extinguishers=1, trucks=1)); sim.ignite(); sim.farmer_call()
            payload = sim.payload('farmer_call'); did = box.record_decision(sim, payload, 'run-1', 1.0, hold(sim), 'applied')
            lessons = []; logs = []
            analyst = Analyst(box, MagicMock(), lambda l: lessons.extend(l), lambda *a, **k: logs.append(a))
            steps = [dict(agent='Drone Agent', timestamp='2026-09-20T00:00:00Z', reasoning='r', action='report_to_central', arguments={}, outcome={}), dict(agent='Drone Agent', timestamp='2026-09-20T00:00:05Z', reasoning='DONE', action='_terminate', arguments={}, outcome='')]
            diag = dict(gap_type='judgement', root_cause='x', evidence_step_indexes=[0], prompt_section='s', proposed_rule='Prefer evacuation under strong wind.', proposed_prompt_patch='', confidence=0.8)
            with patch('simulator.analysis.telemetry.harvest', return_value=steps), patch('simulator.analysis.reflection.reflect', return_value=('texto', diag, 'run-r')), \
                 patch('simulator.analysis.Healer.apply', return_value=dict(tier1=dict(annotation='incorrect'))):
                out = analyst.analyse(did, payload, 'run-1', '## Drone Agent\n- Output ID: 11111111-1111-1111-1111-111111111111\n- Status: succeeded')
            row = box.list_decisions(sim.incident_id)[0]
            self.assertIsNotNone(row['result_json']); self.assertEqual(row['reflection'], 'texto'); self.assertIn('regret', json.loads(row['result_json']))
            self.assertEqual(lessons, ['Prefer evacuation under strong wind.']); self.assertEqual(out['diagnosis']['gap_type'], 'judgement')
            box.close()

    def test_failures_are_logged_not_raised(self):
        with TemporaryDirectory() as tmp:
            box = BlackBox(Path(tmp)/'bb.sqlite'); sim = Simulation(); sim.ignite(); sim.farmer_call()
            did = box.record_decision(sim, sim.payload(), 'run-1', 1.0, hold(sim), 'applied'); logs = []
            analyst = Analyst(box, MagicMock(), lambda l: None, lambda *a, **k: logs.append(a))
            with patch('simulator.analysis.telemetry.harvest', side_effect=RuntimeError('boom')):
                out = analyst.analyse(did, sim.payload(), 'run-1', '')
            self.assertIn('telemetry_error', out); self.assertTrue(logs); box.close()

class ControllerHookTests(unittest.TestCase):
    def test_decide_records_and_schedules_analysis(self):
        from simulator.server import Controller
        with TemporaryDirectory() as tmp, patch('simulator.server.RUNTIME', Path(tmp)):
            c = Controller(); c.stop.set(); c.sim.ignite(); c.sim.farmer_call()
            try:
                c.robot.last_run_id = 'run-x'; c.robot.last_listing = ''
                with patch.object(c.robot, 'decide', return_value=(hold(c.sim), 'evidence')), patch.object(c.analyst, 'analyse', return_value={}) as an:
                    c._decide(c.sim.payload('farmer_call'), c.sim.tick)
                    deadline = time.monotonic()+2
                    while not an.called and time.monotonic() < deadline: time.sleep(.01)
                rows = c.box.list_decisions(c.sim.incident_id)
                self.assertEqual(len(rows), 1); self.assertEqual(rows[0]['status'], 'applied'); self.assertEqual(rows[0]['run_id'], 'run-x')
                self.assertTrue(an.called); self.assertIn('decisions', c.postmortem())
            finally: c.stop.set(); c.robot.close(); c.box.close()

    def test_rejected_decision_recorded_as_rejected(self):
        from simulator.server import Controller
        with TemporaryDirectory() as tmp, patch('simulator.server.RUNTIME', Path(tmp)):
            c = Controller(); c.stop.set(); c.sim.ignite(); c.sim.farmer_call()
            try:
                bad = hold(c.sim); bad['extinguisher_orders'][0].update(command='contain', target_x=65, target_y=43)
                with patch.object(c.robot, 'decide', return_value=(bad, 'e')), patch.object(c, 'request_decision'), patch.object(c.analyst, 'analyse', return_value={}):
                    c._decide(c.sim.payload(), c.sim.tick)
                self.assertEqual(c.box.list_decisions(c.sim.incident_id)[0]['status'], 'rejected')
            finally: c.stop.set(); c.robot.close(); c.box.close()
```

- [ ] **Step 2: Run to verify failure** — import error.

- [ ] **Step 3: Implement `simulator/analysis.py`**

```python
"""Runs the post-decision pipeline: telemetry → oracle → reflection → healing."""
import json
from . import telemetry, oracle, reflection
from .healing import Healer
from .happyrobot import WORKFLOW, ROOT


class Analyst:
    def __init__(self, box, robot, set_lessons, log, workflow_id=WORKFLOW, root=ROOT):
        self.box, self.robot, self.set_lessons, self.log = box, robot, set_lessons, log
        self.healer = Healer(box, robot, workflow_id, root)

    def analyse(self, decision_id, payload, run_id, listing):
        out = dict(decision_id=decision_id)
        steps, signals = [], {}
        try:
            steps = telemetry.harvest(self.robot, run_id, listing or None) if run_id else []
            signals = telemetry.signals(steps, payload); self.box.save_telemetry(decision_id, steps, signals); out['signals'] = signals
        except Exception as exc:
            out['telemetry_error'] = str(exc)[:300]; self.log('system', f'Telemetry unavailable for decision {decision_id}: {exc}'[:300])
        row = self.box.decision(decision_id); evaluation = dict(gap_type='unknown', regret=None)
        try:
            snapshot = self.box.load_snapshot(decision_id)
            if snapshot is not None:
                evaluation = oracle.evaluate(snapshot, json.loads(row['decision_json']), signals)
                if row['status'] != 'applied': evaluation['gap_type'] = 'execution'
            self.box.save_evaluation(decision_id, evaluation); out['evaluation'] = evaluation
        except Exception as exc:
            out['oracle_error'] = str(exc)[:300]; self.log('system', f'Oracle failed for decision {decision_id}: {exc}'[:300])
        try:
            payload_r = reflection.build_payload(row, steps, signals, evaluation)
            text, diagnosis, rid = reflection.reflect(self.robot, payload_r)
            self.box.save_reflection(decision_id, rid, text, diagnosis); out.update(reflection=text, diagnosis=diagnosis)
            self.log('post-mortem', text[:600], gap=diagnosis.get('gap_type'), regret=evaluation.get('regret'))
        except Exception as exc:
            out['reflection_error'] = str(exc)[:300]; self.log('system', f'Reflection unavailable for decision {decision_id}: {exc}'[:300]); return out
        try:
            out['healing'] = self.healer.apply(decision_id, run_id, diagnosis, evaluation)
            self.set_lessons(self.box.active_lessons(5))
        except Exception as exc:
            out['healing_error'] = str(exc)[:300]; self.log('system', f'Healing failed for decision {decision_id}: {exc}'[:300])
        return out
```

- [ ] **Step 4: Controller changes in `simulator/server.py`**

Add imports and a module constant after `ROOT = ...`:

```python
from .blackbox import BlackBox
from .analysis import Analyst
RUNTIME = ROOT / '.runtime'
```

In `Controller.__init__`, after `self.robot = HappyRobot()`:

```python
        self.box = BlackBox(RUNTIME/'blackbox.sqlite')
        self.analyst = Analyst(self.box, self.robot, self._set_lessons, self.sim.log)
        self.last_decision_id = None
        self.sim.lessons = self.box.active_lessons(5)
```

Add methods:

```python
    def _set_lessons(self, lessons):
        with self.lock: self.sim.lessons = list(lessons)

    def _record(self, payload, decision, status, reason=''):
        if self.last_decision_id is not None: self.box.finish_outcome(self.last_decision_id, self.sim)
        self.last_decision_id = self.box.record_decision(self.sim, payload, self.robot.last_run_id, self.latency, decision, status, reason)
        listing = self.robot.last_listing
        threading.Thread(target=self.analyst.analyse, args=(self.last_decision_id, payload, self.robot.last_run_id, listing), daemon=True).start()

    def postmortem(self):
        with self.lock: incident = self.sim.incident_id
        rows = self.box.list_decisions(incident)
        for r in rows:
            for k in ('decision_json', 'outcome_json', 'signals_json', 'result_json', 'diagnosis_json'):
                r[k[:-5]] = json.loads(r.pop(k)) if r.get(k) else None
        return dict(incident_id=incident, decisions=rows, lessons=self.box.active_lessons(5), patches=self.box.patches())
```

In `_decide`: after `self.latency = round(...)` and `self.run_evidence = evidence`, replace `self.sim.apply(...)` with:

```python
                try:
                    self.sim.apply(decision,payload['event_id'],payload['incident_id'],tick)
                except ValueError as exc:
                    self._record(payload, decision, 'rejected', str(exc)[:500]); raise
                self._record(payload, decision, 'applied')
```

In the outer `except Exception as exc:` branch, when `not isinstance(exc, ValueError)` (run failure), add before setting `self.error`: `self.box.record_decision(self.sim, payload, getattr(self.robot,'last_run_id',None), self.latency, {}, 'error', message)`.

In `reset`: after `self.sim = Simulation(fleet_counts=...)` add `self.sim.lessons = self.box.active_lessons(5); self.analyst.log = self.sim.log; self.last_decision_id = None`. In `_clock`, when `self.sim.phase == 'finished'` and `self.last_decision_id is not None`: `self.box.finish_outcome(self.last_decision_id, self.sim); self.last_decision_id=None`.

In `do_GET` add before `/api/state`:

```python
            elif path == '/api/postmortem':
                self.reply(200, controller.postmortem())
```

Also `atexit.register(controller.box.close)`.

- [ ] **Step 5: Run the full suite** — `python3 -m unittest discover -s tests -v` → all PASS (existing `ControllerTests` must still pass; they patch `decide` and `apply`, and `_record` tolerates `last_run_id=None`).

- [ ] **Step 6: Commit**

```bash
/usr/bin/git add simulator/analysis.py simulator/server.py tests/test_analysis.py
/usr/bin/git commit -m "Record every decision and run post-mortem analysis in the background"
```

---

### Task 7: Post-mortem UI panel

**Files:**
- Modify: `simulator/static/index.html:157` (after the technical record `<details>`), `simulator/static/app.js` (I18N `es`/`en` dicts, `poll`), `simulator/static/style.css`
- Test: `tests/test_dashboard.cjs` (add one assertion), `node --check simulator/static/app.js`

- [ ] **Step 1: HTML** — after the `<details>` with `id="inspectLbl"` insert:

```html
  <details id="postmortemPanel"><summary id="postmortemLbl" data-i18n="postmortem">Post-mortem · oráculo y reflexión</summary>
    <p class="muted" data-i18n="postmortemNote">El oráculo evalúa con retrospectiva (conoce el fuego oculto). Nunca decide; sólo mide. Publicar un parche es humano.</p>
    <div id="lessons"></div>
    <table id="postmortem"><thead><tr><th>t</th><th data-i18n="pmActual">Real</th><th data-i18n="pmBest">Mejor</th><th data-i18n="pmRegret">Regret</th><th data-i18n="pmGap">Brecha</th><th>s</th><th data-i18n="pmLoop">Bucle</th></tr></thead><tbody></tbody></table>
  </details>
```

- [ ] **Step 2: JS** — add to `I18N.es`: `postmortem:'Post-mortem · oráculo y reflexión',postmortemNote:'El oráculo evalúa con retrospectiva (conoce el fuego oculto). Nunca decide; sólo mide. Publicar un parche es humano.',pmActual:'Real',pmBest:'Mejor',pmRegret:'Regret',pmGap:'Brecha',pmLoop:'Bucle',pmLessons:'Lecciones activas',pmNone:'Sin decisiones analizadas todavía.'` and English equivalents to `I18N.en` (`'Post-mortem · oracle and reflection'`, `'The oracle grades with hindsight (it knows hidden fire). It never decides; it only measures. Publishing a patch is human.'`, `'Actual'`, `'Best'`, `'Regret'`, `'Gap'`, `'Loop'`, `'Active lessons'`, `'No analysed decisions yet.'`).

Add function and call it from `poll()` every 5th poll (`pollCount%5===0`):

```js
let pollCount=0;
function summarize(d){if(!d)return '—';const o=(d.extinguisher_orders||[]).map(x=>x.command).concat((d.scout_orders||[]).map(x=>x.command),(d.truck_orders||[]).map(x=>x.command));return o.length?o.join('/'):d.primary_command||'—'}
async function renderPostmortem(){
  const t=I18N[lang];let p;try{p=await responseJSON(await fetch('/api/postmortem'),t.serverUnavailable)}catch{return}
  $('lessons').innerHTML=p.lessons.length?`<strong>${t.pmLessons}:</strong><ul>${p.lessons.map(l=>`<li>${escapeHTML(l)}</li>`).join('')}</ul>`:'';
  const body=$('postmortem').querySelector('tbody');
  body.innerHTML=p.decisions.length?p.decisions.map(d=>{const r=d.result||{},s=d.signals||{};
    return `<tr class="gap-${r.gap_type||'pending'}"><td>${d.tick}</td><td>${escapeHTML(summarize(d.decision))}</td><td>${escapeHTML(summarize(r.best_decision))}</td><td>${r.regret??'…'}</td><td>${r.gap_type||'…'}</td><td>${d.latency_s??''}</td><td>${s.loop_detected?'⚠':''}</td></tr>`+
      (d.reflection?`<tr class="reflection"><td colspan="7">${escapeHTML(d.reflection)}</td></tr>`:'')}).join(''):`<tr><td colspan="7">${t.pmNone}</td></tr>`;
}
```

If `escapeHTML` does not exist in `app.js`, add `function escapeHTML(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}`.

- [ ] **Step 3: CSS** — append to `style.css`:

```css
#postmortem{width:100%;border-collapse:collapse;font-size:.8rem}#postmortem th,#postmortem td{padding:.2rem .4rem;border-bottom:1px solid #2a3a2a;text-align:left}
#postmortem tr.gap-execution td{color:#ff8a80}#postmortem tr.gap-judgement td{color:#ffd180}#postmortem tr.gap-information td{color:#80d8ff}#postmortem tr.reflection td{font-style:italic;color:#cfd8c8}
```

- [ ] **Step 4: Dashboard test** — in `tests/test_dashboard.cjs` add an assertion that `index.html` contains `id="postmortem"` and that `app.js` defines `renderPostmortem` (follow the file's existing assertion style).

- [ ] **Step 5: Verify** — `node --check simulator/static/app.js && node --test tests/test_dashboard.cjs`; start `python3 -m simulator.server`, open the page, confirm the panel renders (empty state text) without console errors.

- [ ] **Step 6: Commit**

```bash
/usr/bin/git add simulator/static/index.html simulator/static/app.js simulator/static/style.css tests/test_dashboard.cjs
/usr/bin/git commit -m "Show post-mortem oracle grades, gaps and reflections in the dashboard"
```

---

### Task 8: Reference case end-to-end and documentation

**Files:**
- Modify: `README.md` (new section "Self-healing loop"), `docs/demo-validation.md` (new section)
- Create: `tests/test_reference_case.py`

- [ ] **Step 1: Offline acceptance test**

```python
# tests/test_reference_case.py
import json, unittest
from pathlib import Path
from simulator import telemetry, oracle
from simulator.engine import Simulation

class ReferenceCaseTests(unittest.TestCase):
    def test_scout_loop_is_an_execution_gap(self):
        data = json.loads((Path(__file__).parent/'fixtures/scout_loop_run.json').read_text())
        steps = telemetry.parse_events('Scout Agent', data)
        sim = Simulation(fleet_counts=dict(scouts=1, extinguishers=0, trucks=1)); sim.place_fire(44, 19); sim.set_wind(x=1, y=0); sim.ignite(); sim.farmer_call(); sim.step(5)
        payload = sim.payload('farmer_call'); signals = telemetry.signals(steps, payload)
        self.assertTrue(signals['loop_detected'])
        actual = dict(primary_command='hold', mission='m', drone_reason='r', extinguisher_orders=[], truck_orders=[dict(truck_id='engine-1', command='continue', reason='r')],
                      scout_orders=[dict(drone_id='scout-1', command='patrol', waypoints=[[44, 22], [47, 21], [47, 18], [48, 19]], reason='r')])
        result = oracle.evaluate(sim, actual, signals, horizon=8, seeds=(9,))
        self.assertEqual(result['gap_type'], 'execution')
```

Run it; PASS.

- [ ] **Step 2: Live check (opt-in)** — with `HAPPYROBOT_LIVE_CHECK=1`, run the reflection workflow with `reflection.build_payload` on the fixture and record the run id and the returned `root_cause` in `docs/demo-validation.md` under a new heading "Self-healing — reference case (Scout loop, run 58a5e3dc)". Include: signals (`repeated_tool_calls=12`, `agent_seconds≈250`), `gap_type=execution`, the reflection text, the Tier 1 lesson stored, the annotation applied, and whether a Tier 3 patch report was written (path).

- [ ] **Step 3: README** — add a section after "HappyRobot integration":

```markdown
## Self-healing loop

Every decision is recorded in `.runtime/blackbox.sqlite` with the frozen world the agent saw, the run id, its reasoning steps (from HappyRobot run telemetry) and what happened next. A hindsight oracle replays the frozen state with alternative orders and reports the regret of the actual decision and a gap type: execution (rejected, loop, timeout), information (the better choice needed hidden fire), judgement (the evidence was visible), or none. The "Post-mortem Los Panaderos" workflow reads the reasoning and the oracle result and writes a reflection and a structured diagnosis.

Healing has three tiers. Lessons are injected into the next payload as `world_state.lessons_learned` and runs are annotated on the platform (automatic). Recurring diagnoses become northstars so the platform audits future runs (automatic). Prompt patches are applied to a forked version, A/B-tested against recorded decisions, and written to `.runtime/patches/`; publishing is always human. The oracle grades with ground truth and never takes decisions; weights live in `simulator/oracle.py`.
```

- [ ] **Step 4: Full verification** — `python3 -m unittest discover -s tests -v && node --test tests/test_dashboard.cjs && node --check simulator/static/app.js`.

- [ ] **Step 5: Commit**

```bash
/usr/bin/git add README.md docs/demo-validation.md tests/test_reference_case.py
/usr/bin/git commit -m "Document the self-healing loop and validate the Scout loop reference case"
```

---

## Self-review

- Spec coverage: 5.1→Task 1, 5.2→Task 2, 5.3→Task 3, 5.4→Task 4, 5.5→Task 5, 5.6→Tasks 6–7, §6 data flow→Task 6, §7 errors→Tasks 3 (time budget/truncation), 6 (logging), §8 tests→each task + Task 8, reference case→Tasks 2, 4, 8.
- Type consistency: `Step` dict keys (`agent,timestamp,reasoning,action,arguments,outcome`) used identically in Tasks 2, 4, 6; `evaluate` result keys used by Tasks 5–7; `Healer.apply` signature used by `Analyst`.
- Known adjustment points: MCP argument shapes for `update_workflow_nodes`/`manage_northstars`/`manage_versions fork` must be confirmed against the live schema during Task 4 Step 1 and Task 5; tests mock them and assert only call names and the absence of `publish`.
