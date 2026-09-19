# Demo validation

Real HappyRobot development runs, 19 September 2026. Each wind case starts from the same scouted state. Commands were applied to the custom simulator and advanced 60 steps.

| Case | Actual decision | Run | Physical result |
|---|---|---|---|
| farmer | scout | ec84bd53-4414-42fd-993d-8afdce67290c | Scout command accepted |
| east | contain | 5abb0f96-179e-4eeb-8f66-eb88c99803c1 | 19 cells extinguished by drone |
| north | evacuate_farm | 3a8f136b-3f7a-4772-bac0-392ebfe465f4 | Farm residents reached refuge |
| west | evacuate_town | 424e613d-4c2c-450c-b322-8f0849b0caee | Town residents reached refuge |

Local checks: 16 unit tests, JavaScript syntax check, rendered browser inspection, HTTP replay/Live checks. This validates the staged scenarios; model outputs remain nondeterministic, and invalid actions are rejected.

## Safe drone and moving truck update

20 local tests passed. Two real development runs verified scout to (59,43), then containment from non-burning (62,43), with the truck at (19,42) present in the agent decision. Safety checks were applied after every simulated step.

- scout: 11880c35-d2d0-4ecb-a1c6-063750ed64a3
- contain: d994e781-0147-47c1-a163-3245c443f2d7

## Forecast-led evacuation (development version 9)

All three tests began with a farmer report and empty local thermal detections. Decisions came from the nested HappyRobot workflow, without a local strategy fallback.

- strong_north: evacuate_farm; run a91e95b9-c761-430c-9532-790f9bd406af.
- strong_west: evacuate_town; run 421ca8e2-46ea-41fd-a993-7feae7a39cdc.
- strong_away: scout; run 09b221a0-3d08-4379-9785-c48a6a0c70e3.

## Downwind strategy — development v11

Live HappyRobot checks passed: weak east wind with observed fire selected contain at safe downwind position (69,43); strong north wind selected evacuate_farm; strong west wind selected evacuate_town. The west case initially failed in v10; v11 adds observation-derived population/wind geometry and asks both agents to verify the threatened settlement. Local suite: 29 tests pass, including downwind candidate clearance and population alignment. These are sampled model runs, not a guarantee of every future decision.

## Drone-to-truck coordination — development v14

Live strong-north-wind farmer-call check returned evacuate_farm plus truck attack_sector (65,43). The truck_reason explicitly cited its six-cell suppression capacity and mobilization delay. Both commands passed simulator validation together. Local suite: 42 tests pass, including persistent truck orders and invalid-order rejection.

## Close scouting and context — development v15

Live weak-east farmer-call check selected scout (62,43), exactly three cells west of report (65,43), plus truck attack_sector (65,43). The known grid kept the unobserved ignition cell unknown. Mission records include selected actions and observed outcomes; the local suite has 45 passing tests. Map input is a symbolic text grid, not a vision attachment.

## Explicit district selection — development v17

67 local tests passed. A live farmer-call run with smoke at (30,23) and wind (-3,0) returned evacuate_town with district_id town_north. The command was accepted; after drone arrival only North became evacuating, while Centre, South and Farm remained unwarned. Tests also reject missing, unknown and mismatched district IDs and verify district context. This is one sampled model run.
