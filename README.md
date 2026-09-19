# Los Panaderos

HackSpain demo: one drone chooses containment or evacuation, with decisions in HappyRobot.

## Run

```sh
python3 -m simulator.server
```

Open [the local demo](http://127.0.0.1:8765). **Ignite → choose wind → Farmer reports smoke**. The call starts automatic playback and agent decisions. Reset between scenarios:

- **East:** scout, then contain visible fire.
- **North:** scout, then warn the farm's six residents before returning to containment.
- **West:** scout, then warn the town's 32 residents.

Use Pause, +1 step, speed selection, and Ask agents for manual control. The timeline supports backward/forward scrubbing and replay playback. **Live** returns to the latest state; press Play to continue. Replay is read-only and never repeats platform calls. Up to 1,500 compressed frames are retained in memory, cleared by Reset/restart. Playback pauses when the operator view confirms no active fire remains and no evacuation group is still moving or blocked; this is not an agent all-clear.

## Model and observations

An 80×56 custom educational grid, **not SimFire or PROPAGATOR**. A Cártama-inspired schematic places town/station southwest, farm northeast and fire southeast. Locations are staged, not a real geographic reconstruction. [Cártama's municipal cultural site describes the area's agricultural settlements](https://culturacartama.es/ruta-las-pedanias-historicas-de-cartama/).

Each eligible adjacent cell has a 50% ignition chance per attempt, even when exposed by multiple burning neighbors on that step. At wind X=1, Y=0, attempts occur downwind every two steps, crosswind every 10 and upwind every 20; stronger wind accelerates downwind attempts. Failed attempts retry on the next eligible step. Burning cells burn out after 80 steps. Seeded randomness (default seed 9) makes identical scenarios reproducible while creating uneven fronts. No meters/seconds or operational forecasting accuracy are implied. The drone travels three cells/step and sees radius nine. Containment removes one visible burning cell/step within six cells of the drone. Drone targets are safe flight positions, at least three cells from observed fire, selected from safe_containment_positions; routes avoid locally detected fire and retreat if fire approaches. It never deliberately flies to a burning target. Treated cells do not reignite in this deliberately simplified demo. Battery and suppressant budgets are removed.

Evacuation requires the drone to reach the settlement and warn people. Groups travel to fixed refuges at 0.8 cells/step and stop if fire blocks their route. This is a simplified group movement model, not route planning. Station dispatch mobilizes an actual moving truck for eight steps after the farmer report. It travels at one road cell/step from the station, avoids detected fire, and attacks up to six burning cells/step within an eight-cell hose radius. There is no timed teleport or remote suppression. Its position, route, status, local fire observations and route-based arrival estimate are shared with both HappyRobot agents every decision. An obstructed route may invalidate that estimate. Truck movement, local navigation and suppression execution are deterministic; HappyRobot controls the drone's strategic choice, not individual truck steering.

Roads are schematic access tracks, not a real transport network. Fire spread is deliberately simplified, without calibrated fuels, slope, atmospheric turbulence or spotting. This update adds operational constraints, not a validated wildfire/flight model.

Left map is ground truth. Right map shows local observations and remembered sightings, plus synthetic satellite hotspots in 8×8 blocks, captured every 12 steps and delivered 12 steps late. Forecast and smoke report are synthetic. Resident movement/status is treated as reported telemetry. Global fire cells and simulation-only ignition logs never enter agent inputs.

The clock animates at 1–8 steps/second, but **pauses during HappyRobot deliberation** so API latency cannot change the outcome. Automatic decisions occur every 16 steps and on farmer reports/forecast changes. No scripted decision fallback.

## HappyRobot integration

[Los Panaderos development workflow](https://platform.eu.happyrobot.ai/hackspainteam9/workflows/mg9barxt86w3/editor/hv0nqn8kc39r)

```text
Simulator Event
└─ Central Command (Reasoning Agent)
   └─ Central Coordination Logic
      └─ delegate_extinguisher(mission)
         └─ Drone Agent (Reasoning Agent)
            └─ Drone Local Reasoning
               └─ report_to_central(command, target, reason, mission)
                  └─ Drone Command (AI Extract: serialization)
```

Central sends a mission into the nested drone agent; the drone reasons from local observations and returns a decision through the tool result. The backend executes its command and provides updated observations, prior decisions and outcomes in the next run. This is bounded per-event coordination with simulator-provided memory, not persistent online learning.

The backend uses the authenticated stdio MCP proxy in `.cursor/mcp.json`, server `happyrobot-mcp-eu-all`. On another machine configure the proxy and OAuth, or set `HAPPYROBOT_MCP_CONFIG` and `HAPPYROBOT_MCP_SERVER`. Python standard library only. Credentials stay in the proxy, no public tunnel is needed, and the browser receives no credentials. The farmer call is a simulated text transcript, not a phone call.

Completed run outputs are fetched explicitly, parsed and checked for coordinate bounds, visibility, incident identity, tick freshness and duplicate commands. A rejected model command is returned as feedback for one corrective decision; a second rejection pauses the demo. The simulator never silently substitutes a different AI target. Latest run evidence is in `.runtime/last-run.json` and the page's inspection panel. [Agent prompts](docs/mvp-agent-prompts.md).

## Verify

```sh
python3 -m unittest discover -s tests -v
```

Tests cover spread timing, wind, containment, local knowledge, satellite latency, evacuation, blocked routes, stale/invalid commands, immutable replay, and MCP parsing. Restart the server after Python changes; no hot reload.

[Recorded validation cases](docs/demo-validation.md) include the real HappyRobot run IDs and physical outcomes.

Wind panel: set X/Y independently from -3 to +3 and press Apply wind. Positive X is east, positive Y is south; (0,0) is calm. Values are relative simulation units. Each direction uses the vector projection to determine its spread interval; agents receive the full vector, magnitude and directional attempt intervals and the 50% ignition probability.

Interactive setup: before ignition, click the left map to choose the fire origin. Drag the wind compass or use the X/Y sliders. Run & record applies the preview wind, ignites the selected location and starts the farmer report plus HappyRobot loop. Stop recording pauses the simulation; an in-flight decision may still finish. Play recording replays captured states without calling AI; Live exits replay. Download recording saves a simulation JSON file (not a video); Open recording loads it after a restart. Capture is limited to 1,500 frames; a new recording replaces the previous in-memory capture. Reset preserves the last recording until a new one starts.

Forecast-led strategy: HappyRobot treats wind magnitude ≥2 as strong in demo units. If a credible smoke report places unwarned residents downwind, Central sends the drone to warn/evacuate immediately, before thermal confirmation or containment. Strong wind away from residents does not trigger unrelated evacuation. The agent considers both wind components, report uncertainty, people status, drone capacity and actual truck availability. This strategic choice runs in HappyRobot, not a local command-selection rule.
