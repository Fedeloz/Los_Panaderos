const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'simulator/static/app.js'), 'utf8');
const chrome = source.slice(source.indexOf('let spreadDirty=false;'));
const html = fs.readFileSync(path.join(root, 'simulator/static/incidente.html'), 'utf8');
const copy = value => JSON.parse(JSON.stringify(value));
const response = (body, status = 200) => ({ok: status < 400, status, json: async () => copy(body)});
const deferred = () => {let resolve, reject; const promise = new Promise((yes, no) => {resolve = yes; reject = no;}); return {promise, resolve, reject};};
const flush = async () => {for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve));};

function frame(overrides = {}) {
  const drone = {x: 12, y: 32, status: 'at_station', mode: 'hold', drone_id: 'drone-1', role: 'extinguisher', observed_fire: []};
  const truck = {x: 12, y: 32, status: 'at_station', truck_id: 'engine-1', role: 'truck', observed_fire: []};
  return {...{width: 80, height: 56, tick: 0, incident_id: 'test-incident', mission: 'Awaiting a report', wind: [1, 0],
    cells: Array.from({length: 56}, () => Array.from({length: 80}, () => ({heat: 0, fuel: 1}))),
    base: [12, 32], town: [10, 35], farm: [73, 21], drone, truck, scouts: [], extinguishers: [drone], trucks: [truck],
    fleet_counts: {scouts: 0, extinguishers: 1, trucks: 1}, people: {farm: {x: 73, y: 21, count: 100, burnt: 0, status: 'unwarned', kind: 'farm', name: 'El Álamo Farm', refuge: [60, 12]}},
    history: [], observation: [], observed_cells: [], roads: [], geography: null, satellite: null, rules: {spread_factor: 0.5},
    burning: 0, extinguished: 0, crew_extinguished: 0, ignited: false, called: false, phase: 'active', busy: false,
    running: false, replay: false, reset_pending: false, pending_fires: 0, speed: 2, frame_count: 2, frame_index: 0,
    recording: false, recorded_frames: 0, workflow_calls: 0, workflow_url: '/workflow', run_evidence: '', error: null}, ...overrides};
}
const recording = frames => ({format: 'los-panaderos-recording-v1', frames});

class Element {
  constructor(id = '') {this.id = id; this.dataset = {}; this.hidden = false; this.disabled = false; this.value = '0'; this.open = false; this.children = []; this.attributes = {}; this.style = {}; this._text = ''; const classes = new Set(); this.classList = {toggle: (key, enabled) => enabled ? classes.add(key) : classes.delete(key), contains: key => classes.has(key), add: key => classes.add(key)};}
  set textContent(value) {if (value === this.failOnText) throw Error('Injected render failure'); this._text = String(value);}
  get textContent() {return this._text;}
  setAttribute(key, value) {this.attributes[key] = String(value);}
  getAttribute(key) {return this.attributes[key];}
  replaceChildren(...children) {this.children = children;}
  append(...children) {this.children.push(...children);}
  click() {if (!this.disabled) return this.onclick?.({currentTarget: this, target: this});}
  getBoundingClientRect() {return {left: 0, top: 0, width: 800, height: 560};}
}

async function harness() {
  const elements = new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(match => [match[1], new Element(match[1])]));
  elements.get('error').hidden = true;
  const live = new Element('live'); live.dataset.action = 'live';
  const actions = [live];
  for (const match of html.matchAll(/<button\b[^>]*data-action="([^"]+)"[^>]*>/g)) {
    const id = match[0].match(/\bid="([^"]+)"/)?.[1];
    if (match[1] === 'live') continue;
    const element = id ? elements.get(id) : new Element(match[1]);
    element.dataset.action = match[1]; actions.push(element);
  }
  const toolbar = [...['play', 'btnAsk', 'resetSim', 'addFire', 'recordRun', 'stopRecord', 'playRecord', 'downloadRecord', 'btnIgnite', 'btnCall', 'speed', 'applyFleet', 'fleet-trucks', 'fleet-scouts', 'fleet-extinguishers'].map(id => elements.get(id)), ...actions];
  const intervals = new Map(), timeouts = new Map(); let nextTimer = 0;
  const h = {elements, live, intervals, timeouts, requests: [], server: frame(), handler: null};
  const sandbox = {console, URL, Blob, Date, Set, Map, Number, JSON, Math, Error, performance: {now: () => 0},
    document: {getElementById: id => elements.get(id), createElement: () => new Element(), body: new Element(), documentElement: {},
      querySelectorAll: selector => selector === '[data-action]' ? actions : selector.startsWith('.toolbar') ? toolbar : [],
      querySelector: selector => selector === '[data-action="live"]' ? live : null},
    setTimeout: (fn, ms) => {const id = ++nextTimer; timeouts.set(id, {fn, ms}); return id;}, clearTimeout: id => timeouts.delete(id),
    setInterval: (fn, ms) => {const id = ++nextTimer; intervals.set(id, {fn, ms}); return id;}, clearInterval: id => intervals.delete(id),
    fetch: async (url, options = {}) => {const request = {url, options, body: options.body ? JSON.parse(options.body) : null}; h.requests.push(request); if (h.handler) return h.handler(request); if (url === '/api/state' || url === '/api/action') return response(h.server); if (url === '/api/recording') return response(recording([])); throw Error('Unexpected request: ' + url);},
    addEventListener: () => {}, requestAnimationFrame: () => {}, AerialView: {draw: () => {}}};
  sandbox.window = sandbox;
  h.context = vm.createContext(sandbox);
  h.run = code => vm.runInContext(code, h.context);
  h.value = code => copy(h.run(code));
  h.put = (name, value) => {h.context[name] = value;};
  h.import = async frames => {const text = JSON.stringify(recording(frames)); await elements.get('openRecording').onchange({target: {files: [{size: Buffer.byteLength(text), text: async () => text}], value: 'recording.json'}}); await flush();};
  vm.runInContext(chrome, h.context);
  await flush();
  return h;
}

test('late live poll cannot overwrite local replay', async () => {
  const h = await harness(), gate = deferred();
  h.handler = () => gate.promise;
  const poll = h.run('poll()');
  h.put('frames', [frame({tick: 5, mission: 'Recorded'})]);
  h.run('recordingPlayback=frames; showRecorded(0)');
  gate.resolve(response(frame({tick: 77, running: true})));
  await poll;
  assert.equal(h.run('state.tick'), 5);
  assert.equal(h.run('state.replay'), true);
});

test('failed pause prevents recording import and keeps the failure visible', async () => {
  const h = await harness(); h.server.running = true;
  h.handler = request => request.url === '/api/action' ? response({error: 'Pause failed'}, 500) : response(h.server);
  await h.import([frame({tick: 5})]);
  assert.equal(h.run('recordingPlayback===null'), true);
  assert.equal(h.elements.get('error').hidden, false);
  await h.run('poll()');
  assert.equal(h.elements.get('error').hidden, false);
});

test('malformed recording is rejected before pause and does not stop polling', async () => {
  const h = await harness();
  await h.import([frame({wind: null})]);
  assert.equal(h.requests.filter(request => request.body?.action === 'pause').length, 0);
  assert.equal(h.run('recordingPlayback===null'), true);
  assert.equal(h.elements.get('error').hidden, false);
  const before = h.requests.length; await h.run('poll()');
  assert.equal(h.requests.length, before + 1);
});

test('client errors survive polling and clear on a successful action', async () => {
  const h = await harness();
  h.handler = request => request.body?.action === 'fleet' ? response({error: 'Bad fleet'}, 400) : response(h.server);
  assert.equal(await h.run("act('fleet',{counts:{trucks:0,scouts:0,extinguishers:0}})"), false);
  await h.run('poll()');
  assert.equal(h.elements.get('error').hidden, false);
  assert.match(h.elements.get('error').textContent, /Bad fleet/);
  await h.run("act('pause')");
  assert.equal(h.elements.get('error').hidden, true);
});

test('failed Live retains the current recording', async () => {
  const h = await harness();
  h.put('frames', [frame({tick: 8})]); h.run('recordingPlayback=frames;showRecorded(0)');
  h.handler = () => response({error: 'Live failed'}, 500);
  assert.equal(await h.run("act('live')"), false);
  assert.equal(h.run('recordingPlayback.length'), 1);
  assert.equal(h.run('state.tick'), 8);
});

test('double replay click cancels a pending start without leaking intervals', async () => {
  const h = await harness(), gate = deferred();
  h.handler = () => gate.promise;
  const first = h.elements.get('replayPlay').onclick();
  const second = h.elements.get('replayPlay').onclick();
  gate.resolve(response(frame({replay: true})));
  await Promise.all([first, second]);
  assert.equal(h.intervals.size, 0);
});

test('stale action responses cannot replace a newer accepted view', async () => {
  const h = await harness(), gate = deferred();
  h.handler = request => request.body?.action === 'pause' ? gate.promise : response(frame({incident_id: 'reset-incident'}));
  const old = h.run("act('pause')");
  await h.run("act('reset')");
  gate.resolve(response(frame({tick: 99})));
  await old;
  assert.equal(h.run('state.incident_id'), 'reset-incident');
  assert.equal(h.run('state.tick'), 0);
});

test('poll HTTP errors are visible and recovery does not erase action errors', async () => {
  const h = await harness();
  h.handler = request => response({error: request.url === '/api/state' ? 'Poll failed' : 'Action failed'}, 500);
  await h.run("act('fleet')"); await h.run('poll()');
  assert.equal(h.elements.get('connection').textContent, h.run('I18N[lang].serverUnavailable'));
  h.handler = () => response(h.server); await h.run('poll()');
  assert.notEqual(h.elements.get('connection').textContent, h.run('I18N[lang].serverUnavailable'));
  assert.match(h.elements.get('error').textContent, /Action failed/);
});

test('recording download failure is handled without pausing', async () => {
  const h = await harness();
  h.handler = request => request.url === '/api/recording' ? response({error: 'No recording'}, 500) : response(h.server);
  await assert.doesNotReject(async () => h.elements.get('playRecord').onclick());
  assert.equal(h.requests.filter(request => request.body?.action === 'pause').length, 0);
  assert.equal(h.elements.get('error').hidden, false);
});

test('unexpected recording-render failure rolls back playback and displayed state', async () => {
  const h = await harness(); h.elements.get('mission').failOnText = 'Broken render';
  await h.import([frame({tick: 9, mission: 'Broken render'})]);
  assert.equal(h.run('recordingPlayback===null'), true);
  assert.equal(h.run('state.tick'), 0);
  assert.equal(h.elements.get('error').hidden, false);
});

test('slow file read cannot take over after a newer Live request', async () => {
  const h = await harness(), gate = deferred();
  const loading = h.elements.get('openRecording').onchange({target: {files: [{size: 10, text: () => gate.promise}], value: 'slow.json'}});
  await h.run("act('live')");
  gate.resolve(JSON.stringify(recording([frame({tick: 9})])));
  await loading;
  assert.equal(h.run('recordingPlayback===null'), true);
  assert.equal(h.requests.filter(request => request.body?.action === 'pause').length, 0);
});

test('successful local recording supports zero extinguisher roles and local seeking', async () => {
  const h = await harness();
  const onlyTrucks = frame({drone: null, extinguishers: [], fleet_counts: {trucks: 1, scouts: 0, extinguishers: 0}});
  await h.import([onlyTrucks, {...copy(onlyTrucks), tick: 1}]);
  assert.equal(h.run('state.replay'), true);
  assert.equal(h.intervals.size, 1);
  const count = h.requests.length; await h.run("act('seek',{index:1})");
  assert.equal(h.requests.length, count);
  assert.equal(h.run('state.tick'), 1);
  h.run('stopReplay()');
});

test('recording validation covers data consumed by the renderer and preserves legacy data', async () => {
  const h = await harness();
  for (const mutate of [f => {f.wind = null;}, f => {f.cells[0][0] = null;}, f => {f.history = [null];}, f => {f.drone.route = 'bad';}, f => {f.geography = {observation_zones: [{polygon: null}]};}, f => {f.people.farm.count = -1;}, f => {f.satellite = {captured_at: 0, blocks: null};}]) {
    const bad = frame(); mutate(bad); h.put('input', recording([bad]));
    assert.throws(() => h.run('validateRecording(input)'));
  }
  const legacy = frame(); delete legacy.scouts; delete legacy.trucks; delete legacy.extinguishers; delete legacy.fleet_counts;
  h.put('input', recording([legacy]));
  assert.equal(h.run('validateRecording(input).length'), 1);
  assert.deepEqual(h.value('input.frames[0].wind'), [1, 0]);
  h.put('input', recording([])); assert.throws(() => h.run('validateRecording(input)'));
  h.put('input', recording(Array(1501).fill(legacy))); assert.throws(() => h.run('validateRecording(input)'));
});

test('language changes keep active replay controls truthful', async () => {
  const h = await harness(); await h.import([frame(), frame({tick: 1})]);
  h.run("lang='en';applyLang()");
  assert.equal(h.elements.get('replayPlay').textContent, h.run('I18N.en.replayStop'));
  h.run('stopReplay()');
  assert.equal(h.elements.get('replayPlay').textContent, h.run('I18N.en.replayStart'));
});

test('backend errors remain visible after a successful client action', async () => {
  const h = await harness(); h.server.error = 'HappyRobot error';
  await h.run("act('pause')");
  assert.equal(h.elements.get('error').hidden, false);
  assert.match(h.elements.get('error').textContent, /HappyRobot error/);
});

test('network pause failure also blocks server-recording playback', async () => {
  const h = await harness();
  h.handler = request => {if (request.url === '/api/recording') return response(recording([frame()])); throw Error('Network unavailable');};
  await h.elements.get('playRecord').onclick();
  assert.equal(h.run('recordingPlayback===null'), true);
  assert.equal(h.intervals.size, 0);
  assert.match(h.elements.get('error').textContent, /Network unavailable/);
});

test('bad JSON, empty recordings, and oversized uploads never pause the world', async () => {
  for (const body of [null, recording([]), {format: 'wrong-format', frames: [frame()]}]) {
    const h = await harness();
    h.handler = () => body === null ? {ok: true, json: async () => {throw Error('Invalid JSON');}} : response(body);
    await h.elements.get('playRecord').onclick();
    assert.equal(h.requests.filter(request => request.body?.action === 'pause').length, 0);
    assert.equal(h.elements.get('error').hidden, false);
  }
  const h = await harness(); let read = false;
  await h.elements.get('openRecording').onchange({target: {files: [{size: 100000001, text: async () => {read = true; return '';}}], value: 'huge.json'}});
  assert.equal(read, false);
  assert.equal(h.requests.filter(request => request.body?.action === 'pause').length, 0);
});

test('validation scans later frames and retains the 1500-frame bound', async () => {
  const h = await harness(), good = frame();
  h.put('input', recording([good, frame({wind: null})]));
  assert.throws(() => h.run('validateRecording(input)'));
  h.put('input', recording(Array(1500).fill(good)));
  assert.equal(h.run('validateRecording(input).length'), 1500);
});

test('newer file loads win and an invalid replacement retains an existing recording', async () => {
  const h = await harness(), gate = deferred();
  h.put('readSlow', () => gate.promise);
  const old = h.run('loadRecording(readSlow)');
  await h.import([frame({tick: 7})]);
  gate.resolve(recording([frame({tick: 99})])); await old;
  assert.equal(h.run('state.tick'), 7);
  await h.import([frame({wind: null})]);
  assert.equal(h.run('state.tick'), 7);
  assert.equal(h.run('recordingPlayback[0].tick'), 7);
});

test('read-only local replay never posts a decision and Live success resumes polling', async () => {
  const h = await harness(); await h.import([frame({tick: 5})]);
  const before = h.requests.length;
  assert.equal(await h.run("act('decision')"), false);
  assert.equal(h.requests.length, before);
  assert.equal(await h.run("act('live')"), true);
  assert.equal(h.run('recordingPlayback===null'), true);
  const liveCount = h.requests.length; await h.run('poll()');
  assert.equal(h.requests.length, liveCount + 1);
});

test('failed initial and subsequent replay seeks leave no timer running', async () => {
  const h = await harness();
  h.handler = () => response({error: 'Seek failed'}, 400);
  await h.elements.get('replayPlay').onclick();
  assert.equal(h.intervals.size, 0);
  h.handler = () => response(frame({replay: true}));
  await h.elements.get('replayPlay').onclick();
  assert.equal(h.intervals.size, 1);
  h.handler = () => response({error: 'Seek failed'}, 400);
  await [...h.intervals.values()][0].fn();
  assert.equal(h.intervals.size, 0);
  assert.equal(h.run('pending'), false);
});

test('modern fleet arrays provide aliases without inheriting live vehicles or links', async () => {
  const h = await harness(); const recorded = frame({tick: 4});
  delete recorded.drone; delete recorded.truck;
  recorded.workflow_url = '/recorded-workflow';
  await h.import([recorded]);
  assert.equal(h.run('state.drone.drone_id'), 'drone-1');
  assert.equal(h.run('state.truck.truck_id'), 'engine-1');
  assert.equal(h.run('state.workflow_url'), '/workflow');
});

test('state-dependent controls are safe before the first state arrives', async () => {
  const h = await harness(); h.run('state=undefined');
  for (const id of ['play', 'back', 'forward', 'replayPlay']) assert.doesNotThrow(() => h.elements.get(id).onclick());
});

test('unknown status and radio-source names do not read inherited dictionary properties', async () => {
  const h = await harness();
  assert.equal(h.run("statusText('constructor')"), 'constructor');
  assert.equal(h.run("statusText('__proto__')"), '__proto__');
  h.put('input', frame({history: [{tick: 0, source: 'constructor', message: 'literal'}]}));
  assert.doesNotThrow(() => h.run('render(input)'));
  assert.equal(h.elements.get('trail').children[0].children[1].textContent, 'CONSTRUCTOR');
});
