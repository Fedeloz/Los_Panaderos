# Devin brief — finish the combined 112 + Cesium + HappyRobot demo

You are implementing in `/Users/javiercruz/Desktop/HACKSPAIN`, git repo `Fedeloz/Los_Panaderos`, branch `main` (currently at `07442bc` plus **uncommitted local work**). HackSpain Team 9 (Los Panaderos). Audience: judges watching **agents decide** on a **client-looking 112 operations console** over **Sierra de Gata**.

Read this whole file before editing. Do not start from a blank architecture.

---

## 0. Mission (one sentence)

**HappyRobot remains the only decision brain.** The UI must look like a Spanish 112 / Protección Civil console on real Sierra de Gata terrain (Cesium, top-down), with the existing 80×56 educational fire simulator georeferenced onto that bbox, plus NASA FIRMS as a *separate* real-hotspot layer.

If you “upgrade physics to Rothermel” or “replace HappyRobot with local heuristics,” you have failed.

---

## 1. What is already done (do not redo, do not revert)

Uncommitted local files (keep and improve):

| Path | Role |
|---|---|
| `simulator/geo.py` | Grid ↔ lon/lat for Sierra de Gata bbox `west=-6.82, south=40.13, east=-6.55, north=40.32` (same as PR `wildfire-system` `geo/config.py`) |
| `simulator/engine.py` | `state()` now includes `geo=geo_overlay(...)` |
| `simulator/server.py` | `GET /api/config` (localhost only) serves Cesium/NASA from gitignored `.env`; `place_fire` accepts `lon`/`lat` |
| `simulator/static/index.html` | 112 chrome, ES/EN toggle, Cesium `#globe`, belief canvas, setup `<details>` |
| `simulator/static/ops.js` | Cesium SCENE2D, FIRMS WMS, fire ellipses, drone/truck/people points, click-to-ignite |
| `simulator/static/app.js` | i18n, KPIs, busy elapsed timer, `initOpsMap` / `updateOpsMap`, canvas fallback |
| `simulator/static/style.css` | KPI grid, `#globe` height |
| `tests/test_geo.py` | Round-trip cell↔lonlat; `state()['geo']['name']=='Sierra de Gata'` |
| `.env` | **EXISTS, GITIGNORED.** Contains `CESIUM_API_KEY` and `NASA_KEY`. **Never commit, never print, never copy into source.** |

Keys are loaded by parsing `ROOT/.env` in `simulator/server.py` (`_env_file`). `GET /api/config` must stay **127.0.0.1 / localhost Host only**.

Run: `python3 -m simulator.server` → `http://127.0.0.1:8765`. Restart after Python changes (no hot reload).

MCP for HappyRobot: gitignored `.cursor/mcp.json`, server name `happyrobot-mcp-eu-all`. Node 18 on this machine; mcp-remote needs Node 20+. Existing config uses `npx -p node@22 -p mcp-remote mcp-remote https://mcp.platform.eu.happyrobot.ai/workflows/mcp`. Do not break this.

---

## 2. Hard constraints

### Do

- Keep `simulator/` as the demo that **runs agents**.
- Keep dual maps: **Situación real** (Cesium) vs **Lo que el sistema ve** (canvas / local sensors + delayed satellite).
- Keep HappyRobot workflow integration in `simulator/happyrobot.py` (trigger_run, parse `report_to_central`, no scripted command fallback).
- Keep `Simulation.apply` validation (standoff, safe_containment_positions, stale/duplicate commands, one repair then pause).
- Keep clock **paused while `busy`** (API latency must not advance fire). Show deliberation + elapsed seconds (already started).
- Keep Replay / recording (pitch backup when a live run takes ~60s).
- ES/EN header toggle; do **not** translate HappyRobot `mission`/`reason` strings.
- Labels: town/station grid `(12,44)` ≈ Hoyos; farm `(65,10)` ≈ caserío hacia Gata; fire default toward `(65,43)`.
- Always disclose: simulated front ≠ FIRMS dots; grid ≠ cadastral map; not Rothermel.

### Do not

- Do **not** `git add .env`, `.cursor/mcp.json`, `.runtime/`, credentials, Cesium JWT, NASA MAP KEY.
- Do **not** invent Overpass / random-Spain / `simulator/scene.py` rasterizer. Geo pipeline lives on branch **`wildfire-system`** (PR #1).
- Do **not** reimplement Catastro WFS filter, PostGIS load, or Rothermel `propagate` / `run_scenario`. Those are Guillermo’s unfinished work.
- Do **not** empty `console/` on `wildfire-system` unless you have spare time *after* the HappyRobot demo is pitch-ready. Prefer finishing `simulator/` first.
- Do **not** pop `git stash@{0}` (“local demo latency and MCP Node 22”) onto this tree; it conflicts with current `main`.
- Do **not** add pip/npm dependencies unless unavoidable. Simulator is **stdlib + browser**. Cesium is CDN. Do not add a Vite app unless Track B leftover time.
- Do **not** expose MCP tokens to the browser. `/api/config` may expose Cesium/NASA to **localhost only** (needed for Ion + FIRMS).
- Do **not** poll FIRMS harder than needed (key limit 5000 tx / 10 min). One WMS layer is enough.
- Do **not** claim people are safe unless simulator `groups[name].status=='safe'`.
- Do **not** fly the drone to burning cells; containment targets are flight positions from `safe_containment_positions`.

---

## 3. Architecture (must preserve)

```
Browser 112 UI
  Cesium SCENE2D  ← ion token via /api/config
  FIRMS WMS       ← NASA_KEY via /api/config
  fire/drone/truck entities from /api/state  (grid → lon/lat via geo)
  belief canvas   ← same /api/state observation/memory/satellite
        │
        ▼
simulator/server.py  Controller  (clock, pause on busy, replay frames)
        │
        ├─ engine.py   physics, apply(), payload() for agents
        ├─ geo.py      bbox + cell_to_lonlat / lonlat_to_cell
        └─ happyrobot.py  stdio MCP → EU workflow → one structured command
```

Grid mapping (already in `geo.py`):

- `x` east: `lon = west + (x+0.5)/width * (east-west)`
- `y` south: `lat = north - (y+0.5)/height * (north-south)`
- Click Cesium → `place_fire` with `{lon,lat}` → `lonlat_to_cell` → existing `place_fire(x,y)` rules (interior cell, not too close to station).

HappyRobot payload shape must remain: `event_type`, `incident_id`, `world_state` JSON (farm, town, station, people, fire_truck, wind, satellite, rules, mission…), `drone_telemetry`, `thermal_detections`, `human_messages`. Agents must **not** receive global `cells` or ignition-only simulation logs.

---

## 4. Work to finish (priority order)

Treat this as a **polish + reliability** pass on the combined demo, then extras if time.

### P0 — Demo must not lie or crash on stage

1. Verify `python3 -m unittest discover -s tests -v` stays green (currently 47 tests). Add tests if you change `place_fire` lon/lat, `/api/config` host check, or geo math.
2. Cesium init failure: if no token, Ion error, or `Cesium` undefined, **keep showing** `#truth` canvas (`hidden` false). Never leave a black `#globe` with no fallback.
3. `ops.js`: don’t rebuild all fire entities every poll if possible (already keyed by `lastFireKey`). Cap entity count if a huge fire lags the browser.
4. FIRMS layer: if WMS fails, continue without it; show a small “FIRMS unavailable” note. Do not block HappyRobot.
5. `/api/config` must 403 for non-local Host. Do not log tokens.
6. Click-to-ignite on globe must respect `ignited`/`busy`/`replay` (already sketched).
7. Restart server after Python edits; hard-refresh the page.

### P1 — 112 experience (judges)

1. Belief canvas (`pixelMap` in `app.js`): make it look less like Minecraft. Keep it **2D bird’s-eye**. Better olive/ochre/scrub, footprints, tracks; keep sensor rings, satellite blocks, teal safe-containment dots, drone/truck.
2. Cesium: stay **SCENE2D / nadir**. No tourist tilt. Rectangle = Sierra de Gata bbox. Optional: faint labels for Hoyos / Gata / parque as entities (not a 3D city).
3. Visual distinction: simulated fire (orange ellipses) vs FIRMS (WMS). Footer/explain already says this; make it visible on the map (legend).
4. KPIs: people unwarned / evacuating / safe / exposed; drone mode+status; truck status; agent run count + last latency; threat Watch vs Active.
5. Setup `<details>`: collapse after farmer call (`called`). Keep Reset, Play, Replay, Ask agents reachable.
6. Busy state: “Agentes deliberando · reloj en pausa · Ns”. Disable mutating controls; allow pause/timeline as today.
7. i18n: complete ES/EN for remaining English buttons (Ignite, Ask agents, Run & record, etc.). Mission text from the model stays as-is.

### P2 — Nice if time (do not derail P0)

1. Open-Meteo chip for Gata (no API key). Display only; **do not** silently overwrite simulator wind (that would change HappyRobot outcomes without the operator applying wind).
2. Drone/truck route polylines on Cesium from `drone.route` / `truck.route` (grid points → lon/lat).
3. Smoke puff / last_drop water on Cesium.
4. README: 5 lines on combined demo + “keys in .env, never commit”. Do not dump secrets.

### P3 — Out of scope unless everything above is done and you still have time

- Branch `wildfire-system` empty `console/` Cesium app (Makefile `npm run dev`).
- Docker PostGIS, Catastro loader, Rothermel propagate.
- WorldCover/DEM GeoTIFF drape (files live on Guillermo’s machine under `data/derived/`, often gitignored).

---

## 5. How to run and test

```sh
cd /Users/javiercruz/Desktop/HACKSPAIN
python3 -m unittest discover -s tests -v
python3 -m simulator.server
# open http://127.0.0.1:8765
```

Manual pitch path:

1. ES/EN toggle works.
2. Cesium shows Sierra de Gata top-down (or canvas fallback).
3. Place ignition on globe or default report cell.
4. Set wind, **2 · Smoke report** (or Run & record).
5. Clock pauses during HappyRobot; drone/truck still have last command when it returns.
6. Right map shows local knowledge only, not full fire.
7. Replay does not call HappyRobot.
8. Reset works when not busy (busy still blocks reset today; do not need to change unless easy).

HappyRobot requires MCP OAuth already done on this laptop. If MCP fails, UI must still show maps; error in `#error` / connection line — never invent a fake contain/evacuate command.

---

## 6. Git

- Do not commit unless the operator asks.
- If you commit: no `.env`, no keys, no `.runtime/last-run.json` if it contains secrets.
- Do not force-push. Do not rewrite `main` history.
- Do not merge `wildfire-system` into this work unless explicitly asked.

---

## 7. Definition of done

- Tests pass.
- Local demo: 112 console + Cesium (or honest fallback) + belief map + HappyRobot still the only commander.
- Legend: simulated fire vs FIRMS.
- `.env` still gitignored and unstaged.
- README/footer do not claim operational forecast, Catastro completeness, or Rothermel.

Start by reading `simulator/static/index.html`, `ops.js`, `app.js`, `server.py`, `geo.py`, `happyrobot.py`, `engine.py` (`apply`, `payload`, `state`), and `tests/test_geo.py`. Then implement P0 → P1 → P2.

---

## 8. File-level notes (current code)

### `simulator/geo.py`
- Constants: `WEST, SOUTH, EAST, NORTH = -6.82, 40.13, -6.55, 40.32`
- `cell_to_lonlat(x, y, width=80, height=56)` uses cell **centers**.
- `lonlat_to_cell` clamps to grid; **place_fire still rejects** edge cells (`1<=x<width-1`) and cells within 6 of station `(12,44)`.
- `overlay()` places: Hoyos `[12,44]`, Gata foothills `[65,10]`, station same as town.

### `simulator/server.py`
- `_env_file()` reads `ROOT/.env` (`CESIUM_API_KEY`, `NASA_KEY`). Never log values.
- `GET /api/config`: Host must be `127.0.0.1` or `localhost`; returns `{cesium_token, nasa_key, place}`.
- `place_fire`: `{x,y}` **or** `{lon,lat}` via `lonlat_to_cell`.
- POST `/api/action` requires `Origin` in `{http://127.0.0.1:8765, http://localhost:8765}` and header `X-Simulator-Request: 1` (already in `app.js` `act()`).
- Serves `/`, `/app.js`, `/ops.js`, `/style.css` only. If you add files, add them to this whitelist.
- Clock: `_clock` skips `step()` when `busy` or replay cursor set.

### `simulator/static/ops.js` (gaps)
- Hardcoded bbox; prefer `s.geo` once state exists, and `/api/config` place.
- If `!opsConfig.cesium_token`, `initOpsMap` returns with `opsReady=false`. **Hide `#globe` / show `#truth`** so operators are not staring at an empty Cesium widget.
- Wrap `Cesium.Viewer` in try/catch (Ion 401, terrain fail).
- FIRMS: `fires_modis_24` WMS; optional `fires_viirs_24` is extra traffic — skip unless FIRMS looks empty and you stay under 5000 tx/10 min.
- Click handler uses `pickEllipsoid`; in SCENE2D `pick`/`globe.pick` may be more reliable — test click-to-ignite.
- Fire ellipses: 140 m radius; many cells will overlap. Cap to e.g. 400 entities or cluster; keep orange = simulated, not FIRMS.
- Missing: drone/truck **route polylines**, containment target marker, legend, Hoyos/Gata labels.
- `window.initOpsMap` / `window.updateOpsMap` / `window.opsReady` are the contract with `app.js`.

### `simulator/static/app.js` (gaps)
- `I18N` exists but **toolbar, KPI labels, wind buttons, timeline, footer are still English**. Translate all chrome; never translate `s.mission` / trail `reason`.
- `pixelMap`: 10px cells, `imageSmoothingEnabled=false` — looks like Minecraft. Keep 80×56 bird’s-eye; improve fills (olive/ochre, road tint, footprints, tracks). Belief mode must still hide unobserved fire.
- After farmer call, **collapse** `#setupPanel` (`open=false`) so maps dominate.
- Busy elapsed: keep; make it obvious (header or `#connection`).
- Init: `await initOpsMap(); if (opsReady) truth.hidden=true`. Invert: only hide canvas when globe actually rendered.

### `simulator/static/index.html`
- Cesium 1.124 CDN (widgets.css + Cesium.js) already included; `#globe` then `#truth` (hidden).
- Title: `Central de operaciones · Sierra de Gata`.
- Inspect HappyRobot is `<details>` collapsed — keep it that way for the pitch.

### `simulator/happyrobot.py`
- Workflow `WORKFLOW = '01a0b8ea-d9af-71f3-9fb7-8a469f9ac25b'`
- Edge `EDGE_NODE = '01a0b96a-d5b4-771c-809c-850010ddbb67'`
- MCP config `.cursor/mcp.json`, server `happyrobot-mcp-eu-all`.
- Do not change workflow IDs, payload redaction, or command parsing unless a bug blocks the demo.

### `simulator/engine.py`
- `state()` already includes `geo=geo_overlay(...)`.
- `place_fire` needs int cells; `lonlat_to_cell` already returns ints.
- Do not change spread, standoff, truck/drone physics, or `payload()` visibility rules.

---

## 9. Tests to add

Keep all existing tests green (`python3 -m unittest discover -s tests -v`, currently 47).

Add to `tests/test_geo.py` or `tests/test_simulator.py`:

1. `lonlat_to_cell` of Hoyos center ≈ `(12, 44)`.
2. `place_fire` via Controller `action('place_fire', {lon, lat})` near default report maps to an interior cell (use Controller from tests the same way existing action tests do).
3. Out-of-bbox lon/lat clamps, then `place_fire` may still 400 if the clamped cell is on the edge or too close to station — that is correct; UI should surface the error (already `#error`).
4. Optional: `/api/config` 403 when Host is not localhost (can unit-test the host check by extracting a helper if you want; do not start a second server if tests already cover Controller without HTTP).

Do not add tests that require Cesium, NASA, or live HappyRobot.

---

## 10. Known product bugs / polish list

Fix these while you are in the files:

1. `#globe` empty when token missing — hide globe, show canvas, one-line “Mapa ilustrado (Cesium no configurado)”.
2. README still says Cártama schematic; update **a short combined-demo paragraph** (Sierra de Gata overlay, educational grid, FIRMS ≠ sim fire, keys in `.env`).
3. Subhead is mixed EN while page is ES-first.
4. `label(..., 'REFUGE')` on belief map not i18n (`REFUGIO`).
5. Fire entity rebuild uses a giant string key; if it lags, hash or count+bbox instead.
6. Do not call `Cesium.Terrain.fromWorldTerrain()` if it forces 3D; SCENE2D nadir is mandatory. If terrain init tilts the camera, drop terrain and use ellipsoid only.

---

## 11. Suggested implementation order (commits optional)

You may leave work uncommitted. If you commit (only if asked), small commits:

1. P0 reliability: Cesium fallback, FIRMS failure note, tests for lon/lat place_fire, README disclaimer.
2. P1 112 polish: i18n chrome, setup collapse, legend, belief canvas styling, labels.
3. P2 extras: Open-Meteo display chip, vehicle polylines.

Do not open a PR unless asked.

---

## 12. How the operator will judge your work

Open `http://127.0.0.1:8765` after `python3 -m simulator.server`.

Pass:

- Looks like 112 / Protección Civil, not a CS lab.
- Left: real Gata geography top-down (or honest illustrated fallback).
- Right: fog of war / delayed satellite, not a clone of the left.
- Click globe → ignition (or canvas if globe off).
- Smoke report → HappyRobot (clock pauses, then drone/truck move from **parsed command**).
- ES/EN toggle for chrome.
- Footer/legend: simulated fire vs FIRMS; not Rothermel; not Catastro.
- `git status` does **not** stage `.env`.

Fail:

- 3D tilted globe “for wow”.
- Replacing HappyRobot with local if/else.
- Merging Catastro/Rothermel/PostGIS into this demo.
- Printing or committing Cesium/NASA keys.
- Breaking unittest suite.

