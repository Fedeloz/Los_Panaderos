const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const staticDir = path.join(__dirname, '../simulator/static');
const copy = value => JSON.parse(JSON.stringify(value));
const response = (body, status = 200) => ({ok: status < 400, json: async () => copy(body)});
const flush = async () => {for (let i = 0; i < 6; i++) await new Promise(resolve => setImmediate(resolve));};
const deferred = () => {let resolve; const promise = new Promise(yes => {resolve = yes;}); return {promise, resolve};};

function state() {
  return {incident_id: 'incident-test', tick: 0, busy: false, called: false, ignited: false, burning: 0, running: false, replay: false, reset_pending: false, pending_fires: 0,
    recording: false, recorded_frames: 0, workflow_calls: 0, latency: null, error: null, workflow_url: '/workflow', mission: 'Mission <verbatim>',
    fleet_counts: {trucks: 1, scouts: 1, extinguishers: 1}, trucks: [{truck_id: 'engine-1', status: 'at_station'}], scouts: [{drone_id: 'scout-1', status: 'holding', mode: 'hold'}], extinguishers: [{drone_id: 'drone-1', name: 'Squirtle', status: 'at_station', mode: 'hold'}],
    people: {town: {count: 3942, status: 'unwarned', kind: 'town'}, town_north: {count: 2815, status: 'unwarned', kind: 'town'}, town_south: {count: 3378, status: 'unwarned', kind: 'town'}, town_rosales: {count: 1126, status: 'unwarned', kind: 'town'}, farm: {count: 100, status: 'unwarned', kind: 'farm'}},
    geography: {population_source: {official_total: 11261, reference_year: 2025, farm_occupancy: {count: 100}}}};
}
class Element {
  constructor(tag = 'div', attributes = {}) {
    this.tagName = tag.toUpperCase(); this.attributes = {...attributes}; this.id = attributes.id || ''; this.dataset = {}; this.children = []; this.value = attributes.value ?? '1'; this.disabled = false; this.hidden = false; this.open = false; this._text = ''; this.className = attributes.class || ''; this.style = {};
    for (const [key, value] of Object.entries(attributes)) if (key.startsWith('data-')) this.dataset[key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
    const classes = new Set(this.className.split(' ')); this.classList = {toggle: (key, enabled) => enabled ? classes.add(key) : classes.delete(key), add: key => classes.add(key), remove: key => classes.delete(key), contains: key => classes.has(key)};
  }
  set textContent(value) {this._text = String(value);}
  get textContent() {return this._text;}
  setAttribute(key, value) {this.attributes[key] = String(value);}
  getAttribute(key) {return this.attributes[key] ?? null;}
  removeAttribute(key) {delete this.attributes[key];}
  append(...children) {this.children.push(...children);}
  replaceChildren(...children) {this.children = children;}
  focus() {this.focused = true;}
  click() {if (!this.disabled) return this.onclick?.();}
}
async function harness(page, options = {}) {
  const html = fs.readFileSync(path.join(staticDir, page + '.html'), 'utf8'), nodes = [];
  for (const match of html.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*)>/gi)) {
    const attrs = Object.fromEntries([...match[2].matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
    const el = new Element(match[1], attrs); el.disabled = /\bdisabled\b/.test(match[2]); el.hidden = /\bhidden\b/.test(match[2]); nodes.push(el);
  }
  const elements = new Map(nodes.filter(n => n.id).map(n => [n.id, n])), events = {}, timers = new Map(), local = new Map(options.savedLang ? [['cecop-lang', options.savedLang]] : []), session = new Map(options.intent ? [['cecop-archive-intent', options.intent]] : []), observers = [];
  let timerId = 0;
  const h = {nodes, elements, events, timers, local, session, observers, requests: [], writes: [], navigations: [], state: state(), handler: null};
  const storage = (map, name) => ({getItem: key => {if (options.storageBlocked) throw Error('Storage unavailable'); return map.get(key) ?? null;}, setItem: (key, value) => {if (options.storageBlocked) throw Error('Storage unavailable'); map.set(key, value); h.writes.push([name, key, value]);}, removeItem: key => map.delete(key)});
  const document = {readyState: 'loading', hidden: false, documentElement: {}, body: nodes.find(n => n.tagName === 'BODY'), title: '',
    getElementById: id => elements.get(id), createElement: tag => new Element(tag),
    querySelectorAll: selector => selector === '[data-i18n]' ? nodes.filter(n => n.dataset.i18n) : selector === '[data-i18n-aria-label]' ? nodes.filter(n => n.dataset.i18nAriaLabel) : selector === '[data-nav]' ? nodes.filter(n => n.dataset.nav) : [],
    querySelector: selector => selector === '.record-tools' ? nodes.find(n => n.className.split(' ').includes('record-tools')) : null,
    addEventListener: (event, fn) => {events[event] = fn;}};
  const sandbox = {document, console, Date, Number, Set, Map, Object, JSON, Math, Error, Blob,
    URL: {createObjectURL: () => 'blob:unit-test', revokeObjectURL: () => {}},
    localStorage: storage(local, 'local'), sessionStorage: storage(session, 'session'),
    location: {pathname: options.pathname || (page === 'situacion' ? '/' : '/' + page), assign: target => h.navigations.push(target)},
    setTimeout: (fn, ms) => {const id = ++timerId; timers.set(id, {fn, ms}); return id;}, clearTimeout: id => timers.delete(id),
    addEventListener: (event, fn) => {events[event] = fn;},
    MutationObserver: class {constructor(fn) {this.fn = fn; observers.push(this);} observe(target) {this.target = target;} disconnect() {this.disconnected = true;}},
    fetch: async (url, args = {}) => {const request = {url, method: args.method || 'GET', headers: args.headers, body: args.body ? JSON.parse(args.body) : null}; h.requests.push(request); if (h.handler) return h.handler(request); if (url === '/api/state' || url === '/api/action') return response(h.state); if (url === '/api/recording') return response({format: 'los-panaderos-recording-v1', frames: []}); throw Error('Unexpected request');}};
  sandbox.window = sandbox; h.context = vm.createContext(sandbox); h.run = code => vm.runInContext(code, h.context); h.document = document;
  h.run(fs.readFileSync(path.join(staticDir, 'chrome.js'), 'utf8'));
  if (page !== 'incidente') for (const src of [...html.matchAll(/<script src="\/([a-z]+)\.js"><\/script>/g)].map(m => m[1]).filter(name => name !== 'chrome')) h.run(fs.readFileSync(path.join(staticDir, src + '.js'), 'utf8'));
  if (options.beforeStart) options.beforeStart(h);
  if (options.start !== false) {events.DOMContentLoaded(); await flush();}
  h.c = h.context.cecop;
  return h;
}

test('nav aliases and stored language apply without extra incident polling', async () => {
  for (const [page, pathname, nav] of [['situacion', '/', 'situacion'], ['situacion', '/situacion', 'situacion'], ['incidente', '/incidente', 'incidente'], ['incidente', '/incidente/brunete', 'incidente'], ['medios', '/medios', 'medios'], ['archivo', '/archivo', 'archivo']]) {
    const h = await harness(page, {pathname, savedLang: 'en'});
    const active = h.nodes.filter(n => n.getAttribute('aria-current') === 'page');
    assert.equal(active.length, 1); assert.equal(active[0].dataset.nav, nav); assert.equal(h.document.documentElement.lang, 'en');
    // The archive page also fetches /api/shared once on load.
    const expectedRequests = page === 'incidente' ? 0 : page === 'archivo' ? 2 : 1;
    assert.equal(h.requests.length, expectedRequests);
    h.events.DOMContentLoaded(); await flush();
    assert.equal(h.requests.length, expectedRequests);
    assert.equal([...h.timers.values()].filter(t => t.ms === 1000).length, page === 'incidente' ? 0 : 1);
  }
});

test('language persists and responds to storage changes without write loops', async () => {
  const h = await harness('situacion', {savedLang: 'invalid'});
  assert.equal(h.c.lang, 'es'); h.c.setLang('en');
  assert.equal(h.local.get('cecop-lang'), 'en');
  assert.equal(h.elements.get('regionalMission').textContent, h.state.mission);
  const writes = h.writes.length;
  h.local.set('cecop-lang', 'es'); h.events.storage({key: 'cecop-lang', newValue: 'es'});
  assert.equal(h.c.lang, 'es'); assert.equal(h.writes.length, writes);
  assert.equal(h.elements.get('regionalMission').textContent, h.state.mission);
  h.events.storage({key: 'cecop-lang', newValue: 'invalid'}); assert.equal(h.c.lang, 'es');
  const blocked = await harness('medios', {storageBlocked: true});
  assert.doesNotThrow(() => blocked.c.setLang('en')); assert.equal(blocked.c.lang, 'en');
});

test('Situation counts watch dossiers while Brunete idles, then folds the live room in', async () => {
  const h = await harness('situacion');
  const watchPeople = h.c.catalog.filter(d => d.status === 'watch').reduce((n, d) => n + d.people, 0);
  assert.equal(h.elements.get('openIncidents').textContent, '3');
  assert.equal(h.elements.get('ccaaCount').textContent, '3');
  assert.equal(h.elements.get('riskPeople').textContent, watchPeople.toLocaleString('es-ES'));
  assert.equal(h.elements.get('nationalLevel').textContent, 'ALERTA');
  assert.equal(h.elements.get('eventThreat').textContent, 'SALA PREPARADA');
  assert.equal(h.elements.get('eventMission').textContent, 'Mission <verbatim>');
  assert.equal(h.elements.get('eventPeople').textContent, 'Sin aviso: 0');
  assert.equal(h.elements.get('watchList').children.length, 3);
  assert.equal(h.elements.get('closedList').children.length, 3);
  h.state.ignited = h.state.called = true;
  h.state.people.town.status = 'safe'; h.state.people.farm.status = 'burnt'; h.state.people.town_north.status = 'evacuating';
  await h.c.pollState();
  assert.equal(h.elements.get('openIncidents').textContent, '4');
  assert.equal(h.elements.get('ccaaCount').textContent, '4');
  assert.equal(h.elements.get('riskPeople').textContent, (7319 + watchPeople).toLocaleString('es-ES'));
  assert.equal(h.elements.get('nationalLevel').textContent, 'ALARMA');
  assert.equal(h.elements.get('eventThreat').textContent, 'ACTIVO');
  assert.equal(h.elements.get('eventPeople').textContent, 'Sin aviso: ' + (4504).toLocaleString('es-ES'));
  assert.equal(h.requests.some(r => r.method === 'POST'), false);
});

test('frozen catalog is consistent: one live dossier, projected inside the basemap, assets reconcile with pools', async () => {
  const {catalog, pools, project, assignedTo, summary, dossiers} = (await harness('situacion')).c;
  assert.equal(catalog.filter(d => d.id === 'ES-2026-BRUNETE').length, 1);
  assert.equal(new Set(catalog.map(d => d.id)).size, catalog.length);
  for (const d of catalog.filter(d => !d.inset)) {
    const p = project(d.lon, d.lat);
    assert.ok(p.x > 0 && p.x < 1183.6 && p.y > 0 && p.y < 1015.9, d.id + ' falls off the basemap');
  }
  for (const d of catalog.filter(d => d.status === 'closed')) assert.equal(assignedTo(d.id), 0, d.id + ' should hold no reserves');
  const reserved = pools.reduce((n, p) => n + Object.values(p.assigned).reduce((m, u) => m + u, 0), 0);
  assert.equal(summary(null).assets, reserved);
  assert.deepEqual(dossiers(null).find(d => d.id === 'ES-2026-BRUNETE').status, 'standby');
});
test('Situation GIS scenario counts fires over the 24 h window and folds the live room in', async () => {
  const h = await harness('situacion'), gis = h.context.gisMap;
  assert.equal(h.elements.get('countActive').textContent, '17');
  assert.equal(h.elements.get('countControlled').textContent, '5');
  assert.equal(h.elements.get('incidentCount').textContent, '17');
  assert.equal(h.elements.get('incidentList').children.length, 17);
  assert.equal(h.elements.get('incidentList').children[0].children[0].children[0].textContent, 'Sierra de la Culebra');
  assert.match(h.elements.get('wxWind').textContent, /^NE \d+ km\/h$/);
  assert.equal(h.elements.get('tlPhase').textContent, 'AHORA');
  gis.setTime(-1440);
  assert.equal(gis.time, -1440);
  assert.equal(h.elements.get('countActive').textContent, '3');
  assert.equal(h.elements.get('countControlled').textContent, '0');
  assert.equal(h.elements.get('tlPhase').textContent, 'REPRODUCCIÓN');
  assert.equal(h.document.body.classList.contains('is-scrubbing'), true);
  gis.setTime(0);
  h.state.ignited = h.state.called = true; await h.c.pollState();
  assert.equal(h.elements.get('countActive').textContent, '18');
  assert.equal(h.elements.get('incidentList').children[0].className, 'incident is-brunete');
  h.c.setLang('en');
  assert.equal(h.elements.get('tlPhase').textContent, 'NOW');
  assert.equal(h.elements.get('regionalMission').textContent, h.state.mission);
  for (const f of gis.incidents.filter(f => !f.inset)) assert.ok(f.p.x > 0 && f.p.x < 1183.6 && f.p.y > 0 && f.p.y < 1015.9, f.id + ' falls off the basemap');
  assert.equal(h.requests.some(r => r.method === 'POST'), false);
});

test('Medios reconciles national reserves with the live Brunete fleet', async () => {
  const h = await harness('medios');
  const poolUnits = h.c.pools.reduce((n, p) => n + p.units, 0), reserved = h.c.pools.reduce((n, p) => n + Object.values(p.assigned).reduce((m, u) => m + u, 0), 0);
  assert.equal(h.elements.get('poolUnits').textContent, String(poolUnits));
  assert.equal(h.elements.get('poolAssigned').textContent, String(reserved));
  assert.equal(h.elements.get('poolAvailable').textContent, String(poolUnits - reserved));
  assert.equal(h.elements.get('poolList').children.length, h.c.pools.length);
  assert.equal(h.elements.get('poolAssignedDetail').textContent.includes('BRUNETE'), false);
  h.state.ignited = true; await h.c.pollState();
  assert.equal(h.elements.get('poolAssigned').textContent, String(reserved + 3));
  assert.ok(h.elements.get('poolAssignedDetail').textContent.includes('ES-2026-BRUNETE'));
});

test('Archivo lists closed case files with totals and keeps the recording controls', async () => {
  const h = await harness('archivo');
  const closed = h.c.catalog.filter(d => d.status === 'closed');
  assert.equal(h.elements.get('closedCount').textContent, String(closed.length));
  assert.equal(h.elements.get('closedHa').textContent, closed.reduce((n, d) => n + d.hectares, 0).toLocaleString('es-ES'));
  assert.equal(h.elements.get('closedList').children.length, closed.length);
  assert.equal(h.elements.get('closedList').children[0].children[0].children[0].textContent, 'ES-2025-BERMEJA');
  h.c.setLang('en');
  assert.ok(h.elements.get('closedList').children[0].children[1].children[1].textContent.startsWith('Andalusia · 2025'));
  assert.equal(h.elements.get('archiveRecordingState').textContent, 'Not recording');
});

test('busy state and queued work stay visible on every desk page', async () => {
  for (const page of ['situacion', 'medios', 'archivo']) {
    const h = await harness(page); h.state.busy = h.state.running = true; h.state.pending_fires = 2;
    await h.c.pollState();
    assert.equal(h.document.body.classList.contains('is-busy'), true);
    assert.match(h.elements.get('connection').textContent, /DELIBERANDO.*RELOJ EN PAUSA.*2 igniciones en cola/);
    h.state.reset_pending = true; await h.c.pollState(); assert.match(h.elements.get('connection').textContent, /reinicio al terminar/);
    h.c.setLang('en'); assert.match(h.elements.get('connection').textContent, /AGENTS DELIBERATING.*queued ignitions/);
  }
});

test('stale polls cannot undo an accepted action and errors survive polling', async () => {
  const h = await harness('medios'), gate = deferred();
  h.handler = request => request.url === '/api/state' ? gate.promise : response({...h.state, tick: 8});
  const pending = h.c.pollState(); await h.c.action('fleet', {counts: {trucks: 1, scouts: 1, extinguishers: 1}});
  gate.resolve(response({...h.state, tick: 1})); await pending;
  assert.equal(h.c.state.tick, 8);
  h.handler = request => request.url === '/api/action' ? response({error: 'Bad fleet'}, 400) : response(h.state);
  assert.equal(await h.c.action('fleet'), false); await h.c.pollState();
  assert.match(h.elements.get('error').textContent, /Bad fleet/);
  h.handler = () => response(h.state); await h.c.action('fleet'); assert.equal(h.elements.get('error').hidden, true);
});

test('fleet preview survives polling and Apply sends exact role counts', async () => {
  const h = await harness('medios');
  for (const [role, count] of [['trucks', 2], ['scouts', 0], ['extinguishers', 3]]) {const el = h.elements.get('fleet-' + role); el.value = String(count); el.onchange();}
  await h.c.pollState(); assert.equal(Number(h.elements.get('fleet-trucks').value), 2);
  h.handler = request => {
    if (request.method === 'POST') {
      h.state.fleet_counts = request.body.counts;
      h.state.trucks = [{truck_id: 'engine-1', status: 'holding'}, {truck_id: 'engine-2', status: 'holding'}];
      h.state.scouts = []; h.state.extinguishers = [1, 2, 3].map(i => ({drone_id: 'drone-' + i, status: 'at_station'}));
    }
    return response(h.state);
  };
  await h.elements.get('applyFleet').onclick();
  const request = h.requests.find(r => r.method === 'POST');
  assert.deepEqual(request.body, {action: 'fleet', counts: {trucks: 2, scouts: 0, extinguishers: 3}});
  assert.equal(request.headers['X-Simulator-Request'], '1');
  assert.equal(h.elements.get('vehicleInventory').children.length, 5);
  assert.equal(h.elements.get('fleetSummary').textContent, '2 camiones · 0 exploradores · 3 drones Squirtle');
});

test('fleet error keeps the selection and incident states lock configuration', async () => {
  const h = await harness('medios');
  h.elements.get('fleet-trucks').value = '0'; h.elements.get('fleet-trucks').onchange();
  h.handler = request => request.method === 'POST' ? response({error: 'Rejected'}, 400) : response(h.state);
  await h.elements.get('applyFleet').onclick(); await h.c.pollState();
  assert.equal(Number(h.elements.get('fleet-trucks').value), 0);
  assert.equal(h.elements.get('error').hidden, false);
  for (const flag of ['ignited', 'called', 'busy', 'replay', 'reset_pending']) {
    h.state = {...state(), [flag]: true}; await h.c.pollState();
    assert.equal(h.elements.get('applyFleet').disabled, true);
    assert.equal(h.elements.get('fleet-scouts').disabled, true);
  }
});

test('archive buttons preserve the existing action protocol and busy stop behavior', async () => {
  const h = await harness('archivo');
  await h.elements.get('archiveRecordRun').onclick();
  assert.deepEqual(h.requests.find(r => r.method === 'POST').body, {action: 'record_run'});
  h.state.busy = h.state.recording = true; h.state.recorded_frames = 4; await h.c.pollState();
  assert.equal(h.elements.get('archiveRecordRun').disabled, true);
  assert.equal(h.elements.get('archiveStopRecord').disabled, false);
  assert.equal(h.elements.get('archivePlayRecord').disabled, true);
  await h.elements.get('archiveStopRecord').onclick();
  assert.deepEqual(h.requests.filter(r => r.method === 'POST').at(-1).body, {action: 'stop_recording'});
});

test('archive navigation stores only a small intent and download failures are visible', async () => {
  const h = await harness('archivo'); h.state.recorded_frames = 2; await h.c.pollState();
  h.elements.get('archivePlayRecord').onclick();
  assert.equal(h.session.get('cecop-archive-intent'), 'play'); assert.deepEqual(h.navigations, ['/incidente']);
  h.elements.get('archiveOpenRecording').onclick(); assert.equal(h.session.get('cecop-archive-intent'), 'open');
  assert.equal([...h.session.values()].some(v => v.includes('frames')), false);
  h.handler = () => response({error: 'Unavailable'}, 500);
  await h.elements.get('archiveDownloadRecord').onclick();
  assert.equal(h.elements.get('error').hidden, false);
  assert.equal(h.requests.some(r => r.method === 'POST'), false);
});

test('incident archive handoff is consumed once and invokes existing playback', async () => {
  let plays = 0;
  const h = await harness('incidente', {intent: 'play', beforeStart: h => {h.elements.get('playRecord').onclick = async () => {plays++;};}});
  assert.equal(plays, 1); assert.equal(h.session.has('cecop-archive-intent'), false);
  h.events.DOMContentLoaded(); assert.equal(plays, 1); assert.equal(h.requests.length, 0);
});

test('file-open handoff waits until initial render before revealing existing controls', async () => {
  const h = await harness('incidente', {intent: 'open'});
  assert.equal(h.observers.length, 1);
  h.context.state = {tick: 0}; h.observers[0].fn();
  assert.equal(h.elements.get('setupPanel').open, true);
  assert.equal(h.document.querySelector('.record-tools').open, true);
  assert.equal(h.elements.get('openRecording').focused, true);
  assert.equal(h.observers[0].disconnected, true);
  assert.equal(h.requests.length, 0);
});

test('all new page chrome keys have both languages and every page has unique IDs', async () => {
  for (const page of ['situacion', 'medios', 'archivo']) {
    const h = await harness(page);
    const ids = h.nodes.filter(n => n.id).map(n => n.id); assert.equal(new Set(ids).size, ids.length);
    for (const language of ['es', 'en']) {
      h.c.setLang(language);
      for (const el of h.nodes) for (const key of [el.dataset.i18n, el.dataset.i18nAriaLabel].filter(Boolean)) assert.notEqual(h.c.t(key), key, page + ':' + language + ':' + key);
    }
  }
});
