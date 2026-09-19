# Los Panaderos

HackSpain wildfire response demo: a configurable fleet follows missions decided in HappyRobot.

112 CECOP wildfire operations demo for Brunete, Madrid. HappyRobot remains the only mission decision-maker; the dashboard presents coordinated fleet orders, five population groups and the simulation's observations.

## Run

```sh
python3 -m simulator.server
```

CECOP navigation:
- `/` (or `/situacion`): national situation desk (CECOP-ES) where the tactical GIS map of Spain (`mapa.js` / `mapa.css`) is the page: national KPIs and the live-room duty chip sit in the map's command header, with open/closed case-file cards as glass panels below. The map layers active hotspots, fire perimeters, risk zones, wind streamlines, CCAA boundaries, roads, cities and topography over the schematic basemap, with a Canary Islands inset, layer switches, wheel/drag zoom and a 24 h timeline scrubber. Everything on it except the Brunete marker is a frozen demonstration scenario: perimeters and hotspots are drawn at symbolic scale, and the wind field, risk zones and incident list are fictional. Brunete's marker, its list entry and the ACTIVOS counter follow `/api/state`.
- `/incidente` (or `/incidente/brunete`): the Brunete dual-map incident room.
- `/medios`: national reserve pools (UME, BRIF, regional plans) plus Brunete fleet configuration and live inventory.
- `/archivo`: closed case files, and start/stop/download/open of Brunete recordings.
All four pages share one Controller, ES/EN preference and one design system: the cyan/glass GIS tokens in `style.css` `:root` drive the nav rail, mast, counters, duty strip, panels, tickets and the Incidente map frames (canvas rendering untouched).

Brunete is the only simulated incident. The other dossiers (Sierra de Gata, Verín, Cap de Creus under observation; Sierra Bermeja, Bejís, Tenerife closed) and the reserve pools are a frozen demonstration catalog in `chrome.js`: static cards and map pins with no incident room behind them. National KPIs count watch dossiers always and fold Brunete in only once the room is live; an idle Brunete shows as "Sala preparada". The GIS basemap is a schematic equirectangular map derived from Wikimedia Commons (NordNordWest, CC BY-SA 3.0), not official cartography.

Open [the local demo](http://127.0.0.1:8765), then **Sala de crisis**. In **Preparar incidente**, choose 0–3 trucks, scouts and Squirtle (extinguisher) drones, then **Aplicar flota**. At least one vehicle is required; the default is one of each. Place and ignite the fire, choose/apply wind, then send **Aviso de humo**. The report starts automatic playback and agent decisions. Reset preserves fleet counts; during deliberation, Reset queues a fresh incident and discards the in-flight result and queued ignitions.

- **East:** scout, then contain visible fire.
- **North:** scout, then warn the farm's 100 assumed occupants before returning to containment.
- **West:** scout, then warn threatened town neighbourhoods independently.

These describe exposure scenarios, not scripted outcomes. HappyRobot chooses investigation, containment and independent district warnings from the available information.

## 112 dashboard

The dark CECOP console keeps two illustrated Brunete maps: ground truth on the left, and current/remembered observations with delayed synthetic satellite detections and district overlays on the right. The maps are not georeferenced. The people board, verbatim radio-order ticket and communications log remain visible around the map workspace; setup and recording tools collapse for the pitch. ES/EN changes interface labels, never agent missions or reasons. Cesium/FIRMS and the Sierra de Gata helpers remain dormant compatibility code, not the live map or simulated fire. The gitignored .env is retained, and the unused /api/config endpoint remains localhost-only.

Use Pause, +1 step, speed selection, and Ask agents for manual control. The timeline supports backward/forward scrubbing and replay playback. **Live** returns to the latest state; press Play to continue. Replay is read-only and never repeats platform calls. Up to 1,500 compressed frames are retained in memory, cleared by Reset/restart. Playback pauses when the operator view confirms no active fire remains and no evacuation group is still moving or blocked; this is not an agent all-clear.

## Model and observations

An 80×56 custom educational grid, **not SimFire or PROPAGATOR**. The default map uses the approved illustrated Brunete landscape, with four neighbourhood-inspired town response areas and one farm district. Scale is an approximate demo convention (48 m/cell), not a georeferenced survey. Station: (12,32); farm: (73,21); ignition: (76,41). Roads, land cover, refuge points and district boundaries are schematic and registered to the illustration. Old aerial recordings retain their original background and geography.

Brunete's [municipal census total is 11,261 for 2025](https://brunete.org/nuestro-pueblo/datos-estadisticos/), corroborated by the [Comunidad de Madrid/INE series](https://gestiona.comunidad.madrid/desvan/desvan/AccionDatosUnaSerie.icm?codMun=0262&codTema=1929381). For this scenario, that whole municipal total is allocated as Casco Histórico 3,942 (35%), Prado Alto 2,815 (25%), Prado Nuevo 3,378 (30%), and Valle de los Rosales 1,126 (10%). These are **estimated scenario allocations, not measured district populations or official boundaries**. Farm occupancy is **100 assumed visitors and staff**; the farm website does not establish a verified resident or current occupant count. Farm occupants are separate from the official total. Each district is one independently moving group, not individual residents/household locations. See [population provenance](docs/population-provenance.md).

Eight-neighbor ignition uses a 50% base probability multiplied by target terrain, source intensity and diagonal distance. Multiple neighbors give one draw using strongest exposure. Roads/bare ground block surface spread, including diagonal corner crossing; there is no ember spotting. At wind X=1, Y=0, attempts occur downwind every two steps, crosswind every 10 and upwind every 20; stronger wind accelerates downwind attempts. Failed attempts retry on the next eligible step. Intensity grows from 0.25 toward 1, consumes fuel at terrain-specific rates and fades as fuel runs out. Seeded randomness (default seed 9) makes identical scenarios reproducible while creating uneven fronts. No meters/seconds or operational forecasting accuracy are implied. The drone travels three cells/step and sees radius twelve. The drone has one jet: each step it attempts one observed burning cell within eight cells, with a 40% success chance. Drone targets are safe flight positions, at least three cells from observed fire, selected from safe_containment_positions; routes avoid locally detected fire and retreat if fire approaches. It never deliberately flies to a burning target. Successful jets reduce intensity by 0.20 and wet the cell for 8 steps. Wet cells cannot regrow or ignite; remaining fuel can reignite after drying. Battery and suppressant budgets are removed.

Evacuation requires the drone to reach the settlement and warn people. Groups travel to fixed refuges at 0.8 cells/step and stop if fire blocks their route. This is a simplified group movement model, not route planning. Station dispatch mobilizes an actual moving truck for eight steps after the farmer report. It travels at two road cells/step or 1.6 off-road cells/step from the station (80% road speed), avoids detected fire, and uses five jets, each attempting a distinct observed burning cell per step with 60% success within a ten-cell hose radius. There is no timed teleport or remote suppression. Its position, route, status, local fire observations and route-based arrival estimate are shared with both HappyRobot agents every decision. An obstructed route may invalidate that estimate. Truck movement and local navigation are deterministic; suppression uses seeded randomness; HappyRobot controls the drone mission and its truck attack-sector orders; local navigation handles individual vehicle steering.

Roads are schematic access tracks, not a real transport network. Fire spread is deliberately simplified, without calibrated fuels, slope, atmospheric turbulence or spotting. This update adds operational constraints, not a validated wildfire/flight model.

Left map is ground truth. Right map shows local observations and remembered sightings, plus synthetic satellite hotspots in 8×8 blocks, captured every 12 steps and delivered 12 steps late. Forecast and smoke report are synthetic. Resident movement/status is treated as reported telemetry. Global fire cells and simulation-only ignition logs never enter agent inputs.

The clock animates at 1–8 steps/second, but **pauses during HappyRobot deliberation** so API latency cannot change the outcome. Automatic decisions occur every 16 steps and on farmer reports/forecast changes. No scripted decision fallback.

## HappyRobot integration

[Los Panaderos development workflow](https://platform.eu.happyrobot.ai/hackspainteam9/workflows/mg9barxt86w3/editor/njn4x0maqj9y)

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
node --test tests/test_dashboard.cjs tests/test_pages.cjs
node --check simulator/static/app.js
```

Tests cover spread timing, wind, containment, local knowledge, satellite latency, evacuation, blocked routes, stale/invalid commands, immutable replay, and MCP parsing. Restart the server after Python changes; no hot reload.

[Recorded validation cases](docs/demo-validation.md) include the real HappyRobot run IDs and physical outcomes.

Wind panel: set X/Y independently from -3 to +3 and press Apply wind. Positive X is east, positive Y is south; (0,0) is calm. Values are relative simulation units. Each direction uses the vector projection to determine its spread interval; agents receive the full vector, magnitude and directional attempt intervals and the terrain-adjusted ignition rules.

Interactive setup: before ignition, click the left map to choose the fire origin. Drag the wind compass or use the X/Y sliders. Run & record applies the preview wind, ignites the selected location and starts the farmer report plus HappyRobot loop. Stop recording pauses the simulation; an in-flight decision may still finish. Play recording replays captured states without calling AI; Live exits replay. Download recording saves a simulation JSON file (not a video); Open recording loads it after a restart. Capture is limited to 1,500 frames; a new recording replaces the previous in-memory capture. Reset preserves the last recording until a new one starts.

Forecast-led strategy: HappyRobot treats wind magnitude ≥2 as strong in demo units. If a credible smoke report places unwarned residents downwind, Central sends the drone to warn/evacuate immediately, before thermal confirmation or containment. Strong wind away from residents does not trigger unrelated evacuation. The agent considers both wind components, report uncertainty, people status, drone capacity and actual truck availability. This strategic choice runs in HappyRobot, not a local command-selection rule.

Downwind containment: HappyRobot Central and its nested Drone agent prioritize safe positions covering the advancing downwind fire edge. Candidate telemetry reports leading-edge coverage and signed downwind offset. If containment is inadequate or warning time is short, they prioritize threatened downwind residents. Unknown flanks require scouting; the simulator still enforces fire clearance. Calm wind has no preferred side.

Population exposure: each group occupies one grid cell. When fire reaches that cell, its entire population is counted as burnt once and stops moving. The per-group counter and total are stored in replay frames; reset clears them. This is a simplified demo outcome, not an injury model.

Truck routing minimizes travel time using road and off-road edge costs. Fractional movement carries between steps, giving eight off-road cells per five steps; no time accumulates while parked or blocked. Arrival estimates use the same weighted route.

Drone and truck routes support eight directions. Diagonal edges cost √2 times the distance/time of cardinal edges; fractional movement carries between ticks. Neither vehicle cuts diagonally across blocked corners. Road-corner shortcuts count as off-road unless the whole corner is road.

Drone navigation uses optimistic A* with an octile heuristic. Unknown cells are assumed traversable; a valid route is reused until newly observed fire (including its safety buffer) blocks it or the destination changes. Observed fire remains in local memory until re-observed clear. This is local navigation; HappyRobot chooses the mission and destination.

After warning delivery, residents move independently and the drone becomes available immediately. Automatic mode requests a fresh HappyRobot assignment on that event: prioritize remaining urgent warnings, otherwise scout/contain to support the truck rather than waiting at the settlement.

Observation circles: drone radius 12 (solid), truck radius 9 (blue dashed). The agent view shows both vehicles’ detected fires. Both vehicles share timestamped fire and clear-cell observations. Truck suppression can use a current drone sighting anywhere within its 10-cell hose range, even beyond its own 9-cell sensor radius. It follows shared active sightings within the assigned sector. Stale or unseen fire is never a suppression target. Each vehicle reports its sensor radius to HappyRobot.

Drone-to-truck commands: the nested drone agent returns truck_command (attack_sector or continue), truck_target_x/y and truck_reason alongside its own command. The backend validates both before applying either. Sector orders persist and are visible in truck telemetry and the decision trail. Both agents explicitly treat the truck as the main suppression resource (five jets at 60% success each versus one at 40% per step).

Close scouting and context: first smoke investigation prefers candidate points 3–4 cells from the report, with 3 preferred and detected-fire clearance enforced. Urgent evacuation still takes priority. Each HappyRobot run receives a fog-of-war text grid of current/stale sensor observations (not a screenshot or hidden ground truth), plus the last 12 mission records and measured outcomes. The incident retains up to 128 records; replay frames include recent mission context. Reset starts fresh context. This is in-context adaptation, not training or cross-incident learning.

Suppression context: agents receive current observed intensity, land cover, burned fraction and wetness, plus static terrain. With enough targets, expected successful cooling hits are 0.4 per step for the drone and 3 for the truck; these are not guaranteed extinguished-cell rates. Intense fire needs repeated hits. Counters count complete extinguishments only. The continuous appearance comes from overlapping soft fire and burn fields; physics still uses the 80×56 grid.

Fire spread control: choose 0.25×–4× in the wind panel (default 0.5×). This divides wind-dependent ignition attempt intervals by the factor, rounded to whole steps with a one-step minimum. It leaves the base ignition probability, vehicle speed and suppression unchanged. Agents receive the factor and resulting intervals; recording frames preserve it. Reset restores 0.5×. Fire intensity grows by 0.04 per dry step and terrain burn durations are multiplied by 2, slowing both growth and natural burnout. Distance axes and scale bars use approximate ground distances.

Bundled map: `simulator/static/maps/brunete.jpg`; bounds, source URL, attribution and traced roads in `brunete.json`. Work derived from PNOA máxima actualidad, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) scne.es, retrieved 2026-09-19. Map imagery works offline without an API key. Both views share the historical basemap; only observed simulated fire appears in the agent view. Legacy recordings retain the illustrated background.

Wind-directed response: initial scout candidates now prefer the downwind side of the smoke report, approached around detected fire. Central and Drone prioritize the advancing front for truck orders and containment; truck local targeting prioritizes leading cells within its assigned sector. Calm wind has no preferred direction.

District selection: HappyRobot receives all five district IDs (town, town_north, town_south, town_rosales, farm), neighbourhood geometry, population, status, refuge and wind exposure. These represent Casco Histórico, Prado Alto, Prado Nuevo, Valle de los Rosales and El Álamo Farm respectively. Evacuation commands require an explicit district_id and warn only that district. Missing or invalid IDs are rejected; there is no nearest-district fallback. Duplicate warning reservations are reconciled without inventing new strategic destinations: one assignment is retained, redundant vehicles are held, and HappyRobot is asked to reassign them.

## Configurable fleet and additional fires

Before ignition, use the **Medios de respuesta** panel to choose 0–3 trucks, scouts and Squirtle drones independently, then click **Aplicar flota**. At least one vehicle is required. Counts persist on Reset; reset before changing a running fleet. Toggle **Añadir fuego en el mapa** and click the ground-truth map during an active incident to add a hidden ignition. New fires become agent evidence only through sensors or delayed satellite. The first extinguisher is displayed as Squirtle; its command ID remains drone-1.

While HappyRobot is deciding, additional map clicks queue validated ignitions without advancing the clock or changing the world seen by the in-flight decision. The duty banner shows the queued count; they are applied after deliberation. Reset clears the queue. New fires become agent evidence only through observations; the dashboard does not assign local missions.

Los Panaderos development v21 nests Scout Agent alongside the extinguisher under Central. Central consults Scout Agent first, reviews its assessment, then issues coordinated orders. Scouts follow 1–6 agent-selected patrol waypoints, move 4 cells/step, see radius 12 and have loudspeakers for district evacuation but no suppression jets. A separate observed focus (at least 12 cells from the original report and prior scout alerts) generates a simulated radio report and triggers reassessment. This is a digital event, not a telephone call. Patrols continue between frozen decision runs; replay stores every scout. Central ranks observed/reported fires by district exposure, wind and warning time.

Scouts can receive `evacuate_town` / `evacuate_farm` with an explicit `district_id`. They fly to the selected district, deliver the warning, and become available while residents travel to refuge. HappyRobot chooses the warning vehicle using positions and competing tasks. Duplicate warnings for one district retain an existing warning assignment when present, then prefer a scout and a stable vehicle ID. Redundant vehicles are held and reported to HappyRobot through a coordination_conflict event for reassignment.

Every extinguisher and truck receives its own ID-specific order in `extinguisher_orders` and `truck_orders`. Empty roles use empty arrays, have no sensor coverage and perform no actions. Commands validate as one transaction before any vehicle changes. Fleet counts, positions and missions are included in recordings and agent context.

Scout confirmation of the original fire triggers immediate mission reassessment, without waiting for Squirtle to arrive at its old waypoint. A newly blocked target similarly requests a replan once; remembered fire remains excluded from safe containment positions. New destinations and strategic missions still come from HappyRobot. The fire-placement cursor appears only while Add fire is armed and placement is available; busy-state clicks retain the existing ignition queue behavior.
