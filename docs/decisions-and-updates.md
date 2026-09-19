# Decisions and Planned Updates

**Date:** 2026-09-19
**Scope:** Los Panaderos agentic fire-response system (HackSpain)
**Status:** Proposal — nothing in this document has been implemented yet.

---

## 1. Why this document

The judging criteria are not features. They are **six questions the system must answer
repeatedly as a situation changes**:

1. **Qué información importa** — 100 messages arrive, 3 change something. Keep those 3.
2. **Qué va primero** — 20 things can be done; some matter more. Say where you start.
3. **A quién se avisa y cuándo** — a neighbour, a firefighter and an official need
   different things. Whom to call, what to tell them, in what order.
4. **Dónde van los recursos** — 3 ambulances, 5 sites asking. Sending them one way
   leaves the other waiting.
5. **Qué se hace ahora** — not status; the concrete next action and who does it.
6. **Cuándo tirar el plan** — the wind shifts and the 20-minute-old plan is void.
   Does the system notice?

And the framing that decides the design: *"Un agente que siga una lista de pasos fija se
queda atrás en el primer cambio."* — **adaptive, not scripted.** Any change that turns
judgement into a formula is a regression against these criteria, regardless of how much
capability it appears to add.

---

## 2. Where the system stands

**Genuinely strong — do not weaken these:**

| Question | Existing mechanism | Assessment |
|---|---|---|
| Q1 | Fog-of-war: `known_map` distinguishes `F` fresh fire / `f` stale / `.` clear now / `,` previously clear / `?` unobserved; satellite delayed 12 steps; `observed_fire_details` separate from hidden ground truth | **Strong for fire, absent for messages** |
| Q2 | `mission_context` (last 12 missions + `outcome_so_far`); `population_wind_alignment`; district ranking; `mission`/`reason` fields | Strong |
| Q3 | Despacho Central → prioritised list → **Loop** → outbound call workflow | **Architecturally sound, currently unreachable** (§5) |
| Q4 | Fleet/truck orders per vehicle ID; district reservations; `coordination_conflict` on duplicate assignment | Strong |
| Q5 | The core decision loop; every command validated before apply | Strong |
| Q6 | `pending_decision_event` fires on 6 event types; `revision` increments on wind change | **Present but unobservable to the agent** |

**Structural gaps:**

- **Q1 is thinnest.** `human_messages` is a single string from a single report
  (`self.called` is a boolean that rejects a second call). The fire domain models
  information quality precisely; the message domain does not model it at all.
- **Q3 has no audiences.** `criticality` and `mission_type` exist, but there is no
  firefighter / official / neighbour role concept. The slide names those three explicitly.
- **No contacts exist.** `world_state` carries no phone numbers, yet
  `llamar_prioridad_evacuacion` requires `phone_number`, `contact_name`,
  `known_location`, `evacuation_point`, `evacuation_route`, `evacuation_deadline` per
  person — and its own description says *"Usa unicamente personas y telefonos presentes
  en world_state; no inventes contactos."* The agent is told not to invent data it was
  never given.
- **Q6 is unobservable.** `set_wind()` increments `self.revision`, but `revision` is
  **never included in the payload**. The agent receives the new wind with no signal that
  its previous plan was built on different conditions.

---

## 3. The measurement that reframes "prevention"

We proposed adding a **timed** prevention rule: compare fire arrival time against
evacuation time, and act early when the deadline is tight. Measured empirically on the
current engine (`spread_factor` 0.5, seed 9, ignition `[76,41]`):

| District | Ignition → district | District → refuge | Evacuation time | Fire arrival (north wind) |
|---|---|---|---|---|
| farm | 20.2 cells | 15.8 cells | ≈ 20 steps | **tick 276** |
| town_south | 63.1 cells | 23.4 cells | ≈ 29 steps | **tick 508** (west wind) |
| town / town_north / town_rosales | 62–77 cells | 6.3–12.8 cells | 8–16 steps | **not reached within 1200** |

Group travel is 0.8 cells/step to a fixed refuge. Fire arrival was measured by stepping
the simulation until fire reached a ±2 cell box around each district anchor; it is
seeded and therefore reproducible, but it is a **sample, not a bound**.

**The consequence is the important part: margins are 250–480 steps — 15 to 30 decision
cycles of slack.** A strict deadline rule ("warn only when `fire_eta < evac_time`") would
therefore conclude *"no urgency, wait for confirmation"* essentially always.

That **contradicts** the system's deliberate current behaviour, which warns the farm
preemptively under north wind before thermal confirmation. A naive timing feature would
argue against the precautionary policy we already built.

**Therefore the numbers must be used as evidence, not as a rule.** Two honest options:

- **(a) Reframe prevention as risk under uncertainty.** The value of the times is not
  "who is about to be hit" but "how much slack exists, and what would consume it." With
  256 steps of slack, warning early is a decision about *variance* — the spread model is
  50%-per-attempt and stochastic, and wind can change — not about racing a deadline. The
  agent should say that explicitly.
- **(b) Tighten the scenario so prevention has stakes.** Raise the spread factor
  (panel supports 0.25×–4×), or place the ignition nearer a settlement, so that
  `fire_eta` genuinely approaches `evac_time`. Then early action becomes demonstrably
  necessary rather than merely prudent.

Option **(b)** is what makes prevention demoable on stage. Option **(a)** is what makes
it intellectually honest. They are not exclusive, but (b) must be verified by
measurement before any demo claims prevention was necessary.

---

## 4. Decisions

### D1 — Add timing as *evidence*, per district

**What:** expose `fire_eta_steps` (from the existing `spread_interval()` × distance) and
`evacuation_time_steps` (distance to refuge ÷ 0.8) per district, **as a range with
stated uncertainty** — never a single precise figure.

**Why:** Q2 ordering becomes deadline-aware instead of heuristic; Q3's "y cuándo"
becomes literal; Q6 gains something concrete to invalidate.

**Constraint:** the prompt must instruct the agent to **weigh** these against
credibility, terrain, mobility and contradiction — *not* to execute a threshold. A rule
reading "if `fire_eta < evac_time` then warn" is exactly the fixed step list the criteria
warn against. This is the single largest risk in the whole plan.

**Note:** `spread_interval()` returns *attempt* intervals under a 50% ignition
probability with retries. Treating it as a propagation rate overstates precision.

### D2 — Make condition changes visible to the agent

**What:** add `revision` and a `conditions_changed_since_last_mission` flag to the
payload.

**Why:** Q6 is currently unobservable. The agent re-decides on a wind change but is never
told its previous plan was built on different wind. This is a few lines and it is the
difference between Q6 being *asserted* and Q6 being *demonstrated*.

**Priority: highest value per line changed.** It fixes the question the criteria stress
most, and it carries almost no prompt risk.

### D3 — Messages as a pool with timestamps, credibility and roles

**What:** replace the single `call_text` with a list: `id`, `received_at`, `source`,
`source_role`, `claim`, `location`, `credibility`, `superseded_by`, `status`. Deliver
messages on a schedule (reusing the existing `satellite_queue` capture-at-T /
deliver-at-T+N pattern), and add `message_received` to `pending_decision_event`.

**Why:** Q1 is the thinnest answer and this is the direct fix. `source_role` carries Q3's
audiences — a firefighter's report outranks an anonymous caller's, which is both triage
(Q1) and audience modelling (Q3) from one field.

**Design rules:**
- **Do not flood the prompt.** Present a compact digest (`id, received_at, source,
  source_role, claim, location, credibility`) and ask the agent to **select IDs**, not
  summarise prose. Selection is verifiable and testable; summarisation is not.
- **Keep `human_messages` working.** Additive, so existing validation cases still pass.
- **Ask the agent to cite the triage in `reason`.** `reason` is already logged and
  persisted to `.runtime/last-run.json`, so a decision reading *"ignoring the 12:40
  report from (12,40) — contradicts the responder at the same tick, lower credibility"*
  demonstrates Q1 with **zero UI work**.
- **Make contradiction, not volume, the test case.** Three reports at one place is
  deduplication. Two reports 80 cells apart from sources of differing credibility is
  judgement.

### D4 — Source roles, and therefore Q3's audiences

**What:** `source_role` on messages (citizen / responder / authority), extending
`criticality` and `mission_type`.

**Why:** the criteria name *"un vecino, un bombero y un responsable"* explicitly, and no
such distinction exists today. This is a small field once D3 exists, and it closes Q3's
literal wording rather than approximating it.

### D5 — Contacts in world state

**What:** add a `contacts` array to the payload: `contact_id`, `name`, `phone`,
`role`, `district_id`, `mobility`, `criticality`. Fabricate 10–20 people across the four
districts, **published as an explicit stated assumption** in the same way the census
allocation already is in `docs/population-provenance.md`.

**Why:** the outbound call tool requires contact data that the payload does not contain.
Today the agent cannot legitimately call anyone. The `Incidente Entrante` trigger in
Despacho Central already declares a `contacts` param, so the shape is half-designed.

### D6 — Fix the call → dispatch wiring

**What:** add the missing `Call Workflow` node so `Gestor info incendios (Web Call)`
hands its extracted report to `Despacho Central`.

**Why:** the inbound call path currently **dead-ends**. The report is classified,
graded, geocoded and extracted into 13 fields — and then nothing consumes it. Q3 is a
quarter of the scorecard and its headline path is unreachable. This is one node.

**Also:** Despacho Central's prompt interpolates ~25 fields its trigger does not declare,
and names four tools of which only one exists (under a different name). Both need
reconciling.

---

## 5. What we are deliberately NOT doing

- **A separate triage agent or new workflow.** Central already performs credibility
  assessment — its instructions already say *"Evalua primero la fiabilidad del
  incidente."* Adding structured messages lets the existing agent triage. A new agent is
  five times the work and fits the same gap.
- **Resource contention and scarcity modelling.** Judged lower value than early action.
  Note the cost honestly: without capacity limits, Q4's *"mandarlas a un lado es dejar el
  otro esperando"* only bites through travel time, never through depletion.
- **Live channel integration first** (Gmail/Slack/Telegram triggers). They require public
  HTTPS, which breaks the documented *"no public tunnel is needed"* property, are
  non-deterministic, are not replayable, and can fail on stage. Add only if time remains
  and the deterministic core already demos.
- **A message-filtering UI.** `reason` gives the same proof for free.
- **Migrating `human_messages`.** Additive is both safer and faster.

---

## 6. Risks

| Risk | Mitigation |
|---|---|
| **Timing becomes a formula**, automating judgement away | Phrase the prompt so numbers are evidence; A/B the recorded validation cases and reject the change if decisions do not change |
| **False precision** — quoting a stochastic estimate as a countdown | Expose a range; state uncertainty in the prompt; keep the README's "predict uncertain fire arrival, not exact fronts" consistent with the numbers |
| **Prompt length** — Central's prompt is already very large, and prior prompt edits caused regressions (the v10→v11 west-wind failure) | Keep the triage paragraph short and early; re-run all recorded cases |
| **Publishing trap** — the simulator pins `environment='development'`, so it executes the **live** version, not the latest draft | Publish before rehearsing; never conclude a feature failed while testing a stale version |
| **Workflow is moving fast** — v21 → v24 in under an hour, node IDs shifting | Confirm the target version before writing nodes; `EDGE_NODE` is a persistent ID and stays stable, node IDs do not |

**Security, unrelated to the above but open:** the Telegram bot token is hardcoded in
plaintext in the `Enviar a Telegram` node URL, and `require_webcall_auth` is `false` on
the inbound Web Call trigger (platform default is `true`).

---

## 7. Suggested order

1. **D2** (`revision` + conditions-changed) — minutes, fixes Q6, no prompt risk.
2. **D6** (call → dispatch node) — one node, restores a quarter of the scorecard.
3. **D3 + D5** (messages + contacts) — the main build; Q1 and the precondition for Q3.
4. **D4** (source roles) — small once D3 exists; closes Q3's literal wording.
5. **D1** (timing) — only after measuring whether prevention can be made demonstrably
   necessary (§3(b)); otherwise it adds justification without changing decisions.

**The A/B is the acceptance test.** Run the recorded validation cases before and after.
Changes that leave decisions unchanged are decoration, and should be labelled as such
rather than claimed as capability.