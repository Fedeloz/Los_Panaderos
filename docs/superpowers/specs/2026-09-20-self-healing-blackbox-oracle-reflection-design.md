# Self-healing loop: black box, oracle, reflection — design

**Date:** 2026-09-20
**Branch:** `feature/self-healing-blackbox-oracle-reflection`
**Status:** approved design (approach A, gated healing), pending implementation plan

## 1. Goal

Turn every HappyRobot decision in the Los Panaderos simulator into a measured,
explained and correctable event:

1. **Record** the exact world the agent saw, what it decided, why (platform
   telemetry), and what happened next.
2. **Compute** what the best available decision would have been from the same
   state, and the distance (regret) between the two.
3. **Explain** the gap with an agent that reads the reasoning telemetry and the
   oracle result, and writes a reflection plus a structured diagnosis.
4. **Heal**: feed lessons back into the next decision automatically, annotate and
   audit runs on the platform, and propose prompt patches that are A/B-tested on
   recorded states but published only by a human.

The judging frame is "adaptive, not scripted". Nothing here replaces the agent's
judgement with a formula; the oracle grades decisions after the fact, it never
takes them.

## 2. Reference case

Run `58a5e3dc-08ea-407f-9658-ba2025deedd7` (v25, 2026-09-19 21:23 UTC). The Scout
Agent called `report_scout_plan` **14 times** over 4m45s despite an
"EXACTLY ONCE" instruction. Its own reasoning shows why: the tool returns
`{"steps":[]}` and the agent reads this as "the earlier patrol attempts produced
no movement steps", concludes the call failed, and retries with new waypoints.
`report_to_central`, by contrast, returns an explicit
`_message: "Orders received... terminate now"` and does not loop.

The system must detect this from telemetry (repeated identical tool calls,
empty reasoning, latency outlier), classify it as an **execution gap**, and its
reflection must point at the tool response as root cause. This is the end-to-end
demo path.

## 3. Constraints and facts

- Python standard library only (project rule). Storage is **SQLite** in
  `.runtime/blackbox.sqlite`; the org's Twin database returns 404 and is not
  available.
- The simulator is seeded and its state is `deepcopy`-able (`random.Random`
  instances included), so a pre-decision snapshot can be restored and rolled
  forward. Suppression and spread use separate RNGs.
- Platform telemetry per run (`monitor_runs action=outputs`): per agent node,
  `steps` and an `events` JSON list of `{timestamp, reasoning, action,
  arguments, outcome}`, plus `tool_calls`. Runs can be annotated with
  `monitor_runs action=mark` (`correct|incorrect|critical` + `correction`).
- Northstars and audits exist (`manage_northstars`, `manage_audits`) and grade
  runs on the platform side.
- The simulator pins `environment='development'`, which executes the **live**
  version. Prompt patches therefore live in a forked, unpublished version.
- Decision latency today is 40–50 s; the loop run took 4m45s. Extra MCP calls
  per decision must stay at two.

## 4. Architecture

```
Simulator ──payload──► HappyRobot "Los Panaderos" ──run_id, decision──► Simulator.apply
    │                                                                      │
    ├─(1) BlackBox.record_decision: snapshot, payload, decision, run_id    │
    │                                                                      │
    ├─(2) Telemetry.harvest(run_id): agent steps, signals ◄── MCP outputs  │
    │                                                                      │
    ├─(3) Oracle.evaluate(snapshot, actual): regret, rank, gap type        │
    │                                                                      │
    ├─(4) Reflection: trigger_run "Post-mortem Los Panaderos" ──► reflection + diagnosis
    │                                                                      │
    └─(5) Healing: lessons.json → payload; mark run; northstar; patch proposal + A/B
```

All new code lives in `simulator/` as small modules with one purpose each. The
existing `Controller._decide` gains three hook calls; `Simulation.payload` gains
one field (`lessons_learned`). No physics changes.

## 5. Components

### 5.1 `simulator/blackbox.py` — flight recorder

SQLite tables:

- `decisions(id, incident_id, tick, event_type, created_at, payload_json,
  snapshot_blob, run_id, latency_s, status, decision_json, reject_reason,
  outcome_json)`
  - `snapshot_blob`: `zlib(pickle(deepcopy(sim)))` taken **before** `apply`.
  - `status`: `applied | rejected | error`.
  - `outcome_json`: filled at the next decision (or incident end) with deltas:
    people burnt, cells newly burned, cells extinguished (drone/truck), district
    status changes, warnings delivered, blocked routes.
- `telemetry(decision_id, agent, step_index, timestamp, reasoning, action,
  arguments_json, outcome_json)`
- `evaluations(decision_id, actual_cost, best_cost, regret, actual_rank,
  candidate_count, best_decision_json, gap_type, seeds, horizon, details_json)`
- `reflections(decision_id, run_id, text, diagnosis_json, created_at)`
- `lessons(id, rule, source_decision_id, created_at, active)`

API: `record_decision(...) -> decision_id`, `finish_outcome(decision_id, sim)`,
`load_snapshot(decision_id) -> Simulation`, `list_decisions(incident_id)`,
`recent_lessons(n)`.

Hooks in `Controller._decide`: record before `apply`; on success set
`status=applied`; on `ValueError` set `rejected` with reason; on other
exceptions `error`. `finish_outcome` for the previous decision is called when
the next decision is recorded, and on `reset`/`finished`.

### 5.2 `simulator/telemetry.py` — harvester and signals

`harvest(robot, run_id) -> list[Step]`: lists run outputs once, fetches the
full payload of each **agent** node output (Scout Agent, Drone Agent; node
persistent IDs discovered from the listing by name suffix "Agent", not
hardcoded), parses `Data.events` into steps.

`signals(steps) -> dict`:
- `repeated_tool_calls`: count of consecutive identical `action` names per agent
  (reference case: 13).
- `empty_reasoning_steps`.
- `agent_seconds`: wall time per agent from first to last event.
- `contradictions`: cheap checks against the payload, e.g. reasoning claims "no
  extinguisher/truck" while `fleet`/`fire_trucks` is non-empty; claims
  "confirmed fire" while `burning_cells` is empty.
- `terminated_cleanly`: last action is `_terminate`.

Budget: the harvester performs exactly two MCP calls beyond what `decide`
already does (one `outputs` listing is already fetched; reuse it, then two
agent payload fetches). It runs in the same background thread as `decide`,
after `apply`, so the clock stays paused for the same duration budget.

### 5.3 `simulator/oracle.py` — counterfactual evaluator

Input: a restored `Simulation` snapshot, the actual decision, horizon `H=16`
steps (the automatic decision interval), seeds `{9, 10, 11}`.

**Candidate generation** (finite, bounded to ≈60):
- per extinguisher: `scout` to top‑3 `smoke_scout_positions`; `contain` at
  top‑3 `safe_containment_positions`; `evacuate_*` for each unwarned district;
  `hold`.
- per truck: `attack_sector` at each observed leading fire cell (top‑2 by
  downwind projection) or the report; `continue`.
- per scout: `patrol` with one 3-waypoint ring around the report; `evacuate_*`
  each unwarned district; `continue`.
- Combine greedily: rank per-vehicle options independently under the cost, then
  evaluate the top‑k joint combinations (k ≤ 20) plus the actual decision. The
  actual decision is always included.

**Rollout**: restore snapshot, `apply` candidate (through the real validator, so
invalid candidates are dropped, never scored), `step(H)`, score. Per-seed RNGs
are reseeded before each rollout so every candidate faces the same draws.
The oracle uses **ground truth** (hidden fire) — it is a hindsight oracle by
design and is labelled as such everywhere.

**Cost** (lower is better, weights are configuration in one dict):

```
cost = 1000 * people_burnt
     +   50 * sum(unwarned district population / 1000 * downwind_urgency)
     +   20 * blocked_districts
     +    5 * newly_burned_cells
     -    3 * cells_extinguished
```

`downwind_urgency` is 1 if the district is in the downwind sector of any
burning cell (ground truth) at the end of the horizon, else 0.2 if merely
downwind of the report, else 0.

**Outputs**: `actual_cost`, `best_cost`, `regret = actual - best`,
`actual_rank`, `best_decision`, and **gap type**:
- `execution`: decision was rejected, errored, or telemetry shows a loop /
  non-clean termination.
- `information`: the best decision depends on fire cells that were **not** in
  the agent's `known_map` at decision time (e.g. hidden ignition). Not blamed.
- `judgement`: the information needed was visible and the regret exceeds a
  threshold (default 100).
- `none`: regret below threshold.

### 5.4 Reflection workflow (HappyRobot) — "Post-mortem Los Panaderos"

New workflow, development environment, created and versioned via MCP:

- Trigger: Predefined Webhook with fields `decision_record`, `telemetry_steps`,
  `signals`, `oracle_result`, `prompt_excerpt` (all JSON strings).
- Node: Reasoning Agent (same family as the current agents) with prompt: read
  the frozen state, the agent's own reasoning steps, and the hindsight oracle;
  write a reflection in Spanish (≤ 200 words) and call a tool
  `submit_diagnosis` **once** with:
  `{gap_type, root_cause, evidence_step_indexes, prompt_section,
  proposed_rule, proposed_prompt_patch, confidence}`.
  The tool response returns an explicit acknowledgement message (the fix the
  reference case needs, applied here from the start).
- Output node: the diagnosis (same pattern as `Resultado de la mision`).

The simulator triggers it with the existing `HappyRobot.tool('trigger_run', ...)`
and reads the output node like today. This is one extra run per decision, in
the background, never blocking the clock.

### 5.5 `simulator/healing.py` — three tiers

- **Tier 1 (automatic)**: store `proposed_rule` in `lessons`; keep at most 5
  active, deduplicated by normalised text, newest first. `Simulation.payload`
  adds `world_state.lessons_learned` (list of strings, ≤ 5). Annotate the run
  with `monitor_runs action=mark` (`incorrect` for judgement gaps,
  `critical` for execution gaps, `correct` otherwise) and `correction=root_cause`.
- **Tier 2 (automatic)**: when the same `(gap_type, prompt_section)` appears in
  ≥ 2 decisions, create or update a northstar on the Los Panaderos workflow
  (`manage_northstars`), so platform audits grade every future run for it.
- **Tier 3 (gated)**: when a `proposed_prompt_patch` arrives with
  `confidence ≥ 0.7`: `manage_versions fork` the live version; apply the patch
  to the named prompt section with `update_workflow_nodes`; run
  `fix_broken_vars`; then **A/B**: for each recorded decision of the incident,
  trigger the forked version with the recorded payload, parse the decision,
  score it with the oracle from the same snapshot, and compare regret before /
  after. Write a report to `.runtime/patches/<timestamp>.md` and show it in the
  UI. Publishing is never automatic.

### 5.6 UI and API

- `GET /api/postmortem?incident_id=` → decisions with evaluation, signals,
  reflection, lessons, patch reports.
- New collapsible panel "Post-mortem" under the existing technical log: one row
  per decision — tick, actual command, best command, regret, gap type, latency,
  loop flag; expand to see reasoning excerpt and reflection text. Language
  toggle applies to labels only.

## 6. Data flow per decision

1. `request_decision` → `payload` (now includes `lessons_learned`).
2. `_decide`: `decision, evidence, run_id = robot.decide(payload)`.
3. `blackbox.record_decision(snapshot=deepcopy(sim) before apply, ...)`.
4. `sim.apply(...)` → `status=applied` or `rejected`.
5. Background, non-blocking: `telemetry.harvest` → `oracle.evaluate` →
   `reflection.trigger` → `healing.apply`.
6. Next decision: `finish_outcome(previous)`.

Failures in step 5 are logged to the simulator history as `system` entries and
never affect the running incident.

## 7. Error handling

- Snapshot pickling failure → record without snapshot; oracle skips with
  `gap_type=unknown`.
- MCP failure in harvest/reflection → retry once, then mark the decision
  `telemetry_missing`; healing skips.
- Oracle time budget 10 s per decision; if exceeded, evaluate fewer joint
  combinations (k halves) and record `truncated=true`.
- Reflection returns malformed diagnosis → store text, skip healing.
- Tier 3 never publishes; any exception aborts the patch and leaves the fork
  in place for inspection.

## 8. Testing

Unit (stdlib `unittest`, offline, mocking `HappyRobot.tool`):
- black box: record/restore round trip; outcome deltas; rejected decisions.
- telemetry: parse a stored copy of the reference run's Scout Agent output
  (fixture under `tests/fixtures/`), assert `repeated_tool_calls == 13`,
  `terminated_cleanly == True`, `agent_seconds > 240`.
- oracle: from a fixed seeded state with visible fire, an `evacuate_farm` under
  strong north wind beats `hold` (regret > 0); hidden ignition yields
  `information` gap; invalid candidates are never scored; same candidate scores
  identically across two evaluations (determinism).
- healing: lessons deduplicate and cap at 5; payload carries them; northstar
  threshold; tier 3 stops before publish (mock asserts no `publish` call).
- controller: `_decide` records a decision and does not block on background
  analysis.

Live (opt-in, `HAPPYROBOT_LIVE_CHECK=1`): trigger the reflection workflow with
the reference case fixture and assert a well-formed diagnosis.

Acceptance: the reference case, replayed from its fixture, yields
`gap_type=execution`, a reflection naming the tool response, a Tier 1 lesson,
and a run annotation.

## 9. Out of scope

- Changing physics or the decision cadence.
- Publishing workflow versions automatically.
- A generic RL/learning loop; this is post-hoc evaluation and in-context
  adaptation.
- Twin database storage (unavailable in this org).
