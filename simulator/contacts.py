"""Demo contact directory shared with HappyRobot's Despacho Central.

Names, roles and locations are fictional demo personas. Phone numbers and
Telegram chat IDs are NEVER hard-coded: they come from .env so only team
members' devices can ever be called or messaged. Missing values are reported
as `missing` so the dispatch agent states "datos faltantes" instead of
inventing a contact.
"""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

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
    for line in path.read_text(encoding='utf-8', errors='replace').splitlines():
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


REFUGES = {
    (5, 22): dict(name='Polideportivo municipal de Brunete', route='Salir hacia el oeste por la Calle Real y la M-600 hasta el polideportivo; evitar los caminos de las eras al este.'),
    (60, 12): dict(name='Aparcamiento de la carretera M-600 (norte de la granja)', route='Salir de la granja hacia el norte por la pista principal hasta el aparcamiento de la M-600; no cruzar los campos hacia el sur.'),
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
                              chat_id=_env(channel['env']), channel_name=channel['channel_name'],
                              evacuation_point=refuge.get('name'), evacuation_route=refuge.get('route'),
                              refuge_cell=group.get('refuge')))
    persons = people()
    for person in persons:
        refuge = REFUGES.get(tuple(groups.get(person['district_id'], {}).get('refuge', ())), {})
        person.update(evacuation_point=refuge.get('name'), evacuation_route=refuge.get('route'))
    missing = [f"{d['district_id']}.chat_id" for d in districts if not d['chat_id']]
    missing += [f"{p['contact_id']}.{field}" for p in persons for field in ('phone_number', 'chat_id') if not p[field]]
    return dict(
        people=persons, districts=districts,
        emergency=dict(agency='Centro de coordinación Los Panaderos', contact_phone=_env('contact_phone')),
        policy=('Only call phone_number values listed in people and only alert chat_id values listed here. '
                'Never invent, guess or reuse numbers/IDs. If a needed phone_number or chat_id is null, report it in '
                'datos_faltantes and use the remaining channels. Zone alerts reach every resident of that district_id; '
                'a phone call reaches one person only. All values are demo test devices belonging to the team.'),
        missing=missing)
