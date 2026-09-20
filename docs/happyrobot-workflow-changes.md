# HappyRobot workflow changes

Living log of Despacho Central / Marina edits that the simulator depends on. Node persistent IDs in `simulator/happyrobot.py` are still v14/v15 (unchanged across this fork).

## 2026-09-20 — Despacho Central v15 (`wm9viy0rm87v`) LIVE development

Editor: https://platform.eu.happyrobot.ai/hackspainteam9/workflows/zqtnabjy5loj/editor/wm9viy0rm87v

Version id: `01a0bdb7-5d9f-797d-9a3a-6d057198d69c`. Fork of v14.

`dc550e21-de15-41b2-9c5f-f58e9eac7559` had already completed (v14). Its successor `33895e2d` then `2bb9bea7` kept chaining; HappyRobot cancel returned Cloudflare 502. v14 was unpublished so `Continuar despacho` could not start a new live run; v15 was published only after the running list was empty.

### P1 — PATCH writes `communications_sent`

The v14 PATCH body was:

`districts`, `public_message`, `advice_source`, `loop_seen_generation`, `session_id`, `last_dispatch`, `pending_command`.

v15 adds `communications_sent`: one object per aviso the agent **emitted** in that decision (not per confirmed delivery). Child workflows (Lllamadas externas, Mensajes externos) stay fire-and-forget.

`status` is `"sent"`. That value is in `Simulation.DELIVERED_STATUSES`, so a `zone_alert` with `action=evacuate` **does** set the district to `evacuating`. Population in the simulator moves when the aviso **leaves** Despacho, not when Telegram/the call reports delivery. That is the only fact available at PATCH time.

Worker merge: agent arrays **append**; simulator snapshots **replace** (`source=los-panaderos-simulator`).

Dedup in `server.py` `pull_dispatch` is `(kind, contact_name, information, tick)`. Agent rows have no `tick`, so the first poll can apply the same row twice until the simulator republishes. Inocuous once the district is already `evacuating`.

Example body (local exec of the Code node): `workflow/despacho-v15/example-patch.json`.

### P2 — `alertar_zona.action`

Tool `alertar_zona` (`01a0bbd6-8761-7f66-96c6-e9bc4527f01f`) gained optional `action`. Prompt: use `evacuate` only to put that population on the road; tranquillity/follow-up is `inform`.

If the tool omits `action`, v15 **omits the key** in `communications_sent`. It does **not** write `inform`. `Simulation.alert_action` then infers from `criticality` (`critica`/`alta`/… → evacuate) and flags `inferred_from_criticality`. Forcing `inform` here would disable that safety net. A tranquillity text with `criticality=critica` and no `action` therefore evacuates: that combination is a prompt bug, not a Code-node default. The example of an omitted `action` now uses `informativa`.

### P3 — unique `command_id`

`pending_command.command_id` is `uuid.uuid4().hex` per decision, never `''`. Inbox `event_id` is `pending_command.event_id` only (trace). A new inbox PUT no longer re-applies the same mission under a fresh event id; an empty event_id no longer drops the command.

### Worker P4 (deployed separately)

`PATCH /state/:id` ignores `loop_seen_generation`, `pending_command` and `last_dispatch` when the document already has a `session_id` and the body carries a **different** one. The document `session_id` is also kept (otherwise a stale PATCH would rewrite it and invert the guard). Simulator reset (commit `6b1c304`) now sends a uuid on DELETE, so the empty envelope has something to compare.

Worker version: `6e0258b3-cd7f-49f7-af1f-7772a8790a67` (`los-panaderos-state`). Tests: `state-api/src/mergeState.test.js`.

### Marina v4 (Gestor info incendios) LIVE development

Editor: https://platform.eu.happyrobot.ai/hackspainteam9/workflows/8angdc9uc7nz/editor/m3cs7r55sfuv

Version `01a0bb6c-2e12-7059-bcbc-9fcdd8768377`. Prompt reads `identity_status` from `/lookup`. Still Web Call. Inbound PSTN not in this change. Prompt source: `workflow/marina-v4/prompt.md`.

See `workflow/despacho-v15/` for the Code-node source, prompt, an example PATCH body, and a `pending_command.json` that `Simulation.apply` accepts.

## 2026-09-20 — Despacho v16 draft (`nxdtwom5u7k3`) unpublished

Editor: https://platform.eu.happyrobot.ai/hackspainteam9/workflows/zqtnabjy5loj/editor/nxdtwom5u7k3

Version `01a0bdc7-9801-75ea-916d-d563983f0c02`. Prompt only: `action` always; tranquillity never `critica`/`alta`; scout_orders cannot use `command=scout`. Not published; v15 remains LIVE. Do not start a Despacho run until this is published in a coordinated step.

