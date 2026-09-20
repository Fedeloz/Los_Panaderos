# Devin prompt — pull origin/main (Brunete simulator) into our 112 dashboard

You are in `/Users/javiercruz/Desktop/HACKSPAIN`. **Do this merge. Do not ask to start over.**

## Situation

Local `main` is **`d88c85d` plus uncommitted 112/Cesium/Gata chrome**.  
`origin/main` is **4 commits ahead** (already fetched):

```
082836b Document district-aware HappyRobot v17 and live validation
cb7d6ed Compact district labels and restore observation visibility contrast
e447ed4 Add illustrated district map, population allocation and independent evacuation
4f635d2 Add Brunete aerial terrain, slower fire dynamics and observation zones
```

The teammate replaced the old 2-settlement Cártama/Gata schematic with a **Brunete illustrated district scenario**: 3 town districts + El Álamo farm, PNOA-based illustrated PNG, `observation-map.js`, slower fire, land cover, `reset_pending` while HappyRobot is busy, HappyRobot editor `gro72m7m8yy3`.

Our uncommitted work is a **112 CECOP dashboard** (dark ops chrome, people board, mission ticket, radio log, ES/EN) plus a **Sierra de Gata Cesium/FIRMS overlay** (`simulator/geo.py`, `ops.js`).

**Geography conflict (resolve this way, do not waffle):**  
Incoming **Brunete engine + illustrated maps win**. Do **not** keep claiming Sierra de Gata / Hoyos on Brunete physics. The Brunete JSON says the illustrated map is **not georeferenced**. Stretching it onto the Gata Cesium bbox would be a lie. **Left map = their AerialView / illustrated Brunete.** Keep Cesium/FIRMS/`geo.py` only if you can isolate them behind a dead code path; preferred: leave `ops.js` and `.env` in the tree unused rather than showing Gata. Do **not** delete `.env`. Do **not** commit secrets.

Do **not** pop `git stash@{0}` (latency/MCP). Do **not** force-push. Do **not** commit unless asked.

---

## Safe merge procedure

Working tree is dirty. Do **not** `git pull` onto dirty files.

1. Confirm `git fetch` already has `origin/main` = `082836b`. If not, `git fetch origin`.
2. Snapshot local UI (optional): copy `simulator/static/{index.html,style.css,app.js}` to `/tmp/gata-dashboard/` so you can diff chrome after.
3. Stash **only tracked** dashboard/sim files (not `.env`):

```sh
git stash push -u -m "112 dashboard + gata overlay before brunete pull" -- \
  README.md simulator/engine.py simulator/server.py \
  simulator/static/app.js simulator/static/index.html simulator/static/style.css \
  simulator/geo.py simulator/static/ops.js tests/test_geo.py \
  docs/devin-dashboard-brief.md docs/devin-implementation-brief.md
```

If `-u` would stash `.env`, **abort** and stash without `-u`, keeping untracked geo/ops/docs as files. **Never stash `.env` into a patch that could be committed.** `.env` is gitignored — leave it on disk.

4. Fast-forward:

```sh
git pull --ff-only origin main
```

HEAD must become `082836b`. Confirm `simulator/static/maps/brunete-illustrated.png` exists.

5. Restore ours on top:

```sh
git stash pop
```

Expect conflicts in `simulator/static/{app.js,index.html,style.css}`, `simulator/server.py`, `simulator/engine.py`, `README.md`. **Resolve by the keep/ours table below. Do not take “ours” wholesale.**

6. If stash pop fails, `git checkout stash -- <file>` is too blunt. Resolve file by file.

---

## What to KEEP from origin/main (theirs) — simulator truth

| Item | Why |
|---|---|
| `simulator/engine.py` | Districts, independent evacuation, `district_id`, GEOGRAPHY from brunete JSON, slower fire, observation sharing |
| `simulator/terrain.py` | Land cover / illustrated polygons |
| `simulator/static/maps/*` | brunete.jpg, brunete-illustrated.png/json |
| `simulator/static/observation-map.js` | Belief-map district overlay |
| `simulator/static/vendor/*` | bootstrap-icons for that overlay |
| `simulator/static/app.js` **AerialView IIFE** | Their Brunete illustrated renderer (images, districts). **Replace our Gata-labeled AerialView with theirs.** |
| `tests/test_simulator.py`, `tests/test_districts.py` | New physics/district tests |
| `docs/mvp-agent-prompts.md`, `docs/population-provenance.md`, `docs/demo-validation.md` | v17 prompts + Brunete census provenance |
| `simulator/happyrobot.py` EDITOR URL | `.../editor/gro72m7m8yy3` |
| `reset_pending` in `server.py` Controller | Reset during busy queues instead of 400 |
| Static whitelist extras | `/observation-map.js`, `/vendor/bootstrap-icons.js`, `/maps/brunete.jpg`, `/maps/brunete-illustrated.png` |
| Default spread 0.5× if that is their HTML default | Match engine |

Take **their** `engine.py` almost entirely. If our only engine change was `geo=geo_overlay(...)` in `state()`, **drop it** unless you add a Brunete-honest geo dict. Do not keep Gata `PLACE` in `state()['geo']`.

---

## What to KEEP from our stashed dashboard (ours) — chrome only

| Item | Why |
|---|---|
| 112 CECOP layout | mast, 112 badge, KPI people board, duty/busy banner, order ticket, radio log, setup below maps, ES/EN |
| `style.css` dashboard system | Dark ops console we already reviewed — merge in **their** tiny extras (`.map-legend`, `.population-source`, observation contrast) |
| `render()` chrome | peopleUnwarned/Evacuating/Safe/Exposed, `renderRadio`, `is-busy` banner, setup collapse, `reset_pending` UI if they added a disabled reset |
| IDs | Keep all their new IDs (`populationSource`, legend classes) **and** our dashboard IDs |
| `ops.js` + `/api/config` + `_env_file` + `local_host` | Keep files; **do not show Gata Cesium as Situación real** while the sim is Brunete. Prefer illustrated AerialView on **both** maps (truth = illustrated, belief = AerialView fog + `observation-map.js`). You may keep `/ops.js` served unused, or hide `#globe`. |
| Cesium globe init-on-hidden fix | Irrelevant if globe stays hidden; keep the resize guard if globe remains in HTML |
| ES/EN | Translate **chrome**. District names / mission / provenance links stay as in origin (Spanish place names). |

**Do not** restore Cártama, Hoyos, Gata foothills, `ES-2026-GATA` as the live incident. Mast should read **Brunete · Madrid** (or Comunidad de Madrid), 112 / CECOP / Protección Civil. Incident code can be `ES-2026-BRUNETE` or geography.id `brunete-illustrated-v1`.

People board must work with **four groups**: `town_north`, `town`, `town_south`, `farm` (not just town+farm). Use `g.name` / `short_name` from engine groups. Evacuation is **per district** (`evacuate_town` + `district_id`).

---

## server.py merge (explicit)

Start from **origin/main** `server.py`, then re-apply **only**:

- `_env_file()`, `local_host()`, `GET /api/config` (localhost Host, tokens from `.env`) — optional if Cesium unused; keep it, it is harmless
- Serve **union** of static paths:

```
/, /app.js, /ops.js, /style.css,
/observation-map.js, /vendor/bootstrap-icons.js,
/maps/brunete.jpg, /maps/brunete-illustrated.png
```

MIME jpg/png as on origin.

- Keep origin `reset_pending` behavior (reset during busy is queued).
- Keep origin `place_fire` as they have it; if we added lon/lat, keep lon/lat **only** if it still maps through Brunete grid (no Gata bbox). If Cesium is hidden, lon/lat is unused — still ok to keep `lonlat_to_cell` if geo.py stays, but do not feed Gata coordinates into Brunete cells.

---

## index.html merge (explicit)

Start from **our** CECOP `index.html` structure, then:

- Title/mast: Brunete, not Sierra de Gata
- Keep `#globe` hidden (or omit Cesium script if unused). `#truth` and `#belief` canvases visible; truth is illustrated AerialView
- Add origin’s belief legend + `#populationSource` (census attribution) — footer must keep Brunete Ayuntamiento + PNOA CC BY 4.0 links from origin README/footer
- Scripts, order: `bootstrap-icons.js`, `observation-map.js`, `ops.js` (optional), `app.js`
- Keep `spreadFactor` (origin default 0.5)
- Keep record tools collapsed; keep Play / Ask / Reset in duty strip
- Include origin `reset_pending` affordance if their app.js disables reset until the in-flight run returns — match their UX

---

## app.js merge (explicit)

1. Take **entire AerialView IIFE from origin/main** (Brunete images `/maps/brunete-illustrated.png` and `/maps/brunete.jpg`). Do not keep our `AerialLabels` Gata place loop if it conflicts; you may keep `window.AerialLabels` **only** if origin already uses it or you add labels without rewriting their paint.
2. Keep origin `observation-map.js` hookup (whatever origin `app.js` does after AerialView — district labels, population source).
3. Below that, keep **our** I18N / `render` / radio / people board, but:
   - People chips iterate **all** `s.people` districts
   - Do not look up `s.geo.places` Gata ids
   - Use `g.name` / `g.short_name` / `g.kind`
   - Honor `s.reset_pending` (show “reinicio al terminar la deliberación”, enable Reset to queue)
4. Wire `pixelMap` to AerialView as origin does (illustrated terrain for truth; belief fog + observation overlay)
5. Keep `act()`, poll, wind, spread, record, `X-Simulator-Request`

If origin `app.js` is one file that both draws AerialView and a lab UI, **do not** paste their lab header back. Steal renderer + observation integration only.

---

## README

Merge: keep 112/how-to-run, **replace Gata combined-demo paragraph** with Brunete illustrated districts + FIRMS/Cesium **not** described as the live place unless you actually show it. Copy origin’s Brunete census / PNOA attribution. Keep HappyRobot pause/replay disclaimers. Update wind/east-north-west scenario text if districts changed (North/Centre/South + farm).

---

## Tests

```sh
python3 -m unittest discover -s tests -v
node --check simulator/static/app.js
node --check simulator/static/ops.js
node --check simulator/static/observation-map.js
```

All origin tests must stay green (including `test_districts.py`). If `tests/test_geo.py` assumes Gata `state()['geo']['name']=='Sierra de Gata'`, **change or drop those assertions** so they do not force a fake Gata overlay. Geo helpers may remain as unused code.

Hard-refresh `http://127.0.0.1:8765`. Restart server after Python changes.

---

## Definition of done

- HEAD includes `082836b` history (Brunete maps on disk)
- 112 dashboard chrome still looks like CECOP (not HackSpain lab)
- Left map is Brunete illustrated terrain; right map is agent belief + district observation overlay
- Four population groups warn independently
- Reset during HappyRobot busy queues (`reset_pending`)
- No “Sierra de Gata / Hoyos / Cesium is the place” copy on a Brunete sim
- `.env` unstaged; stash@{0} latency stash **untouched**
- Tests green
- Nothing committed unless asked

Begin with stash → ff-only pull → stash pop → resolve using this table. If a conflict is AerialView vs our chrome, **AerialView = theirs, chrome = ours.**
