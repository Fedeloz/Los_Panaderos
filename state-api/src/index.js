/**
 * Los Panaderos shared incident state — Cloudflare Worker + KV.
 *
 * Routes (all JSON, bearer token in Authorization header):
 *   GET   /health
 *   GET   /state/:incident_id          full state
 *   PUT   /state/:incident_id          full replace
 *   PATCH /state/:incident_id          shallow merge; `districts` merged by district_id;
 *                                      `communications_sent` appended
 *   GET   /lookup?incident_id=..&phone=..|district_id=..|name=..
 *         caller-oriented view: district, danger_level, advice, evacuation point/route
 *   GET   /incidents                    list known incident ids (latest first)
 *
 * The key "current" always points at the most recently written incident so the
 * inbound-call agent can call /lookup without knowing the incident id.
 */

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

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

function lookup(state, params) {
  const phone = normalizePhone(params.get('phone'));
  const districtId = (params.get('district_id') || '').trim();
  const name = (params.get('name') || '').trim().toLowerCase();
  const people = state.contacts?.people || [];
  let person = null;
  if (phone) person = people.find((p) => normalizePhone(p.phone_number) === phone) || null;
  if (!person && name) person = people.find((p) => String(p.contact_name || '').toLowerCase() === name) || null;
  const targetId = districtId || person?.district_id || null;
  const districts = (state.districts || []).map(effective);
  const district = targetId ? districts.find((d) => d.district_id === targetId) || null : null;
  const worst = districts.reduce((acc, d) => (DANGER_ORDER.indexOf(d.danger_level || 'none') > DANGER_ORDER.indexOf(acc) ? d.danger_level : acc), 'none');
  return {
    incident_id: state.incident_id,
    updated_at: state.updated_at,
    sim_time: state.sim_time,
    found: Boolean(person || district),
    caller: person ? { contact_name: person.contact_name, district_id: person.district_id, known_location: person.known_location, mobility: person.mobility } : null,
    district: district
      ? { ...district, advice: district.advice || defaultAdvice(district, state), in_danger: ['warning', 'critical'].includes(district.danger_level) }
      : null,
    incident_danger_level: worst,
    public_message: state.public_message || state.auto_public_message || null,
    fire: state.fire || null,
    known_districts: districts.map((d) => ({ district_id: d.district_id, name: d.name, danger_level: d.danger_level || 'none', status: d.status })),
    guidance: district
      ? (['warning', 'critical'].includes(district.danger_level)
        ? 'EVACUAR: transmita el punto y la ruta de evacuacion con calma y confirme que la persona los ha entendido.'
        : 'TRANQUILIZAR: la persona esta fuera de peligro; las autoridades trabajan en la zona; se le contactara si cambia la situacion.')
      : 'DESCONOCIDO: pregunte donde esta la persona y relacionelo con uno de known_districts; nunca invente.'
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization,content-type', 'access-control-allow-methods': 'GET,PUT,PATCH,OPTIONS' } });
    if (path === '/health') return reply(200, { ok: true, service: 'los-panaderos-state' });
    if (!authorized(request, env)) return reply(401, { error: 'Unauthorized' });

    const stateMatch = path.match(/^\/state\/([A-Za-z0-9._-]{1,80})$/);
    if (stateMatch) {
      const id = stateMatch[1];
      if (request.method === 'GET') {
        const raw = await env.STATE.get(`incident:${id}`);
        return raw ? new Response(raw, { headers: JSON_HEADERS }) : reply(404, { error: 'Unknown incident' });
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
      const raw = await env.STATE.get(`incident:${id}`);
      if (!raw) return reply(404, { error: 'Unknown incident', found: false });
      return reply(200, lookup(JSON.parse(raw), url.searchParams));
    }

    return reply(404, { error: 'Not found' });
  },
};
