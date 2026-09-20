# Devin prompt — design a CECOP-grade 112 wildfire dashboard

Read this entire brief before touching a file. Then implement. This is **visual product design** of an emergency operations console. You are not adding features, not changing fire physics, not touching the map renderer.

Workspace: `/Users/javiercruz/Desktop/HACKSPAIN`  
Repo: `Fedeloz/Los_Panaderos`  
Branch: `main` at `d88c85d` **plus uncommitted local work** (Cesium, geo overlay, 112 chrome). Do not revert that work; redesign on top of it.  
Team: HackSpain Team 9 · Los Panaderos  
Demo URL: `http://127.0.0.1:8765` (`python3 -m simulator.server`)

---

## 0. The story you are designing for

Imagine a 3-minute pitch in front of judges. A laptop is mirrored to a projector. The operator (Javier) does almost nothing after the opening:

1. The screen already looks like **Central 112 Extremadura / Protección Civil**, not a student project. Dark duty header, red **112** mark, incident **Sierra de Gata · Cáceres**. Two giant maps.
2. He clicks the terrain, sets wind, hits **2 · Aviso de humo**.
3. For ~60 seconds the physics clock **freezes**. The dashboard must scream that **nested HappyRobot agents are deliberating** (Central → drone). This pause is the product, not a spinner bug.
4. A mission string appears as a **radio order**. Gold drone and crimson truck start moving on both maps. Right map is fog-of-war; left map is the real place (Cesium + optional NASA FIRMS).
5. Judges understand in one glance: **people at Hoyos / the caserío**, **what the system can see**, **what the agents just decided**.

If a judge’s first impression is “hackathon toolbar” or “Minecraft with Cesium bolted on,” you have failed — even if the agents work.

The **maps themselves** (olive groves, terracotta roofs, fire, drone animation) are already owned by a teammate. Your job is everything **around** those maps: the desk, the lamps, the radio, the people board, the order ticket.

---

## 1. HARD STOP — do not touch AerialView

In `simulator/static/app.js`, lines **1–153** are:

```js
window.AerialView = (() => {
  // terrain, fire, smoke, drone, truck, roofs, interpolation...
  return {draw(canvas,s,belief){...}, forget(canvas){...}};
})();
```

**This IIFE is sacred.** A teammate (fedeloz) is actively improving the aerial map. You will:

- NOT edit any line inside that IIFE
- NOT “fix Minecraft,” restyle parcels, change smoke, change vehicle sprites, change interpolation
- NOT replace AerialView with Cesium on the belief map
- NOT change `function pixelMap(canvas,s,belief){if(window.AerialView)window.AerialView.draw(canvas,s,belief)}` except to keep that one-liner working
- NOT change `window.AerialLabels` keys the IIFE reads (`ignition smoke drone engine wind truth belief`) — you may still update the **string values** via existing `applyLang()` because that lives **below** the IIFE

**How to check:** after you work, `git diff -U0 simulator/static/app.js` must show **no hunks inside the AerialView IIFE**. If a formatter or merge touches it, revert that region.

You **may** edit `app.js` from `let spreadDirty=false` onward (`I18N`, `render`, `act`, layout helpers).

You **may not** rewrite `simulator/engine.py` physics, `happyrobot.py`, Catastro, Rothermel, or pop `git stash`.

---

## 2. What this product is (locked — do not reopen)

| Decision | Meaning |
|---|---|
| One page, not two sites | `/` is the only dashboard. No `/ops` vs `/lab`. Lab controls collapse; they do not get their own route. |
| Two maps, equal dignity | Left **Situación real** = place in the world. Right **Lo que el sistema ve** = sensors + delayed satellite. That split **is** the product. |
| Place is Sierra de Gata, fixed | Bbox `west=-6.82 south=40.13 east=-6.55 north=40.32`. Town/station ≈ Hoyos `(12,44)`, farm ≈ caserío hacia Gata `(65,10)`. Not Cártama. Not “random Spain.” |
| HappyRobot is the brain | Nested Central → `delegate_extinguisher` → Drone → `report_to_central`. UI never invents scout/contain/warn. |
| Clock pauses while `s.busy` | API latency must not advance fire. Show elapsed seconds. |
| Replay never calls MCP | Timeline is the pitch backup when a live run takes 60s. |
| ES/EN chrome only | Header, KPIs, buttons, legend. Never translate `s.mission`, trail reasons, or `run_evidence`. |
| Nadir only | Cesium `SCENE2D`. No tourist tilt, no 3D buildings for wow. |
| FIRMS ≠ simulated front | Orange ellipses / AerialView fire = educational grid. FIRMS WMS = real 24h hotspots. Legend must say so. |
| Secrets | `.env` has `CESIUM_API_KEY` and `NASA_KEY`. Gitignored. Never print, never commit, `/api/config` localhost Host only. |

---

## 3. What the UI looks like TODAY (and why it is not good enough)

Someone already bolted 112 labels onto a vertical lab page. Current `index.html` is:

1. Dark mast + 112 badge + Sierra de Gata + weather + EN
2. Six KPI cards in a row (clock, threat, people-as-one-ellipsis, drone, crew, runs)
3. Duty line + Play / Ask / Reset
4. A **wide open `<details>`** full of record/replay/ignite/wind/spread — this still looks like a simulator
5. Two map cards, then timeline, then mission + trail, then footer inspect

Problems you must solve:

- **It still scrolls like an article.** On a 1440×900 projector the maps are not the first thing; the toolbar is. Target: maps ≥ **55% of the first viewport**.
- **People at risk is a truncated string** (`32 sin aviso · 0 evacuando · …`). A duty officer needs a **people board**, not SEO crumbs.
- **Mission is a leftover H2** (“Awaiting a report”) under the maps. It should feel like an **order ticket** you could read over radio.
- **COMUNICACIONES is a blog log.** Make it a **radio stack** (T+, source, message) with visual weight on the latest agent line.
- **Busy state is a yellow sentence.** During the 60s pitch pause it must own the header: lamp + “AGENTES DELIBERANDO · RELOJ EN PAUSA · 14s”.
- **Cesium and canvases fight the chrome** if you style all `canvas` tags (Cesium has its own). Keep globe/truth/belief boxed at aspect **80/56**. Never style `.cesium-widget canvas` with our map borders.
- **Hackathon residue:** “Run & record”, “Inspect HappyRobot”, English leftovers, marketing H1 sizing (`h1{font-size:38px}` still in CSS). Compress.

The cream/olive paper + forest mast + red 112 is the **right palette**. Do not throw it away for dark-mode cyberpunk, Inter+purple SaaS, or a Bloomberg terminal clone. Push **CECOP / sala operativa**: institutional, dense, calm, high-contrast labels, restrained alert red.

---

## 4. Reference aesthetic (steal hierarchy, not logos)

Think:

- A **112 CECOP** video wall: incident banner on top, two map feeds, a side column of units and messages
- **Protección Civil / INFOCA-style** wildfire desks: people and municipalities first, then fire, then resources
- Public **NASA FIRMS** map: honest about layers (hotspots vs. nothing else)
- **Not** Figma dashboard kits, not Dribbble “Emergency App”, not Call of Duty HUD, not Tailwind UI analytics

Copy voice (ES-first):

- Short, radio-like: “Vigilancia”, “Activo”, “Dotación 1”, “Aviso de humo”
- No jokes, no “One drone. Two priorities.”, no HackSpain in the mast
- Footer may keep the scientific disclaimer (educational grid, not Rothermel/Catastro) in small type

---

## 5. Target layout (you may refine, not abandon)

Design for **1440×900** first, then 1280, then stack at 950px.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ 112  CENTRAL DE OPERACIONES          ES-2026-GATA · SIERRA DE GATA      │
│      EXTINCIÓN · CÁCERES             [LIVE/PAUSA/BUSY 14s]  wx  [ES]    │
├────────┬────────────┬──────────────┬──────────┬──────────┬──────────────┤
│ AMENAZA│ PERSONAS   │ DRON         │ DOTACIÓN │ AGENTES  │ RELOJ        │
│ Activo │ 32 sin aviso│ explorar     │ en ruta  │ 1 · 61s  │ T+24         │
│        │  0 evac    │ en ruta      │          │          │              │
├────────┴────────────┴──────────────┴──────────┴──────────┴──────────────┤
│ [▶ ] [Preguntar a los agentes] [↺]     incidente armado · viento 1.0 E │
├──────────────────────────────────────────────┬─────────────────────────┤
│ SITUACIÓN REAL                               │ LO QUE EL SISTEMA VE    │
│ Sierra de Gata · Cesium · FIRMS              │ Sensores + satélite     │
│ ┌──────────────────────────────────────────┐ │ ┌─────────────────────┐ │
│ │  #globe OR #truth (AerialView fallback)  │ │ │ #belief AerialView  │ │
│ │  legend HUD: sim fire ≠ FIRMS            │ │ │ fog of war          │ │
│ └──────────────────────────────────────────┘ │ └─────────────────────┘ │
│ 41 celdas · …                                │ 12 fuegos · sat t+12    │
├──────────────────────────────────────────────┴─────────────────────────┤
│ ── timeline filmstrip (secondary) ──                                    │
├──────────────────────────────────┬──────────────────────────────────────┤
│ ORDEN  (s.mission verbatim)      │ RADIO  T+22 DRONE  contain (61,41)  │
│ Hoyos 32  caserío 6  chips       │        T+16 CENTRAL …               │
└──────────────────────────────────┴──────────────────────────────────────┘
│ disclaimer · Inspect HappyRobot (collapsed) · Workflow link             │
└──────────────────────────────────────────────────────────────────────────┘
```

**Preferred upgrade** if you can keep IDs working: CSS grid so maps + order/radio share the first screen — maps `1fr 1fr` on the left 70%, order+radio stacked on the right 30% **or** maps full width and a thin order bar *over* the maps. Do not put setup/wind above the maps after the incident has started.

`setupPanel` already collapses on `s.called`. Keep that. Make the **summary** show live wind + “incidente en curso” so they don’t reopen it on stage.

---

## 6. Screen-by-screen states you must design

### A. Cold start (not ignited)
- Threat = Vigilancia
- Maps empty of fire; click-to-ignite cursor on truth/globe
- Setup **open** (wind, spread, ignite, smoke report) — this is the only time lab controls may be obvious
- Mission = awaiting report (existing string ok)

### B. Smoke report just sent (`s.busy === true`)
- **This is the hero state.** Full-width amber/gold duty banner. Maps still visible but clearly paused. Controls that mutate the world disabled (already). Play may stay for pause. Elapsed seconds tick in the banner (`busySince` already in `render`).
- Do not replace the maps with a modal.

### C. Agents returned, fire spreading
- Threat = Activo, people card escalates if `unwarned` or `burnt > 0`
- Order ticket shows `s.mission` large
- Radio log has the new line at top
- Drone/truck KPIs show translated `statusText`

### D. Replay
- Body class `is-replay` already toggled. Banner says Reproducción. No MCP. Don’t look “live.”

### E. Cesium down
- `#globe` hidden, `#truth` shown, one line “Mapa ilustrado (Cesium no configurado)”. AerialView draws both maps. Never a black rectangle.

---

## 7. Component intent (design these; keep IDs)

You **must preserve** these IDs (JS binds them). Wrap, don’t rename:

`eyebrow headline subhead wx langToggle clock threat peopleKpi droneKpi crew runs connection error setupPanel setupSummary recordRun stopRecord playRecord downloadRecord openRecording btnIgnite btnCall speed windX windY windXValue windYValue windVector windArrow windTip spreadFactor spreadFactorValue windStrength windPending applyWind calmWind setupHint play btnAsk resetSim globe truth mapNote legendFirms belief truthstats beliefstats back replayPlay timeline forward frame missionLbl mission people explain trailLbl trail footerNote inspectLbl evidence workflow`

You may **add** nodes (people breakdown spans, status lamp, incident id from `s.geo`). If you add a file, whitelist it in `simulator/server.py` `do_GET` (`/` `/app.js` `/ops.js` `/style.css` only today).

**People card:** split into four labeled counts (sin aviso / evacuando / a salvo / expuestos). Escalate background if unwarned>0 or burnt>0. Chips in `#people` stay, but look like unit tags: `Hoyos · 32 · sin aviso`.

**Order ticket:** `#mission` is the verbatim agent text — the only large sentence on the page. Label it MISIÓN / ORDEN. Do not paraphrase it in JS.

**Radio:** each `.entry` is T+, SOURCE, message. Source coloring: `drone` / `system` / `simulation` / human. Newest first (already reversed).

**Legend:** overlay or compact row: simulated front, FIRMS, drone, truck, study area. Hide FIRMS item when layer failed (`legendFirms` already).

---

## 8. Visual system

Keep CSS variables in the forest/cream family already in `style.css`:

- Mast `#18261f`, paper `#ece8dc`, panel `#f7f4ea`, ink `#1c2a22`, 112 badge `#c23b28`
- Alert `#8b2e1c`, warn `#9a5a1c`, safe `#2d6a45`

Rules:

- Tabular lining figures on T+, KPIs, latency
- Eyebrows: 10px, letterspacing ~2px, uppercase, muted
- Buttons: quiet institutional, not pill-startup. Primary = forest green. Record stays rust `#ad482f`. Reset stays outlined warn.
- Busy: amber, not red (red is for Activo / exposed people)
- Colorblind: pair color with text. Don’t use red vs green alone for people status
- No drop shadows on everything; one elevation on map cards and the order ticket
- No stock Inter-from-Google unless you have a reason — `system-ui` is fine
- Cesium: keep `ops.js` SCENE2D, no terrain, no tilt. Only change ops.js if the globe box is wrong after layout

---

## 9. i18n

Every new chrome string goes in both `I18N.es` and `I18N.en` and `data-i18n` where static. `applyLang()` already walks `[data-i18n]`. Dynamic bits stay in `render()`.

Do not translate HappyRobot output. Do not leave mixed EN in ES mode (today some KPI labels start English in HTML until `applyLang` — that’s ok if `data-i18n` is complete).

---

## 10. Files

| File | What to do |
|---|---|
| `simulator/static/index.html` | Restructure landmarks. Keep IDs. Maps hero. |
| `simulator/static/style.css` | You may fully rewrite. Console, not article. |
| `simulator/static/app.js` **after the AerialView IIFE only** | `render()` fills any new nodes; keep `act`, poll, wind, spread, record. Body classes `is-busy is-live is-replay is-active` already exist — use them in CSS. |
| `simulator/static/ops.js` | Only container/legend/click sizing. No 3D. No extra FIRMS layers (5000 tx / 10 min). |
| `simulator/server.py` | Only if you add a static file to the whitelist. Do not loosen `/api/config`. |

Do not commit. Do not stage `.env`.

---

## 11. Implementation order

1. Snapshot AerialView: `sed -n '1,153p' simulator/static/app.js > /tmp/aerialview.before.js`
2. Redesign `index.html` + `style.css` until the **first screen** is maps + people + order
3. Wire new DOM in `render()` / `applyLang()`
4. `diff /tmp/aerialview.before.js` vs current lines 1–153 — must be identical
5. `python3 -m unittest discover -s tests -q` (59 tests) and `node --check simulator/static/app.js simulator/static/ops.js`
6. Hard-refresh `http://127.0.0.1:8765`. If the server is dead, start it; don’t kill a healthy one for CSS.

---

## 12. Definition of done

A judge two meters from the projector can answer without a presenter:

- This is **112**, in **Sierra de Gata**
- **People** are/aren’t warned
- Left map is the **place**; right map is **what agents know**
- The **current order** is [whatever HappyRobot said]
- When the screen says **deliberando**, the clock is honestly paused

They should **not** see: HackSpain, Cártama, a wall of Record/Download, Minecraft chrome, a tilted globe, or a black Cesium hole.

AerialView bytes unchanged. HappyRobot still the only commander. No new npm/React.

Begin.
