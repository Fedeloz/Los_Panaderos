# Devin prompt — CECOP multi-page product shell

You are implementing in `/Users/javiercruz/Desktop/HACKSPAIN`, git repo `Fedeloz/Los_Panaderos`, branch `main`. HackSpain Team 9 (Los Panaderos). Demo: `python3 -m simulator.server` → `http://127.0.0.1:8765`.

Read this whole file before editing. Implement. Do not ask to start over. Do not commit. Do not push. Do not pop any git stash (especially `stash@{0}` latency/MCP). Do not touch `.env`.

---

## 0. Mission

Turn the single Gotham 112 console into a **four-route CECOP product**.

- `/` is the regional **Situación** desk (statistics + active events).
- The current dual-map Brunete console moves to `/incidente`.
- `/medios` is fleet inventory.
- `/archivo` is recordings.

Judges land on `/` and see an enterprise 112 tool. They click the live Brunete row and drop into the sala de crisis you already have.

**HappyRobot remains the only decision brain.** Home/medios/archivo never invent scout / contain / warn. One `Controller`. Other “events” on the home page are **frozen cards**, not extra simulations.

---

## 1. HARD STOPS

- Do **not** edit the `window.AerialView` IIFE in `simulator/static/app.js` (from the opening `window.AerialView = (() => {` through `})();` just above `let spreadDirty=false`). After you work, `git diff -U0 simulator/static/app.js` must show **no hunks inside that IIFE**.
- Do **not** change fire physics, `engine.py`, `happyrobot.py`, Catastro, Rothermel.
- Do **not** revive Cesium / Sierra de Gata as the live map. `ops.js` / `geo.py` stay unused compatibility code. `#globe` stays hidden on the incident page.
- Do **not** add React, a bundler, auth, or a second HappyRobot incident.
- Do **not** invent a local commander when HappyRobot 404s.
- ES/EN chrome only. Never translate `s.mission`, trail messages, or `run_evidence`.
- Do **not** commit, push, amend, or force-push. Do **not** commit `.env`.
- Do **not** pop stashes.
- Keep every existing incident control ID (`play`, `addFire`, `peopleBoard`, `truth`, `belief`, `fleet-trucks`, `applyFleet`, …) so `app.js` from `let spreadDirty` downward keeps working.

---

## 2. Visual system (same design, all pages)

Reuse tokens already in `simulator/static/style.css`:

```css
--ink:#e2e8e7; --muted:#a1adb6; --paper:#101418; --panel:#181e23;
--line:#343e47; --green:#3d6260; --mast:#0b1014; --warn:#e4b862;
--alert:#ff9d85; --safe:#9bcaaa; --meta:ui-monospace,...
```

Reuse existing classes: `.ops`, `.mast`, `.badge` (red 112), `.kpis`, `.duty`, `.order-ticket`, `.panel`, `.fleet-panel`, `.person-*`, `.toolbar`.

Add **only** these layout classes:

- `.cecop-nav` — strip under the mast, `--meta` uppercase labels, active link `--warn` underline, no second header bar
- `.event-list` — stack of `.order-ticket`
- `.event-frozen` — muted, not a button
- `.data-grid` — reuse `.lower` / `.panel` gaps

No new fonts, no rounded SaaS cards, no light theme. Breakpoints stay 1280 / 950 / 600.

Duplicate mast + nav markup in each HTML file. **No template engine.**

```html
<nav class="cecop-nav" aria-label="CECOP">
  <a href="/" data-nav="situacion" data-i18n="navSituation">Situación</a>
  <a href="/incidente" data-nav="incidente" data-i18n="navIncident">Sala de crisis</a>
  <a href="/medios" data-nav="medios" data-i18n="navFleet">Medios</a>
  <a href="/archivo" data-nav="archivo" data-i18n="navArchive">Archivo</a>
</nav>
```

---

## 3. Routes (`simulator/server.py` `do_GET` ~line 284)

Keep `/api/state`, `/api/action`, `/api/recording`, `/api/config` unchanged.

Extend the static whitelist. `/incidente` and `/incidente/brunete` are not files on disk — map them in the handler:

| Path | File |
|---|---|
| `/`, `/situacion` | `situacion.html` |
| `/incidente`, `/incidente/brunete` | `incidente.html` (move current `index.html`) |
| `/medios` | `medios.html` |
| `/archivo` | `archivo.html` |
| `/chrome.js`, `/situacion.js`, `/medios.js`, `/archivo.js` | new scripts |
| existing `/app.js`, `/style.css`, maps, cursor, `observation-map.js`, vendor | unchanged |

POST Origin allow-list stays 127.0.0.1 / localhost. If you add `/incidente` as a page origin, browsers still send `Origin: http://127.0.0.1:8765` (no path) — do not break that.

If you keep `index.html`, make `/` **not** serve it. Situación is the default.

---

## 4. `chrome.js` (load first on every page)

- Shared ES/EN keys: nav labels, duty strings (`busy`, `live`, `paused`, `replay`, `serverUnavailable`), event status (`watch`, `active`, `enObservacion`).
- Persist `lang` in `localStorage` key `cecop-lang` (`es` \| `en`). Incident `app.js` must **read and write** that same key (today `lang` is memory-only).
- `applyLang()` for `[data-i18n]` / `[data-i18n-aria-label]`.
- Mark the active nav link from `location.pathname`.
- Poll `GET /api/state` every ~600ms on **every** page so `.duty` / `#connection` and `body.is-busy` stay live when agents deliberate while the operator is on Situación / Medios / Archivo.
- Expose `window.cecop = { lang, applyLang, t, pollState }` if incident `app.js` needs the shared lang.

---

## 5. Page: Situación (`/`)

Gotham desk. **No maps. No ignite / wind / add-fire.**

1. Mast: eyebrow `CENTRAL DE OPERACIONES · CECOP`, h1 `Comunidad de Madrid`, subhead `PROTECCIÓN CIVIL · SITUACIÓN`. Incident code can be `CECOP-MAD`.
2. KPI row using `.kpis` (five cells is fine; do not force the six-column incident grid):
   - Incidentes abiertos: `1` if `s.ignited || s.called`, else `0`
   - Personas en riesgo: sum of `s.people[*].count` still `unwarned` + `evacuating` + `blocked` (or show the same four subcounts as the people board if it fits)
   - Medios: `fleet_counts` trucks / scouts / extinguishers
   - Agentes: `workflow_calls` + optional `latency`
   - Reloj: `T+{tick}`
3. Duty bar (same gold `.is-busy` treatment as the incident page).
4. Main `.lower` grid:
   - **Eventos activos** (`.event-list`):
     1. **Live** `ES-2026-BRUNETE` from `/api/state`: threat, people unwarned, last `s.mission` **verbatim**, link to `/incidente`. Only this row is an open incident.
     2. **Frozen** `ES-2026-GATA · Vigilancia FIRMS` — `EN OBSERVACIÓN`. Not clickable into a commander. Do not start Cesium.
     3. **Frozen** `ES-2025-ARCHIVO` — link to `/archivo`.
   - **Datos**: `geography.population_source` (Brunete 11,261 + farm occupancy); last radio order = `s.mission` verbatim; `HappyRobot · Central → Exploración / Extinción`.
5. Same footer attribution / census disclaimer as the incident page.

`situacion.js` only renders from `/api/state` + the two frozen cards.

---

## 6. Page: Sala de crisis (`/incidente`)

Move current `simulator/static/index.html` → `incidente.html`.

- Add the shared nav under the mast.
- Load `<script src="/chrome.js"></script>` **before** `observation-map.js` / `app.js`.
- Headline stays `Brunete · Madrid`.
- Keep setup collapsed after smoke report.
- Keep Add fire on the duty strip.
- `app.js` from `let spreadDirty` may take `lang` from `localStorage` / `window.cecop`. Do not rewrite render/fleet/addFire. Do not touch AerialView.

---

## 7. Page: Medios (`/medios`)

Same fleet API as setup: `POST /api/action` with `{action:'fleet', counts:{trucks,scouts,extinguishers}}` and headers `Content-Type: application/json`, `X-Simulator-Request: 1`.

- Selects `#fleet-trucks`, `#fleet-scouts`, `#fleet-extinguishers` (0–3) + `#applyFleet`.
- Lock after `ignited || called || busy || replay` (same as `renderFleet` in `app.js`).
- One `.panel` card per vehicle in `trucks` / `scouts` / `extinguishers` (id + status). Use existing status colors / `STATUS_I18N` strings. Copy them; do not invent vehicle types.
- CTA link to `/incidente`.
- Reuse `.fleet-panel`, `.kpi-detail`.

---

## 8. Page: Archivo (`/archivo`)

Product view of the existing recording API (`record_run`, `stop_recording`, `/api/recording`, play/download/open).

- Show `recording` and `recorded_frames`.
- Same operator actions as the collapsed “Archivo y reproducción” block. Use distinct IDs if they would collide (`archiveRecordRun`, …).
- Copy: replay never calls HappyRobot.
- After play/open of a recording, send the operator to `/incidente` (replay already lives on the maps). If in-memory playback cannot survive navigation, keep play on Archivo only as download/open, and document that playback happens on Sala de crisis — **prefer** wiring play so `/incidente` can consume it, but do not invent a second renderer.
- Practical acceptable solution: Archivo starts/stops/downloads/opens; “Reproducir” navigates to `/incidente` and the incident page already has play-recording. Opening a file can `sessionStorage` the JSON if needed; do not break the 100 MB / format checks in `app.js`.

---

## 9. `app.js` chrome-only edits allowed

Below `let spreadDirty=false` only:

- Read/write `localStorage['cecop-lang']`.
- Do not fight `chrome.js` `applyLang` (incident I18N remains the source for incident-only keys).
- Optional: `document.body.dataset.page = 'incidente'`.

---

## 10. README

Add 4–6 lines: `/` is Situación; sala de crisis is `/incidente`; Medios and Archivo URLs. Do not rewrite the physics essay.

---

## 11. Verify (required before you stop)

```sh
python3 -m unittest discover -s tests -q
node --check simulator/static/app.js
node --check simulator/static/chrome.js
node --check simulator/static/situacion.js
node --check simulator/static/medios.js
node --check simulator/static/archivo.js
```

Against the running demo (restart the server after `server.py` changes):

- `GET /` `/situacion` `/incidente` `/incidente/brunete` `/medios` `/archivo` `/chrome.js` → 200
- Home KPIs match `/api/state`
- ES/EN persists across tabs
- Apply fleet on `/medios` (before ignition) then see counts on `/incidente`
- Duty bar on `/` turns gold when `/api/state` has `busy:true` (you may simulate by reading the class wiring; do not fire a live HappyRobot run)
- Incident dual maps, Add fire, fleet setup still work
- `git diff -U0 simulator/static/app.js` has no AerialView hunks

No commit. Leave staging as you found it unless you must `git add` only to clear leftover UU conflicts you yourself created (you should not be merging).

---

## 12. Order of work

1. Server route map + move `index.html` → `incidente.html`
2. `chrome.js` + nav CSS
3. `situacion.html` / `situacion.js`
4. Nav on incidente + lang persistence in `app.js`
5. `medios.html` / `medios.js`
6. `archivo.html` / `archivo.js`
7. README + verify

Stop when the four routes look like one 112 product and the Brunete pitch path still works from the live event row.
