# Despacho Central v15 / v16

LIVE on **development** is still **v15** (`01a0bdb7-5d9f-797d-9a3a-6d057198d69c`, slug `wm9viy0rm87v`).

Editor v15: https://platform.eu.happyrobot.ai/hackspainteam9/workflows/zqtnabjy5loj/editor/wm9viy0rm87v

**v16** is an unpublished draft with the reinforced Central prompt (action always; scout vocab). Do not publish until the next coordinated run.

Editor v16: https://platform.eu.happyrobot.ai/hackspainteam9/workflows/zqtnabjy5loj/editor/nxdtwom5u7k3

Fork of v14. Persistent node IDs unchanged; the simulator `.env` node ids stay valid.

## What changed

### P1 — `communications_sent` in the KV PATCH

`Construir estado publico` now emits `communications_sent` (one object per alert/call/personal message the agent fired this round). `Guardar estado (KV)` PATCHes that array. The Worker **appends** agent increments (it replaces only when `source` is `los-panaderos-simulator`).

`status` is always `"sent"`. The child Telegram/call workflows are fire-and-forget, so this means **emitted**, not **delivered**. The simulator moves population when the aviso **leaves** Despacho, not when delivery is confirmed.

If `action` is missing on a zone alert, the field is **omitted**. The simulator then infers from `criticality` (`inferred_from_criticality`). An explicit `inform` is never invented here.

### P2 — `alertar_zona.action`

Tool parameter `action` (`evacuate` | `inform`, plus the simulator synonyms). Forwarded to Mensajes externos. Prompt criterion 4: `action` always; a tranquillity/follow-up message is `inform` and never carries `critica`/`alta`.

### P3 — `command_id`

`pending_command.command_id` is a new `uuid4().hex` on every decision. Never empty. Inbox `event_id` is kept as `pending_command.event_id` for tracing.

### Scout vocabulary (example, not the Code node)

`Construir estado publico` copies `scout_orders` as-is. The rejected `command: "scout"` on a scout came from the local example stub, not from the Code node. The nested Los Panaderos `report_scout_plan` already requires `patrol|hold|continue|evacuate_town|evacuate_farm`. `scout` is an extinguisher command only.

`apply()` validates the three arrays in one block: one bad scout word also drops extinguisher and truck.

## Contract the simulator applies

`Simulation.apply_communications` only moves people when:

`kind=zone_alert` AND `action=evacuate` (or inferred high criticality) AND `status ∈ {sent, delivered, succeeded}` AND the district is `unwarned`.

`pull_dispatch` dedupes by `(kind, contact_name, information, tick)`. These PATCH rows have no `tick`, so the first round can apply twice until the simulator republishes its own log. Harmless on a district already evacuating.

## Files

- `construir_estado_publico.py` — code living in the Code node (passthrough of fleet orders)
- `prompt-central.md` — Central prompt (v16 draft)
- `example-patch.json` — PATCH body from a local exec of that code
- `pending_command.json` — fleet orders that `Simulation.apply` accepts on demo fleet 1/1/1 at tick 0 after ignite+farmer_call
- `validate_pending.py` — runs that apply locally

See also `workflow/marina-v4/prompt.md` for the inbound-info agent (still Web Call).
