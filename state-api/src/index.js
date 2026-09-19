/**
 * Los Panaderos shared incident state — Cloudflare Worker + KV.
 *
 * Routes (all JSON, bearer token in Authorization header):
 *   GET   /health
 *   GET   /state/:incident_id          full state
 *   PUT   /state/:incident_id          full replace
 *   PATCH /state/:incident_id          shallow merge; `districts` merged by district_id;
 *                                      `communications_sent` appended
 *   DELETE /state/:incident_id         session reset: empty envelope + wipe events/inbox
 *   PUT/GET /inbox/:incident_id        dispatcher pull inbox (world payload + generation)
 *   GET   /lookup?incident_id=..&phone=..|district_id=..|name=..
 *         caller-oriented view: district, danger_level, advice, evacuation point/route
 *   GET   /incidents                    list known incident ids (latest first)
 *   POST  /state/:incident_id/events   append field events (drones, trucks):
 *         { events: [{source, kind, sim_time, x, y, district_id?, detail?, vehicle_id?, status?}] } or a single event.
 *         kinds: fire_detected -> fire.confirmed=true + fire.detections[]
 *                deployed|en_route|arrived|containing|returning|at_station -> vehicles[vehicle_id]
 *                anything else is only logged.
 *
 * KV write budget: KV allows ~1 write/s per key. The simulator coalesces state PATCHes
 * to >=2 s and batches events into one POST per flush. Events live under a SEPARATE key
 * (`events:<id>`) so a burst of field events never competes with the state key; GET /state
 * and /lookup merge both documents at read time (derived `vehicles`, `fire.confirmed`,
 * `fire.detections`, last 30 `events`).
 *
 * The key "current" always points at the most recently written incident so the
 * inbound-call agent can call /lookup without knowing the incident id.
 */
const VEHICLE_KINDS = new Set(['deployed', 'en_route', 'arrived', 'containing', 'returning', 'at_station']);
const EVENT_CAP = 200;

function applyEvents(doc, incoming) {
  const next = { events: [...(doc?.events || [])], vehicles: { ...(doc?.vehicles || {}) }, fire_detections: [...(doc?.fire_detections || [])] };
  const now = new Date().toISOString();
  for (const raw of incoming) {
    if (!raw || typeof raw !== 'object' || typeof raw.kind !== 'string' || !raw.kind.trim()) continue;
    const e = { ...compact(raw), kind: raw.kind.trim(), received_at: now };
    next.events.push(e);
    if (e.kind === 'fire_detected') {
      next.fire_detections.push({ source: e.source || e.vehicle_id || 'unknown', x: e.x ?? null, y: e.y ?? null, sim_time: e.sim_time ?? null, district_id: e.district_id ?? null, received_at: now });
    } else if (VEHICLE_KINDS.has(e.kind) && (e.vehicle_id || e.source)) {
      const id = e.vehicle_id || e.source;
      const status = e.status || (e.kind === 'deployed' ? 'en_route' : e.kind);
      next.vehicles[id] = { ...(next.vehicles[id] || {}), status, x: e.x ?? null, y: e.y ?? null, since: e.sim_time ?? null, district_id: e.district_id ?? next.vehicles[id]?.district_id ?? null, detail: e.detail || null, updated_at: now };
    }
  }
  next.events = next.events.slice(-EVENT_CAP);
  next.fire_detections = next.fire_detections.slice(-50);
  next.updated_at = now;
  return next;
}

/** Merge the state document with the events document for read paths. */
function withEvents(state, doc) {
  if (!doc) return state;
  const fire = { ...(state.fire || {}) };
  // The simulator snapshot and the event stream may both carry the same sighting; dedupe by source+sim_time.
  const seen = new Set();
  const detections = [...(fire.detections || []), ...(doc.fire_detections || [])].filter((d) => {
    const key = `${d.source}|${d.sim_time}|${d.x}|${d.y}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  fire.detections = detections.slice(-50);
  fire.confirmed = Boolean(fire.confirmed) || detections.length > 0;
  const vehicles = { ...(state.vehicles || {}) };
  for (const [id, v] of Object.entries(doc.vehicles || {})) {
    const current = vehicles[id];
    // Prefer the most recent report (by sim_time) between the simulator snapshot and event stream.
    if (!current || (v.since ?? -1) >= (current.sim_time ?? current.since ?? -1)) vehicles[id] = { ...(current || {}), ...v };
  }
  const events = [...(doc.events || [])].slice(-30);
  const updated = [state.updated_at, doc.updated_at].filter(Boolean).sort().pop();
  return { ...state, fire, vehicles, events, updated_at: updated || state.updated_at };
}

function situation(state) {
  const fire = state.fire || {};
  const vehicles = state.vehicles || {};
  const trucks = Object.entries(vehicles).filter(([id, v]) => (v.role === 'truck') || /^engine|truck/i.test(id));
  const deployed = trucks.filter(([, v]) => ['en_route', 'arrived', 'on_scene', 'containing', 'suppressing'].includes(v.status));
  const containing = trucks.filter(([, v]) => ['containing', 'suppressing'].includes(v.status));
  const drones = Object.entries(vehicles).filter(([, v]) => v.role && v.role !== 'truck');
  const fireText = fire.confirmed
    ? `Fuego CONFIRMADO por sensores (${(fire.detections || []).length} deteccion(es) de dron${fire.burning_cells ? `, ${fire.burning_cells} celdas ardiendo` : ''}).`
    : (fire.report ? 'Humo reportado, SIN confirmar todavia; un dron lo esta verificando.' : 'Sin incidente confirmado.');
  const truckText = containing.length ? `Camion de bomberos en el lugar y actuando (${containing.map(([id]) => id).join(', ')}).`
    : deployed.length ? `Camion de bomberos DESPLEGADO y en camino (${deployed.map(([id]) => id).join(', ')}).`
    : trucks.length ? 'Camion de bomberos movilizandose.' : 'Sin camion asignado todavia.';
  const droneText = drones.length ? `${drones.length} dron(es) operando.` : '';
  return {
    fire_confirmed: Boolean(fire.confirmed),
    truck_deployed: deployed.length > 0,
    truck_containing: containing.length > 0,
    summary: [fireText, truckText, droneText].filter(Boolean).join(' '),
  };
}

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

const reply = (status, body, extra = {}) => new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...extra } });

function emptyEvents() {
  return { events: [], vehicles: {}, fire_detections: [], updated_at: new Date().toISOString() };
}

function truthyFlag(value) {
  if (value === true || value === 1) return true;
  const s = String(value ?? '').trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes' || s === 'on';
}

function emptyEnvelope(id, extra = {}) {
  const now = new Date().toISOString();
  const sessionId = extra.session_id || extra.dispatcher_run_id || null;
  return {
    incident_id: id,
    session_id: sessionId,
    session_started_at: extra.session_started_at || now,
    loop_generation: extra.loop_generation || 1,
    loop_seen_generation: 0,
    dispatcher_live: extra.dispatcher_live !== false,
    dispatcher_stop: Boolean(extra.dispatcher_stop),
    dispatcher_run_id: extra.dispatcher_run_id || sessionId,
    advice_source: 'reset',
    public_message: '',
    districts: [],
    communications_sent: [],
    last_dispatch: null,
    pending_command: null,
    fire: { confirmed: false, detections: [], burning_cells: 0, report: null, front: 'Sesion reiniciada' },
    vehicles: {},
    events: [],
    source: 'despacho_reset',
    updated_at: now,
  };
}

async function resetSession(env, id, extra = {}) {
  const envelope = emptyEnvelope(id, extra);
  await Promise.all([
    env.STATE.put(`incident:${id}`, JSON.stringify(envelope)),
    env.STATE.put(`events:${id}`, JSON.stringify(emptyEvents())),
    env.STATE.delete(`inbox:${id}`),
    env.STATE.put('current', id),
  ]);
  return envelope;
}

const DANGER_ORDER = ['none', 'watch', 'warning', 'critical'];

function normalizePhone(value) {
  return String(value || '').replace(/[^\d+]/g, '').replace(/^00/, '+');
}

function authorized(request, env) {
  if (!env.STATE_API_TOKEN) return false;
  const header = request.headers.get('authorization') || '';
  const token = header.replace(/^Bearer\s+/i, '').trim() || new URL(request.url).searchParams.get('token') || '';
  return token === env.STATE_API_TOKEN;
}

// Empty strings / nulls in a PATCH mean "leave unchanged" (agent tools send blanks for optional params).
const compact = (obj) => Object.fromEntries(Object.entries(obj || {}).filter(([, v]) => v !== '' && v !== null && v !== undefined));

function mergeState(current, patch) {
  const isPatch = Boolean(current);
  const clean = isPatch ? compact(patch) : { ...(patch || {}) };
  const next = { ...(current || {}), ...clean };
  if (isPatch && Array.isArray(patch?.districts)) {
    const byId = new Map((current.districts || []).map((d) => [d.district_id, d]));
    const fromSimulator = patch.source === 'los-panaderos-simulator';
    for (const d of patch.districts) {
      if (!d || !d.district_id) continue;
      const merged = { ...(byId.get(d.district_id) || {}), ...compact(d) };
      if (!fromSimulator && (d.advice || d.danger_level)) merged.advice_updated_at = new Date().toISOString();
      byId.set(d.district_id, merged);
    }
    next.districts = [...byId.values()];
  }
  if (isPatch && Array.isArray(current.communications_sent) && Array.isArray(patch?.communications_sent)) {
    // The simulator sends its full log (replace); agents send increments (append).
    next.communications_sent = patch.source === 'los-panaderos-simulator'
      ? patch.communications_sent.slice(-100)
      : [...current.communications_sent, ...patch.communications_sent].slice(-100);
  }
  next.updated_at = new Date().toISOString();
  return next;
}

/**
 * Effective view of a district: the simulator publishes `auto_danger_level`/`auto_advice`
 * from its heuristic; Despacho Central may set `danger_level`/`advice` (operational
 * judgement). We take the more severe level and prefer the agent's advice when it
 * matches that level, so a stale "all clear" never hides an escalating fire.
 */
function effective(district) {
  const auto = district.auto_danger_level || 'none';
  const agent = district.danger_level || null;
  const level = DANGER_ORDER.indexOf(agent || 'none') >= DANGER_ORDER.indexOf(auto) ? (agent || auto) : auto;
  const advice = agent === level && district.advice ? district.advice : (district.auto_advice || district.advice || null);
  return { ...district, danger_level: level, advice, advice_source: agent === level && district.advice ? 'agente_despacho' : 'simulator' };
}

function defaultAdvice(district, state) {
  const level = district.danger_level || 'none';
  const name = district.name || district.district_id;
  if (level === 'critical' || level === 'warning') {
    const point = district.evacuation_point ? ` Dirijase a ${district.evacuation_point}.` : '';
    const route = district.evacuation_route ? ` Ruta: ${district.evacuation_route}` : '';
    return `${name} esta en zona de ${level === 'critical' ? 'peligro inminente' : 'aviso'} por el incendio.${point}${route}`;
  }
  if (level === 'watch') {
    return `${name} no esta en peligro ahora mismo. Los equipos vigilan la evolucion del fuego; le avisaremos si cambia la situacion. Mantengase atento al telefono.`;
  }
  return `${name} esta fuera de la zona afectada. Las autoridades estan trabajando para controlar la situacion; no necesita hacer nada y le contactaremos si algo cambia.`;
}

function matchesName(person, name) {
  if (!name || name.length < 3) return false;
  const full = String(person.contact_name || '').toLowerCase();
  if (!full) return false;
  return full === name || full.startsWith(`${name} `) || full.endsWith(` ${name}`) || full.split(/\s+/).includes(name);
}

/**
 * Who is actually on the phone.
 *
 * The demo handset is shared by several personas, so a caller-ID match alone identifies
 * nobody — that is how a Brunete neighbour used to be answered as the farm manager. The
 * name and the district the caller gives narrow the phone matches; a name that matches
 * none of them means this is an ordinary resident who is simply not in the directory, and
 * we answer for their district WITHOUT borrowing anyone's identity. A district is never
 * used to invent a person.
 */
function identify(people, params, rank) {
  const phone = normalizePhone(params.get('phone'));
  const districtId = (params.get('district_id') || '').trim();
  const name = (params.get('name') || '').trim().toLowerCase();
  const byPhone = phone ? people.filter((p) => normalizePhone(p.phone_number) === phone) : [];
  let pool = byPhone.slice();
  if (name) pool = (pool.length ? pool : people).filter((p) => matchesName(p, name));
  if (districtId) pool = pool.filter((p) => p.district_id === districtId);
  pool = pool.sort((a, b) => rank(b) - rank(a));
  if (pool.length === 1) return { person: pool[0], candidates: pool, status: 'identified' };
  if (pool.length > 1) return { person: null, candidates: pool, status: 'ambiguous' };
  return { person: null, candidates: [], status: name || districtId ? 'unknown_caller' : 'no_match' };
}

function lookup(state, params) {
  const districtId = (params.get('district_id') || '').trim();
  const people = state.contacts?.people || [];
  const districts = (state.districts || []).map(effective);
  const rank = (p) => DANGER_ORDER.indexOf((districts.find((d) => d.district_id === p.district_id) || {}).danger_level || 'none');
  const { person, candidates: matches, status: identityStatus } = identify(people, params, rank);
  const targetId = districtId || person?.district_id || null;
  const district = targetId ? districts.find((d) => d.district_id === targetId) || null : null;
  const worst = districts.reduce((acc, d) => (DANGER_ORDER.indexOf(d.danger_level || 'none') > DANGER_ORDER.indexOf(acc) ? d.danger_level : acc), 'none');
  const sit = situation(state);
  const inDanger = district ? ['warning', 'critical'].includes(district.danger_level) : false;
  let guidance;
  if (!district) {
    guidance = identityStatus === 'ambiguous'
      ? 'IDENTIFICAR: este numero corresponde a varias personas, asi que no sabe con quien habla. Pregunte su nombre y desde que pueblo o barrio llama, y vuelva a consultar con name y district_id.'
      : 'IDENTIFICAR: pregunte su nombre y desde que pueblo o barrio llama, relacionelo con uno de known_districts y vuelva a consultar; nunca invente ni de por hecho quien es.';
  } else if (inDanger) {
    guidance = 'EVACUAR: transmita el punto y la ruta de evacuacion con calma y confirme que la persona los ha entendido.' + (sit.fire_confirmed ? '' : ' (Aviso preventivo: el fuego aun no esta confirmado, pero su zona esta en alerta.)');
  } else if (!sit.fire_confirmed) {
    guidance = 'TRANQUILIZAR: solo hay humo reportado sin confirmar y un dron lo esta verificando; la persona esta fuera de peligro; se le contactara si cambia la situacion.';
  } else {
    guidance = 'TRANQUILIZAR: el fuego esta confirmado pero su zona esta fuera de peligro; ' + (sit.truck_containing ? 'los bomberos ya estan actuando sobre el fuego' : sit.truck_deployed ? 'el camion de bomberos esta desplegado y en camino' : 'las autoridades estan trabajando en la zona') + '; se le contactara si cambia la situacion.';
  }
  // A district answer is valid even when we do not know the caller; what is never valid is
  // greeting them with a name from the directory that they did not give us.
  if (district && identityStatus !== 'identified') {
    guidance = 'VECINO SIN IDENTIFICAR (no le llame por ningun nombre de la lista de contactos). ' + guidance;
  }
  return {
    situation: sit,
    vehicles: state.vehicles || {},
    events: (state.events || []).slice(-10),
    incident_id: state.incident_id,
    updated_at: state.updated_at,
    sim_time: state.sim_time,
    found: Boolean(person || district),
    identity_status: identityStatus,
    caller_identified: identityStatus === 'identified',
    caller: person ? { contact_name: person.contact_name, district_id: person.district_id, known_location: person.known_location, mobility: person.mobility } : null,
    candidates: matches.map((p) => ({ contact_name: p.contact_name, district_id: p.district_id, known_location: p.known_location })),
    district: district
      ? { ...district, advice: district.advice || defaultAdvice(district, state), in_danger: inDanger }
      : null,
    incident_danger_level: worst,
    public_message: state.public_message || state.auto_public_message || null,
    fire: state.fire || null,
    known_districts: districts.map((d) => ({ district_id: d.district_id, name: d.name, danger_level: d.danger_level || 'none', status: d.status })),
    guidance,
  };
}

async function loadMerged(env, id) {
  const [raw, ev] = await Promise.all([env.STATE.get(`incident:${id}`), env.STATE.get(`events:${id}`)]);
  if (!raw) return null;
  return withEvents(JSON.parse(raw), ev ? JSON.parse(ev) : null);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization,content-type,if-none-match', 'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS', 'access-control-expose-headers': 'etag' } });
    if (path === '/health') return reply(200, { ok: true, service: 'los-panaderos-state' });
    if (!authorized(request, env)) return reply(401, { error: 'Unauthorized' });

    const eventsMatch = path.match(/^\/state\/([A-Za-z0-9._-]{1,80})\/events$/);
    if (eventsMatch) {
      const id = eventsMatch[1];
      if (request.method === 'GET') {
        const ev = await env.STATE.get(`events:${id}`);
        return reply(200, ev ? JSON.parse(ev) : { events: [], vehicles: {}, fire_detections: [] });
      }
      if (request.method !== 'POST') return reply(405, { error: 'Method not allowed' });
      let body;
      try { body = await request.json(); } catch { return reply(400, { error: 'Invalid JSON body' }); }
      const incoming = Array.isArray(body) ? body : Array.isArray(body?.events) ? body.events : (body && typeof body === 'object' ? [body] : []);
      const valid = incoming.filter((e) => e && typeof e === 'object' && typeof e.kind === 'string' && e.kind.trim());
      if (!valid.length) return reply(400, { error: 'Expected {events:[{kind,...}]} or a single event with kind' });
      if (valid.length > 100) return reply(413, { error: 'Max 100 events per request' });
      const current = JSON.parse((await env.STATE.get(`events:${id}`)) || 'null');
      const next = applyEvents(current, valid);
      await env.STATE.put(`events:${id}`, JSON.stringify(next));
      if (!(await env.STATE.get('current'))) await env.STATE.put('current', id);
      return reply(200, { accepted: valid.length, vehicles: next.vehicles, fire_confirmed: next.fire_detections.length > 0, detections: next.fire_detections.length, events: next.events.length });
    }

    const inboxMatch = path.match(/^\/inbox\/([A-Za-z0-9._-]{1,80})$/);
    if (inboxMatch) {
      const id = inboxMatch[1];
      if (request.method === 'GET') {
        const [rawInbox, rawState] = await Promise.all([env.STATE.get(`inbox:${id}`), env.STATE.get(`incident:${id}`)]);
        if (!rawInbox) return reply(404, { error: 'No inbox', has_work: false, incident_id: id, generation: 0 });
        const inbox = JSON.parse(rawInbox);
        const state = rawState ? JSON.parse(rawState) : {};
        const generation = Number(inbox.generation) || 0;
        const seen = Number(state.loop_seen_generation) || 0;
        const has_work = generation > seen;
        const etag = `"${generation}"`;
        if (request.headers.get('If-None-Match') === etag && !has_work) {
          return new Response(null, { status: 304, headers: { ...JSON_HEADERS, etag } });
        }
        return reply(200, { ...inbox, has_work, incident_id: id, generation }, { etag });
      }
      if (request.method !== 'PUT' && request.method !== 'PATCH') return reply(405, { error: 'Method not allowed' });
      let body;
      try { body = await request.json(); } catch { return reply(400, { error: 'Invalid JSON body' }); }
      if (!body || typeof body !== 'object' || Array.isArray(body)) return reply(400, { error: 'Expected JSON object' });
      const current = JSON.parse((await env.STATE.get(`inbox:${id}`)) || 'null') || { generation: 0 };
      const generation = (Number(current.generation) || 0) + 1;
      const next = { ...body, incident_id: id, generation, updated_at: new Date().toISOString() };
      await env.STATE.put(`inbox:${id}`, JSON.stringify(next));
      if (!(await env.STATE.get('current'))) await env.STATE.put('current', id);
      return reply(200, { ...next, has_work: true }, { etag: `"${generation}"` });
    }

    const stateMatch = path.match(/^\/state\/([A-Za-z0-9._-]{1,80})$/);
    if (stateMatch) {
      const id = stateMatch[1];
      if (request.method === 'GET') {
        const merged = await loadMerged(env, id);
        return merged ? reply(200, merged) : reply(404, { error: 'Unknown incident' });
      }
      if (request.method === 'DELETE') {
        let extra = {};
        try {
          const text = await request.text();
          if (text) extra = JSON.parse(text);
        } catch { extra = {}; }
        if (!extra || typeof extra !== 'object' || Array.isArray(extra)) extra = {};
        extra.session_id = extra.session_id || url.searchParams.get('session_id') || '';
        extra.continue = extra.continue ?? url.searchParams.get('continue');
        const continuing = truthyFlag(extra.continue);
        const current = JSON.parse((await env.STATE.get(`incident:${id}`)) || 'null') || {};
        const session = current.session_id || '';
        const incoming = String(extra.session_id || '').trim();
        if (continuing) {
          const stop = Boolean(current.dispatcher_stop);
          const live = Boolean(current.dispatcher_live);
          const mismatch = Boolean(incoming && session && incoming !== session);
          const skip = stop || !current.incident_id || mismatch;
          const reason = stop ? 'stopped' : mismatch ? 'session_mismatch' : current.incident_id ? 'continue' : 'not_running';
          return reply(200, {
            ok: true, reset: false, skip_loop: skip, already_running: false, reason,
            incident_id: id, session_id: session || incoming || null,
            dispatcher_live: live && !stop, dispatcher_stop: stop,
          });
        }
        const envelope = await resetSession(env, id, { ...extra, dispatcher_live: true, dispatcher_stop: false });
        return reply(200, { ok: true, reset: true, skip_loop: false, already_running: false, reason: 'reset', ...envelope });
      }
      if (request.method === 'PUT' || request.method === 'PATCH') {
        let body;
        try { body = await request.json(); } catch { return reply(400, { error: 'Invalid JSON body' }); }
        if (!body || typeof body !== 'object' || Array.isArray(body)) return reply(400, { error: 'Expected JSON object' });
        if (Array.isArray(body.districts)) {
          body.districts = body.districts.filter((d) => d && typeof d.district_id === 'string' && d.district_id.trim());
          if (!body.districts.length) delete body.districts;
        }
        if (Object.keys(compact(body)).length === 0) return reply(400, { error: 'Empty update' });
        const current = request.method === 'PATCH' ? JSON.parse((await env.STATE.get(`incident:${id}`)) || 'null') : null;
        const next = mergeState(current, { ...body, incident_id: id });
        await env.STATE.put(`incident:${id}`, JSON.stringify(next));
        await env.STATE.put('current', id);
        return reply(200, next);
      }
      return reply(405, { error: 'Method not allowed' });
    }

    if (path === '/incidents' && request.method === 'GET') {
      const list = await env.STATE.list({ prefix: 'incident:' });
      const current = await env.STATE.get('current');
      return reply(200, { current, incidents: list.keys.map((k) => k.name.slice('incident:'.length)) });
    }

    if (path === '/lookup' && request.method === 'GET') {
      const id = url.searchParams.get('incident_id') || (await env.STATE.get('current'));
      if (!id) return reply(404, { error: 'No incident state yet', found: false, guidance: 'DESCONOCIDO: no hay incidente activo registrado; tranquilice a la persona y tome sus datos.' });
      const merged = await loadMerged(env, id);
      if (!merged) return reply(404, { error: 'Unknown incident', found: false });
      return reply(200, lookup(merged, url.searchParams));
    }

    return reply(404, { error: 'Not found' });
  },
};
