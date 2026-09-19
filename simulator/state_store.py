"""Shared incident state: the simulator publishes it, HappyRobot reads/updates it.

Backed by the Cloudflare Worker in `state-api/` (KV). Configure with
STATE_API_URL and STATE_API_TOKEN (see .env.example). When unset, publishing
is a silent no-op so tests and offline demos keep working.

Danger heuristic (per district, documented for the demo, not a fire model):
  sources  = currently observed burning cells (shared sensors); if none yet,
             the farmer's report location counts as an *uncertain* source.
  d        = distance in cells from the nearest source to the district home.
  downwind = population_wind_alignment[district].downwind_sector.
  critical : status burnt, or d <= 8, or (d <= 16 and downwind)  [confirmed fire only]
  warning  : status evacuating, or d <= 16, or (d <= 30 and downwind)
  watch    : any source exists and (downwind or d <= 30)
  none     : otherwise (no fire near, not downwind)
With only the uncertain report (no confirmed cells) the ceiling is `warning`
unless the wind is strong (strength >= 2) and pointing at the district.
"""
import json
import math
import os
import threading
import time
import urllib.error
import urllib.request

from .contacts import directory as contact_directory, load_env

LEVELS = ('none', 'watch', 'warning', 'critical')


def danger_level(group, measurements, confirmed, wind_strength):
    if group['status'] == 'burnt':
        return 'critical'
    if not measurements:
        return 'warning' if group['status'] == 'evacuating' else 'none'
    d = min(m['distance'] for m in measurements)
    downwind = any(m['downwind_sector'] for m in measurements)
    level = 'none'
    if downwind or d <= 30:
        level = 'watch'
    if group['status'] == 'evacuating' or d <= 16 or (d <= 30 and downwind):
        level = 'warning'
    if d <= 8 or (d <= 16 and downwind):
        level = 'critical'
    if not confirmed and level == 'critical' and not (wind_strength >= 2 and downwind):
        level = 'warning'
    return level


def district_advice(name, level, point, route, safe_because='', rescue=''):
    # `safe_because` and `rescue` let the agent say WHY the muster point is safe and that the
    # engine is coming for them, instead of only naming a place on a map.
    extra = ' '.join(x for x in (safe_because, rescue) if x)
    if level == 'critical':
        return f'{name}: peligro inminente por el incendio. Salga ahora hacia {point or "el punto de encuentro indicado"}. {route or ""} {extra}'.strip()
    if level == 'warning':
        return f'{name}: aviso de evacuacion preventiva. Prepare a su familia y dirijase a {point or "el punto de encuentro"}. {route or ""} {extra}'.strip()
    if level == 'watch':
        return f'{name}: no hay peligro ahora mismo. Los equipos vigilan la evolucion del fuego; le avisaremos si cambia. Mantenga el telefono cerca.'
    return f'{name}: fuera de la zona afectada. Las autoridades estan trabajando para controlar la situacion; no necesita hacer nada y le contactaremos si algo cambia.'


def build_state(sim, dispatch=None, communications=None):
    """Snapshot the simulation into the shared state document."""
    alignment = sim.population_wind_alignment()
    confirmed = bool(sim.observation)
    strength = math.hypot(*sim.wind)
    contacts = contact_directory(sim.groups)
    channels = {d['district_id']: d for d in contacts['districts']}
    districts = []
    for key, g in sim.groups.items():
        level = danger_level(g, alignment.get(key, {}).get('measurements', []), confirmed, strength)
        ch = channels.get(key, {})
        # auto_* fields come from this heuristic; Despacho Central may set danger_level/advice on top.
        # The API's /lookup combines both (most severe level wins) so agent overrides survive simulator updates.
        districts.append(dict(district_id=key, name=g['name'], kind=g['kind'], population=g['count'], burnt=g.get('burnt', 0),
                              status=g['status'], auto_danger_level=level, home=list(g['home']), refuge=list(g['refuge']),
                              chat_id=ch.get('chat_id'), evacuation_point=ch.get('evacuation_point'), evacuation_route=ch.get('evacuation_route'),
                              evacuation_point_is_safe_because=ch.get('evacuation_point_is_safe_because'), rescue_plan=ch.get('rescue_plan'),
                              auto_advice=district_advice(g['name'], level, ch.get('evacuation_point'), ch.get('evacuation_route'),
                                                          ch.get('evacuation_point_is_safe_because') or '', ch.get('rescue_plan') or '')))
    worst = max((d['auto_danger_level'] for d in districts), key=LEVELS.index, default='none')
    burning = [dict(x=c['x'], y=c['y']) for c in sim.observation]
    front = 'Sin fuego confirmado por sensores' if not burning else f'{len(burning)} celdas ardiendo observadas; viento hacia ({sim.wind[0]}, {sim.wind[1]})'
    if not burning and sim.called:
        front = f'Humo reportado en {list(sim.report)} pendiente de confirmacion'
    vehicles = {}
    for v in sim.extinguishers+sim.scouts:
        vehicles[v['drone_id']] = dict(role=v.get('role', 'drone'), status=v['status'], x=round(v['x'], 1), y=round(v['y'], 1), mode=v.get('mode'), sim_time=sim.tick)
    for t in sim.trucks:
        vehicles[t['truck_id']] = dict(role='truck', status=t['status'], x=round(t['x'], 1), y=round(t['y'], 1), sector=t.get('crew_target'), sim_time=sim.tick)
    detections = [e for e in sim.event_log if e['kind'] == 'fire_detected']
    return dict(
        incident_id=sim.incident_id, sim_time=sim.tick, phase=sim.phase, updated_at=time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        wind=dict(dx=sim.wind[0], dy=sim.wind[1], strength=round(strength, 2)),
        fire=dict(confirmed=confirmed or bool(detections), burning_cells=len(burning), observed_cells=burning[:200], report=list(sim.report) if sim.called else None, front=front,
                  detections=[dict(source=e['source'], x=e['x'], y=e['y'], sim_time=e['sim_time'], district_id=e.get('district_id')) for e in detections][-20:]),
        vehicles=vehicles, events=sim.event_log[-30:],
        incident_danger_level=worst, mission=sim.mission,
        districts=districts,
        contacts=dict(people=[{k: p.get(k) for k in ('contact_id', 'contact_name', 'role', 'district_id', 'known_location', 'phone_number', 'chat_id', 'mobility')} for p in contacts['people']],
                      emergency=contacts['emergency']),
        communications_sent=[dict(c) for c in (communications if communications is not None else sim.communications)][-50:],
        last_dispatch=dispatch if dispatch is not None else sim.dispatch,
        auto_public_message=(f'Incendio en Brunete en seguimiento. Nivel general: {worst}. Distritos en aviso: '
                             + (', '.join(d['name'] for d in districts if d['auto_danger_level'] in ('warning', 'critical')) or 'ninguno') + '.'),
        source='los-panaderos-simulator')


class StateStore:
    """Thin HTTP client. Publishes in a background thread; never blocks the simulation clock."""

    def __init__(self, url=None, token=None, timeout=6, min_interval=2.0):
        load_env()
        self.url = (url or os.environ.get('STATE_API_URL', '')).rstrip('/')
        self.token = token or os.environ.get('STATE_API_TOKEN', '')
        self.timeout = timeout
        self.min_interval = min_interval  # KV allows ~1 write/s per key; coalesce tick updates.
        self.lock = threading.Lock()
        self.last_error = None
        self.last_published = None
        self.published = 0
        self._signature = None
        self._last_sent_at = 0.0
        self._pending = None
        self._pending_events = []
        self._timer = None
        self.events_sent = 0

    @property
    def enabled(self):
        return bool(self.url and self.token)

    def _request(self, method, path, body=None):
        data = json.dumps(body, ensure_ascii=False).encode() if body is not None else None
        req = urllib.request.Request(self.url+path, data=data, method=method,
                                     headers={'Authorization': 'Bearer '+self.token, 'Content-Type': 'application/json',
                                              'Accept': 'application/json', 'User-Agent': 'los-panaderos-simulator/0.2'})
        with urllib.request.urlopen(req, timeout=self.timeout) as res:
            return json.loads(res.read().decode() or 'null')

    def put(self, state):
        """PATCH (merge) so danger_level/advice set by Despacho Central survive simulator ticks."""
        return self._request('PATCH', f"/state/{state['incident_id']}", state)

    def get(self, incident_id):
        return self._request('GET', f'/state/{incident_id}')

    def lookup(self, **params):
        query = '&'.join(f'{k}={urllib.request.quote(str(v))}' for k, v in params.items() if v is not None)
        return self._request('GET', '/lookup'+('?'+query if query else ''))

    def post_events(self, incident_id, events):
        """Batch-append field events (fire_detected, deployed, ...). One POST per flush, separate KV key server-side."""
        events = [events] if isinstance(events, dict) else list(events)
        return self._request('POST', f'/state/{incident_id}/events', dict(events=events, source='los-panaderos-simulator'))

    def publish(self, state, force=False, wait=False, events=None):
        """PATCH the state if it changed since the last publish (plus any queued events). Returns True when scheduled.

        Events are never dropped by coalescing: they accumulate and go out in one POST with the next flush,
        before the PATCH, so /lookup sees `fire.confirmed`/vehicles as soon as the state lands.
        """
        if not self.enabled:
            return False
        events = list(events or [])
        signature = json.dumps({k: v for k, v in state.items() if k != 'updated_at'}, sort_keys=True, default=str)
        with self.lock:
            self._pending_events.extend(events)
            if signature == self._signature and not force and not self._pending_events:
                return False
            self._signature = signature
            now = time.monotonic()
            if not force and not wait and now-self._last_sent_at < self.min_interval:
                # Coalesce: keep only the newest state and send it when the interval elapses.
                self._pending = state
                if self._timer is None:
                    self._timer = threading.Timer(self.min_interval-(now-self._last_sent_at), self._flush)
                    self._timer.daemon = True
                    self._timer.start()
                return True
            self._last_sent_at = now
            self._pending = None
            batch, self._pending_events = self._pending_events, []
        if wait:
            self._send(state, batch)
        else:
            threading.Thread(target=self._send, args=(state, batch), daemon=True).start()
        return True

    def _flush(self):
        with self.lock:
            state, self._pending, self._timer = self._pending, None, None
            batch, self._pending_events = self._pending_events, []
            self._last_sent_at = time.monotonic()
        if state is not None or batch:
            self._send(state, batch)

    def _send(self, state, events=()):
        incident = state['incident_id'] if state else (events[0].get('incident_id') if events else None)
        try:
            if events and incident:
                self.post_events(incident, list(events))
                with self.lock:
                    self.events_sent += len(events)
            if state is not None:
                self.put(state)
            with self.lock:
                self.published += 1 if state is not None else 0
                self.last_published = state['sim_time'] if state is not None else self.last_published
                self.last_error = None
        except (urllib.error.URLError, OSError, ValueError) as exc:
            with self.lock:
                self.last_error = f'State publish failed: {str(exc)[:200]}'
                if events:  # keep unsent events for the next flush
                    self._pending_events = list(events)+self._pending_events

    def status(self):
        with self.lock:
            return dict(enabled=self.enabled, url=self.url or None, published=self.published, events_sent=self.events_sent,
                        last_published=self.last_published, error=self.last_error)
