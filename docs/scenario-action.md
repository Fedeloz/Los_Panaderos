# Simulacro en un clic (client-side presets)

The backend exposes only primitive actions (`reset`, `fleet`, `place_fire`,
`wind`, `spread_factor`, `ignite`, `call`, …). A "simulacro" is a preset that
the browser applies as a short ordered sequence of those actions; no new server
action is required.

- Presets and helpers live in `simulator/static/scenarios.js`
  (`window.Scenarios`). Keys match the catalogue dossier ids in `chrome.js`
  (`ES-2026-BRUNETE`, `ES-2026-GATA`, …). National-map incidents from
  `mapa.js` are converted with `Scenarios.fromIncident(f)` (wind vector from the
  local regime, spread from severity, fleet from hectares).
- Situación navigates to `Scenarios.toQuery(preset)` →
  `/incidente?scenario=<id>[&wind=…][&spread=…][&fleet=t,s,e][&name=…]`.
- Sala de crisis reads `Scenarios.fromQuery(location.search)` on load and runs
  `Scenarios.steps(preset)` through `act()`, then removes the query string with
  `history.replaceState`. The `place_fire` step is `optional`: a rejected cell
  falls back to the engine default ignition.
- The terrain is always the illustrated Brunete grid; the room header shows the
  preset name with the note "terreno de simulación: Brunete".
