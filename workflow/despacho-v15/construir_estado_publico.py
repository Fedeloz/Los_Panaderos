import json
import uuid

LEVELS = ('none', 'watch', 'warning', 'critical')
DISTRICT_IDS = ('town', 'town_north', 'town_south', 'town_rosales', 'farm')
ALIASES = {
    'town': ('town', 'casco', 'casco historico', 'casco histórico', 'centro', 'brunete centro'),
    'town_north': ('town_north', 'prado alto'),
    'town_south': ('town_south', 'prado nuevo'),
    'town_rosales': ('town_rosales', 'valle de los rosales', 'rosales'),
    'farm': ('farm', 'granja', 'granja el alamo', 'granja el álamo', 'el alamo', 'el álamo', 'albergue'),
}


def parse(v):
    if v is None or v == '':
        return None
    if isinstance(v, (dict, list)):
        return v
    if isinstance(v, str):
        s = v.strip()
        if not s or s in ('null', 'undefined', 'None'):
            return None
        try:
            return json.loads(s)
        except Exception:
            return s
    return v


def as_list(v):
    if v is None or v == '':
        return []
    if isinstance(v, list):
        return v
    parsed = parse(v)
    if isinstance(parsed, list):
        return parsed
    if parsed is None:
        return []
    return [parsed]


def parallel(*cols):
    lists = [as_list(c) for c in cols]
    n = max((len(x) for x in lists), default=0)
    rows = []
    for i in range(n):
        row = []
        for lst in lists:
            if not lst:
                row.append('')
            elif len(lst) == 1:
                row.append(lst[0])
            elif i < len(lst):
                row.append(lst[i])
            else:
                row.append('')
        rows.append(row)
    return rows


def text(v, limit=None):
    if v is None:
        s = ''
    elif isinstance(v, (dict, list)):
        s = json.dumps(v, ensure_ascii=False)
    else:
        s = str(v).strip()
    if limit is not None:
        s = s[:limit]
    return s


def rank(level):
    try:
        return LEVELS.index(level)
    except ValueError:
        return 0


def bump(cur, nxt):
    return nxt if rank(nxt) > rank(cur) else cur


def advice_for(name, level, point, route):
    if level == 'critical':
        return (name + ': peligro inminente. Salga hacia ' + (point or 'el punto de encuentro') + '. ' + (route or '')).strip()
    if level == 'warning':
        return (name + ': aviso de evacuacion preventiva. Dirijase a ' + (point or 'el punto de encuentro') + '.').strip()
    if level == 'watch':
        return name + ': no hay peligro ahora mismo. Mantenga el telefono cerca.'
    return name + ': fuera de la zona afectada.'


def resolve_district(raw, directory):
    blob = text(raw).lower()
    if not blob:
        return ''
    if blob in DISTRICT_IDS:
        return blob
    for did, names in ALIASES.items():
        if blob in names or any(n in blob for n in names if len(n) >= 4):
            return did
    for d in directory:
        did = text(d.get('district_id'))
        name = text(d.get('name')).lower()
        if blob == did or (name and (blob == name or name in blob or blob in name)):
            return did
    return ''


def clip_rec(rec):
    out = {'kind': rec['kind'], 'status': text(rec.get('status') or 'sent', 40)}
    did = text(rec.get('district_id'))
    if did:
        out['district_id'] = did
    action = text(rec.get('action'))
    if action:
        out['action'] = action
    crit = text(rec.get('criticality'), 16)
    if crit:
        out['criticality'] = crit
    name = text(rec.get('contact_name'), 120)
    if name:
        out['contact_name'] = name
    info = text(rec.get('information'), 600)
    if info:
        out['information'] = info
    rid = text(rec.get('run_id'))
    if rid:
        out['run_id'] = rid
    return out


ws = parse(input_data.get('world_state')) or {}
if not isinstance(ws, dict):
    ws = {}
contacts = parse(input_data.get('contacts')) or {}
if not isinstance(contacts, dict):
    contacts = {}
thermal = parse(input_data.get('thermal')) or {}
if not isinstance(thermal, dict):
    thermal = {}
incident_id = str(input_data.get('incident_id') or '').strip()
decision = str(input_data.get('decision') or '').strip().lower()
districts_ws = ws.get('districts') or []
if not isinstance(districts_ws, list):
    districts_ws = []
by_contact = {d.get('district_id'): d for d in (contacts.get('districts') or []) if isinstance(d, dict)}
warned = str(input_data.get('destinatarios') or '') + ' ' + str(input_data.get('alert_zone') or '') + ' ' + str(input_data.get('call_list') or '')
out = []
for d in districts_ws:
    if not isinstance(d, dict):
        continue
    did = d.get('district_id') or ''
    name = d.get('name') or did
    ch = by_contact.get(did) or {}
    point = d.get('evacuation_point') or ch.get('evacuation_point') or ''
    route = d.get('evacuation_route') or ch.get('evacuation_route') or ''
    level = (d.get('auto_danger_level') or d.get('danger_level') or 'none').lower()
    if level not in LEVELS:
        level = 'none'
    status = (d.get('status') or '').lower()
    if status == 'burnt':
        level = 'critical'
    elif status == 'evacuating':
        level = bump(level, 'warning')
    blob = warned.lower()
    if (did and did.lower() in blob) or (name and name.lower() in blob):
        level = bump(level, 'warning')
        if decision == 'avisar':
            level = bump(level, 'warning')
    out.append({'district_id': did, 'danger_level': level, 'advice': advice_for(name, level, point, route), 'evacuation_point': point or '', 'evacuation_route': route or ''})
warned_names = [d['district_id'] for d in out if d['danger_level'] in ('warning', 'critical')]
public_message = 'Incendio en Brunete en seguimiento. Distritos en aviso: ' + (', '.join(warned_names) or 'ninguno') + '.'

directory = list(by_contact.values()) + [d for d in districts_ws if isinstance(d, dict)]
run_id = text(input_data.get('run_id'))
comms = []
for zone, info, crit, action, chat in parallel(
        input_data.get('alert_zone'),
        input_data.get('zone_information'),
        input_data.get('zone_criticality'),
        input_data.get('zone_action'),
        input_data.get('zone_chat')):
    if not text(zone) and not text(info) and not text(chat):
        continue
    rec = {
        'kind': 'zone_alert',
        'district_id': resolve_district(zone, directory) or resolve_district(chat, directory),
        'contact_name': text(zone) or text(chat),
        'criticality': crit,
        'information': info,
        'status': 'sent',
        'run_id': run_id,
    }
    act = text(action)
    if act:
        rec['action'] = act
    comms.append(clip_rec(rec))
for item in as_list(input_data.get('call_list')):
    if not isinstance(item, dict):
        continue
    rec = {
        'kind': 'call',
        'district_id': resolve_district(item.get('district_id') or item.get('known_location') or item.get('affected_zone'), directory),
        'contact_name': item.get('contact_name'),
        'criticality': item.get('criticality'),
        'information': item.get('information'),
        'status': 'sent',
        'run_id': run_id,
    }
    comms.append(clip_rec(rec))
for name, chat, info, crit, zone in parallel(
        input_data.get('personal_name'),
        input_data.get('personal_chat'),
        input_data.get('personal_information'),
        input_data.get('personal_criticality'),
        input_data.get('personal_zone')):
    if not text(name) and not text(chat) and not text(info):
        continue
    rec = {
        'kind': 'personal_message',
        'district_id': resolve_district(zone or name, directory),
        'contact_name': name,
        'criticality': crit,
        'information': info,
        'status': 'sent',
        'run_id': run_id,
    }
    comms.append(clip_rec(rec))

pending = None
mission = str(input_data.get('drone_mission') or '').strip()
cmd = str(input_data.get('drone_command') or '').strip()
if mission or cmd:
    pending = {
        'command_id': uuid.uuid4().hex,
        'event_id': str(input_data.get('event_id') or ''),
        'command': cmd or 'hold',
        'mission': mission,
        'reason': str(input_data.get('drone_reason') or ''),
        'extinguisher_orders': parse(input_data.get('extinguisher_orders')),
        'scout_orders': parse(input_data.get('scout_orders')),
        'truck_orders': parse(input_data.get('truck_orders')),
    }
    # Passthrough. Role vocab is the nested Los Panaderos workflow's job:
    # scout_orders = patrol|hold|continue|evacuate_town|evacuate_farm
    # extinguisher_orders = scout|contain|hold|evacuate_town|evacuate_farm
    # truck_orders = attack_sector|continue|hold
    # This node does not rewrite commands.
try:
    gen = int(str(input_data.get('generation') or '0').strip() or 0)
except Exception:
    gen = 0
output = {
    'incident_id': incident_id,
    'districts': out,
    'public_message': public_message,
    'loop_seen_generation': gen,
    'session_id': str(input_data.get('session_id') or ''),
    'last_dispatch': {
        'decision': decision,
        'criticidad': str(input_data.get('criticidad') or ''),
        'destinatarios': str(input_data.get('destinatarios') or ''),
        'justificacion': str(input_data.get('justificacion') or ''),
    },
    'pending_command': pending,
    'communications_sent': comms,
    'advice_source': 'despacho_code',
}
