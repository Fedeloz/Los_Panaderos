"""Demo contact directory shared with HappyRobot's Despacho Central.

Names, roles and locations are fictional demo personas. Phone numbers stay
null unless DEMO_*_PHONE is set in .env (never invent them). District Telegram
channels fall back to the demo destination hardcoded in Mensajes externos v2
when DEMO_*_CHAT_ID is unset, so zone alerts can fire without per-district IDs.
"""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# Mensajes externos v2 (`Preparar destinatarios`): DEFAULT_GROUP_CHAT_ID.
# Private chat used to simulate a group (a real Telegram group id is negative).
# Env DEMO_*_CHAT_ID still wins. Do not put bot tokens here.
DEFAULT_ZONE_CHAT_ID = '5916687836'

ENV_KEYS = dict(
    farm_channel='DEMO_FARM_CHAT_ID',
    town_channel='DEMO_TOWN_CHAT_ID',
    town_north_channel='DEMO_TOWN_NORTH_CHAT_ID',
    town_south_channel='DEMO_TOWN_SOUTH_CHAT_ID',
    town_rosales_channel='DEMO_TOWN_ROSALES_CHAT_ID',
    farm_phone='DEMO_FARM_PHONE',
    farm_chat='DEMO_FARM_PERSON_CHAT_ID',
    town_phone='DEMO_TOWN_PHONE',
    town_chat='DEMO_TOWN_PERSON_CHAT_ID',
    contact_phone='DEMO_CONTACT_PHONE',
)


def load_env(path=None):
    """Load KEY=VALUE lines from .env without overriding the real environment."""
    path = Path(path or os.environ.get('DEMO_ENV_FILE', ROOT/'.env'))
    if not path.exists():
        return
    for line in path.read_text(encoding='utf-8-sig', errors='replace').splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        value = value.split(' #', 1)[0] if not value.strip().startswith(('"', "'")) else value
        key, value = key.strip(), value.strip().strip('"').strip("'")
        if key and value and key not in os.environ:
            os.environ[key] = value


def _env(key):
    value = os.environ.get(ENV_KEYS[key], '').strip()
    return value or None


def _zone_chat(key):
    """Per-district channel from env, else the Mensajes externos demo destination."""
    return _env(key) or DEFAULT_ZONE_CHAT_ID


# Demo muster points, one per district. Every cell is a road cell (fuel 0) that fire cannot
# reach in the simulation; `safe_because` is that physical reason in plain Spanish, so the
# agent can say it out loud instead of only naming a place. Facility names are real Brunete
# municipal facilities (see docs/population-provenance.md); placing each one in a given
# district of this illustration is a scenario convention, not a georeferenced location.
REFUGES = {
    (5, 30): dict(name='Polideportivo Municipal José Ramón de la Morena, en la Calle Estudiantes 1',
                  route='Salir del casco por la Calle Real hacia la Calle Estudiantes; el polideportivo y el instituto comparten la explanada de acceso. No bajar hacia las eras del este.',
                  safe_because='Las pistas y el aparcamiento son hormigón y asfalto sin vegetación: el fuego no puede llegar hasta allí.'),
    (17, 30): dict(name='patio del Colegio Público Ágora, en la Calle Miguel Induráin',
                   route='Salir de Prado Alto hacia el este por la Calle Murillo hasta el colegio; el patio y el aparcamiento quedan abiertos. No tomar los caminos que bajan al sureste.',
                   safe_because='El patio del colegio es solado y está separado del campo por la propia calle, así que el fuego no puede alcanzarlo.'),
    (15, 44): dict(name='Estadio Municipal Los Arcos, en la Calle Arcos esquina con Madrid',
                   route='Salir de Prado Nuevo por la Calle Arcos hacia el este hasta el estadio; hay sitio de sobra en el campo y en la pista. No cruzar los campos del sur.',
                   safe_because='El estadio es una superficie abierta y despejada rodeada de calle asfaltada: el fuego no tiene por dónde entrar.'),
    (6, 16): dict(name='explanada de la carretera del Valle de los Rosales, a la salida de la urbanización',
                  route='Salir de la urbanización por la carretera del Valle de los Rosales en dirección este hasta la explanada del kilómetro 0,4. No tomar los caminos del norte.',
                  safe_because='La explanada es firme de tierra y asfalto sin vegetación alrededor, y es la única salida rodada de la urbanización.'),
    (60, 26): dict(name='Cruce de la Dehesa, la explanada del camino de la M-600 al suroeste de la granja',
                   route='Salir de la granja por la pista principal hacia el suroeste y seguir el camino unos 700 metros hasta la explanada del cruce; no cruzar los campos hacia el sur ni hacia el este.',
                   safe_because='El cruce es camino y tierra apisonada, sin vegetación alrededor: el fuego no puede llegar hasta allí.',
                   rescue='Es el mismo camino por el que sube la dotación desde el parque de bomberos. Espere en la explanada, a la vista del camino y con el grupo reunido, y el camión le recogerá al pasar.'),
}

CHANNELS = dict(
    farm=dict(env='farm_channel', channel_name='Granja El Álamo · Avisos'),
    town=dict(env='town_channel', channel_name='Brunete Casco Histórico · Avisos vecinales'),
    town_north=dict(env='town_north_channel', channel_name='Prado Alto · Avisos vecinales'),
    town_south=dict(env='town_south_channel', channel_name='Prado Nuevo · Avisos vecinales'),
    town_rosales=dict(env='town_rosales_channel', channel_name='Valle de los Rosales · Avisos vecinales'),
)


def people():
    return [
        dict(contact_id='farm-manager', contact_name='Paco Herranz', role='Encargado de la Granja El Álamo',
             district_id='farm', known_location='Granja El Álamo, nave de ordeño junto al albergue (celda 73,21)',
             phone_number=_env('farm_phone'), chat_id=_env('farm_chat'), preferred_channel='phone', language='es',
             mobility='Coche propio. Responsable de unos 100 visitantes y personal; necesita ~20 minutos para reunir al grupo escolar del albergue.',
             notes='Es quien dio el aviso de humo por teléfono. Puede confirmar llamas a simple vista desde la nave. Tiene tractor y cisterna de 3.000 L.'),
        dict(contact_id='brunete-resident', contact_name='Carmen Ortega', role='Vecina y presidenta de la comunidad de Prado Alto',
             district_id='town_north', known_location='Calle Real 12, Prado Alto, Brunete (celda 15,30)',
             phone_number=_env('town_phone'), chat_id=_env('town_chat'), preferred_channel='phone', language='es',
             mobility='Movilidad reducida. Convive con su madre de 84 años; necesita ayuda o aviso temprano para evacuar.',
             notes='Administra el grupo de Telegram de Prado Alto y puede reenviar avisos a unos 300 hogares.'),
    ]


def directory(groups=None):
    """Build the `contacts` payload. `groups` is Simulation.groups for live status/refuges."""
    load_env()
    groups = groups or {}
    districts = []
    for district_id, channel in CHANNELS.items():
        group = groups.get(district_id, {})
        refuge = REFUGES.get(tuple(group.get('refuge', ())), {})
        districts.append(dict(district_id=district_id, name=group.get('name', district_id), kind=group.get('kind'),
                              population=group.get('count'), status=group.get('status'),
                              chat_id=_zone_chat(channel['env']), channel_name=channel['channel_name'],
                              evacuation_point=refuge.get('name'), evacuation_route=refuge.get('route'),
                              evacuation_point_is_safe_because=refuge.get('safe_because'), rescue_plan=refuge.get('rescue'),
                              refuge_cell=group.get('refuge')))
    persons = people()
    for person in persons:
        refuge = REFUGES.get(tuple(groups.get(person['district_id'], {}).get('refuge', ())), {})
        person.update(evacuation_point=refuge.get('name'), evacuation_route=refuge.get('route'),
                      evacuation_point_is_safe_because=refuge.get('safe_because'), rescue_plan=refuge.get('rescue'))
    missing = [f"{p['contact_id']}.{field}" for p in persons for field in ('phone_number', 'chat_id') if not p[field]]
    return dict(
        people=persons, districts=districts,
        emergency=dict(agency='Centro de coordinación Los Panaderos', contact_phone=_env('contact_phone')),
        policy=('Only call phone_number values listed in people — never invent phones. '
                'INBOUND CALLS: the demo handset is shared by several personas, so the caller ID proves nothing. '
                'Ask the caller for their name and the town or neighbourhood they are calling from BEFORE looking '
                'anything up, and query /lookup with name and district_id. A caller who is not in people is a '
                'normal unknown resident: answer for their district, never greet them as a listed persona. '
                'If two people share the same phone_number (demo handset), call once: pick the person whose district is in greater danger. District Telegram channels '
                'are the DEMO_*_CHAT_ID env values, or the shared demo destination used by Mensajes externos when '
                'those env vars are empty. Zone alerts (alertar_zona) may always fire: pass the district chat_id, '
                'or leave it empty and Mensajes externos delivers to its default demo channel. Personal Telegram '
                '(informar_persona) still requires that person\'s chat_id. A zone alert reaches the demo channel; '
                'a phone call reaches one person only.'),
        missing=missing)
