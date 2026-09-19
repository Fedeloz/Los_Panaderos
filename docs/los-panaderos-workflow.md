> Historical v1 design. For the current nested central/drone demo, see [README](../README.md) and [installed prompts](mvp-agent-prompts.md).

# Los Panaderos — Agentic Fire Response Workflow

**Platform:** [HappyRobot EU](https://platform.eu.happyrobot.ai/hackspainteam9)  
**Organization:** HackSpain - Team 9 (`hackspainteam9`)  
**Workflow:** Los Panaderos (`mg9barxt86w3`)  
**Workflow ID:** `01a0b8ea-d9af-71f3-9fb7-8a469f9ac25b`  
**Version:** `zyxcxcxocq09` (v1) — draft, not published to any environment  
**Engine:** v3  
**Editor:** [Open in HappyRobot](https://platform.eu.happyrobot.ai/hackspainteam9/workflows/mg9barxt86w3/editor/zyxcxcxocq09)

---

## Purpose

Provides the decision-making layer for an external fire-and-rescue drone simulation. The simulator owns all physics and world state; this workflow supplies agent reasoning and returns commands.

---

## High-level structure

```
Simulator Event            (trigger)
        │
        ▼
Central Command            (agent)
        ├── Central Coordination Logic      (prompt)
        │
        ▼
Extinguisher Drone         (agent)
        ├── Suppression Decision Logic      (prompt)
        │
        ▼
Rescue Guidance Drone      (agent)
        └── Human Rescue Guidance Logic     (prompt)
```

**7 nodes, 6 edges.** Execution is strictly sequential along the agent chain — each agent runs after the previous one completes. Prompt nodes are attached to their parent agent (not separate sequential steps in the graph).

---

## Nodes

| Node | Type | Role |
|------|------|------|
| Simulator Event | trigger (`action`) | Entry point; receives world-state payload from the external simulator for one decision tick |
| Central Command | agent (`action`) | Top-level coordinator; reads world state and sets priorities between suppression and rescue |
| Central Coordination Logic | prompt | Prompt for Central Command |
| Extinguisher Drone | agent (`action`) | Fire-suppression decisions: target cell, engage vs reposition |
| Suppression Decision Logic | prompt | Prompt for Extinguisher Drone |
| Rescue Guidance Drone | agent (`action`) | Survivor-rescue decisions: locate people, route to safety |
| Human Rescue Guidance Logic | prompt | Prompt for Rescue Guidance Drone |

### Platform node IDs (latest version)

| Name | Node ID |
|------|---------|
| Simulator Event | `01a0b8eb-f961-7dc3-aa40-fc5563ae8a8e` |
| Central Command | `01a0b8ec-36ec-7855-9cf4-34917873f2a9` |
| Central Coordination Logic | `01a0b8ec-36ec-7855-9cf4-34923e67a08f` |
| Extinguisher Drone | `01a0b8ec-c68a-7d97-84c5-e5bf6ac6a1c5` |
| Suppression Decision Logic | `01a0b8ec-c68a-7d97-84c5-e5c0c03d6d56` |
| Rescue Guidance Drone | `01a0b8ed-4a0f-701e-bc85-da928d119669` |
| Human Rescue Guidance Logic | `01a0b8ed-4a0f-701e-bc85-da93fce3c0d2` |

---

## Execution model

- **One workflow run = one decision tick.**
- Agents run **in sequence**, not in parallel. Central Command’s output is available to downstream drone agents.
- Latency is dominated by **three sequential LLM calls**. Do not invoke this per rendered frame — call every **N seconds** or on **significant events**, and interpolate drone motion locally between decisions.

---

## Integration

The external simulator **POSTs** world state to the **Simulator Event** trigger and applies the returned commands. The simulator remains authoritative for physics, collisions, battery, and outcomes.

**Auth:** Configured on the trigger node (API key or OAuth2), separate from the org-scoped API key used for the management API.

---

## Known gaps

- No node is marked as a **response** node.
- The Simulator Event trigger’s type and payload schema are not yet confirmed in this doc.
- The request/response **JSON contract** is not yet defined.
- Version is a **draft**; nothing is live in production, staging, or development.

---

## Related workflows (same org)

| Name | Slug | Notes |
|------|------|--------|
| Fire Management Intelligence Prototype | `vdmr2pjxlj16` | Separate workflow; may overlap thematically |
| test | `564nqu4rtgc1` | Sandbox |
