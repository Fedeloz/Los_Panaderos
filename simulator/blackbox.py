"""SQLite flight recorder for HappyRobot decisions.

Stores the frozen world the agent saw, its decision, platform telemetry, oracle
grades and reflections. Snapshots are pickled Simulation objects so the oracle can
restore and replay them.
"""
import copy
import json
import pickle
import sqlite3
import threading
import time
import zlib
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
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()
        self.db = sqlite3.connect(str(self.path), check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        with self.lock:
            self.db.executescript(SCHEMA)

    def close(self):
        with self.lock:
            self.db.close()

    @staticmethod
    def snapshot_metrics(sim):
        return dict(tick=sim.tick,
                    burning=sum(sim.burning(c) for row in sim.cells for c in row),
                    burned=sum(c.get('burned', 0) > 0 for row in sim.cells for c in row),
                    burnt_people=sum(g.get('burnt', 0) for g in sim.groups.values()),
                    drone_extinguished=sim.suppressed, truck_extinguished=sim.crew_extinguished,
                    people={k: g['status'] for k, g in sim.groups.items()})

    def record_decision(self, sim, payload, run_id, latency, decision, status, reject_reason=''):
        try:
            blob = zlib.compress(pickle.dumps(copy.deepcopy(sim), protocol=pickle.HIGHEST_PROTOCOL))
        except Exception:
            blob = None
        with self.lock:
            cur = self.db.execute(
                'INSERT INTO decisions(incident_id,tick,event_type,created_at,payload_json,snapshot_blob,run_id,latency_s,status,decision_json,reject_reason,metrics_json) '
                'VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
                (sim.incident_id, sim.tick, payload.get('event_type'), time.time(), json.dumps(payload), blob, run_id, latency,
                 status, json.dumps(decision), reject_reason, json.dumps(self.snapshot_metrics(sim))))
            self.db.commit()
            return cur.lastrowid

    def set_status(self, decision_id, status, reject_reason=''):
        with self.lock:
            self.db.execute('UPDATE decisions SET status=?, reject_reason=? WHERE id=?', (status, reject_reason, decision_id))
            self.db.commit()

    def finish_outcome(self, decision_id, sim):
        row = self.decision(decision_id)
        if row is None:
            return None
        before = json.loads(row['metrics_json'])
        after = self.snapshot_metrics(sim)
        out = dict(elapsed_steps=after['tick']-before['tick'],
                   newly_burned_cells=after['burned']-before['burned'],
                   people_burnt=after['burnt_people']-before['burnt_people'],
                   drone_extinguished=after['drone_extinguished']-before['drone_extinguished'],
                   truck_extinguished=after['truck_extinguished']-before['truck_extinguished'],
                   people=after['people'],
                   people_changes={k: [before['people'].get(k), v] for k, v in after['people'].items() if before['people'].get(k) != v})
        with self.lock:
            self.db.execute('UPDATE decisions SET outcome_json=? WHERE id=?', (json.dumps(out), decision_id))
            self.db.commit()
        return out

    def load_snapshot(self, decision_id):
        row = self.decision(decision_id)
        if row is None or row['snapshot_blob'] is None:
            return None
        return pickle.loads(zlib.decompress(row['snapshot_blob']))

    def decision(self, decision_id):
        with self.lock:
            row = self.db.execute('SELECT * FROM decisions WHERE id=?', (decision_id,)).fetchone()
        return dict(row) if row else None

    def list_decisions(self, incident_id):
        with self.lock:
            rows = self.db.execute(
                'SELECT d.id,d.tick,d.event_type,d.created_at,d.run_id,d.latency_s,d.status,d.decision_json,d.reject_reason,d.outcome_json,'
                's.signals_json,e.result_json,r.text AS reflection,r.diagnosis_json,r.run_id AS reflection_run_id FROM decisions d '
                'LEFT JOIN signals s ON s.decision_id=d.id LEFT JOIN evaluations e ON e.decision_id=d.id '
                'LEFT JOIN reflections r ON r.decision_id=d.id WHERE d.incident_id=? ORDER BY d.id', (incident_id,)).fetchall()
        return [dict(r) for r in rows]

    def save_telemetry(self, decision_id, steps, signals):
        with self.lock:
            self.db.execute('DELETE FROM telemetry WHERE decision_id=?', (decision_id,))
            self.db.executemany('INSERT INTO telemetry VALUES(?,?,?,?,?,?,?,?)',
                [(decision_id, s['agent'], i, s['timestamp'], s['reasoning'], s['action'], json.dumps(s['arguments']), json.dumps(s['outcome']))
                 for i, s in enumerate(steps)])
            self.db.execute('INSERT OR REPLACE INTO signals VALUES(?,?)', (decision_id, json.dumps(signals)))
            self.db.commit()

    def telemetry(self, decision_id):
        with self.lock:
            rows = self.db.execute('SELECT * FROM telemetry WHERE decision_id=? ORDER BY step_index', (decision_id,)).fetchall()
        return [dict(r, arguments=json.loads(r['arguments_json']), outcome=json.loads(r['outcome_json'])) for r in rows]

    def evaluation(self, decision_id):
        with self.lock:
            row = self.db.execute('SELECT result_json FROM evaluations WHERE decision_id=?', (decision_id,)).fetchone()
        return json.loads(row['result_json']) if row else None

    def save_evaluation(self, decision_id, result):
        with self.lock:
            self.db.execute('INSERT OR REPLACE INTO evaluations VALUES(?,?)', (decision_id, json.dumps(result)))
            self.db.commit()

    def save_reflection(self, decision_id, run_id, text, diagnosis):
        with self.lock:
            self.db.execute('INSERT OR REPLACE INTO reflections VALUES(?,?,?,?,?)', (decision_id, run_id, text, json.dumps(diagnosis), time.time()))
            self.db.commit()

    def diagnoses(self):
        with self.lock:
            rows = self.db.execute('SELECT diagnosis_json FROM reflections').fetchall()
        return [json.loads(r['diagnosis_json']) for r in rows]

    def add_lesson(self, rule, decision_id):
        norm = ' '.join(str(rule).lower().split())
        if not norm:
            return
        with self.lock:
            self.db.execute('INSERT OR REPLACE INTO lessons(rule,norm,source_decision_id,created_at,active) VALUES(?,?,?,?,1)',
                            (str(rule).strip(), norm, decision_id, time.time()))
            self.db.commit()

    def active_lessons(self, limit=5):
        with self.lock:
            rows = self.db.execute('SELECT rule FROM lessons WHERE active=1 ORDER BY id DESC LIMIT ?', (limit,)).fetchall()
        return [r['rule'] for r in rows]

    def save_patch(self, decision_id, version_id, report_path):
        with self.lock:
            self.db.execute('INSERT INTO patches(decision_id,version_id,report_path,created_at) VALUES(?,?,?,?)',
                            (decision_id, version_id, str(report_path), time.time()))
            self.db.commit()

    def patches(self):
        with self.lock:
            rows = self.db.execute('SELECT * FROM patches ORDER BY id DESC').fetchall()
        return [dict(r) for r in rows]
