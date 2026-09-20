"""Check every link in the demo chain and say which one is broken.

    python -m scripts.preflight            once
    python -m scripts.preflight --watch    every 5s, for the minutes before a demo

Reads only. It never writes to the shared state, so it is safe to run while the
demo is live. The one thing it cannot see is HappyRobot itself: it infers whether
a dispatcher Run is alive from whether `loop_seen_generation` moves.
"""
import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from simulator.contacts import directory, load_env
from simulator.state_store import StateStore

def _utf8_console():
    """The Windows console defaults to cp1252 and these scripts print accents. Without
    this a plain `python -m scripts.demo` dies on the first non-ASCII character."""
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding='utf-8', errors='replace')
        except (AttributeError, ValueError, OSError):
            pass


_utf8_console()

OK, WARN, BAD = 'OK  ', 'AVISO', 'FALLO'
UA = {'User-Agent': 'los-panaderos-preflight/1.0'}


def line(state, what, detail=''):
    print(f'  [{state}] {what}' + (f' — {detail}' if detail else ''))
    return state == OK


def get(url, token=None, timeout=10):
    headers = dict(UA)
    if token:
        headers['Authorization'] = 'Bearer '+token
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=timeout) as res:
        return json.loads(res.read().decode() or 'null')


def check_local(port):
    print('\nSIMULADOR LOCAL')
    try:
        state = get(f'http://127.0.0.1:{port}/api/state', timeout=4)
    except Exception as exc:
        line(BAD, f'servidor en :{port}', f'{type(exc).__name__}. Arranca: python -m simulator.server')
        return None
    line(OK, f'servidor en :{port}', f"incidente {state.get('incident_id')} · T+{state.get('tick')}")
    phase = 'encendido' if state.get('ignited') else 'sin encender'
    line(OK, 'escenario', f"{phase} · {state.get('burning', 0)} celdas ardiendo · aviso de humo: {'sí' if state.get('called') else 'no'}")
    store = state.get('state_store') or {}
    if not store.get('enabled'):
        line(BAD, 'publicación a Cloudflare', 'desactivada: faltan STATE_API_URL / STATE_API_TOKEN en .env')
    elif store.get('error'):
        line(BAD, 'publicación a Cloudflare', str(store['error'])[:90])
    else:
        line(OK, 'publicación a Cloudflare', f"{store.get('published')} envíos · último T+{store.get('last_published')}")
    return state


def check_env():
    print('\nCONFIGURACIÓN')
    load_env()
    nodes = ['HAPPYROBOT_WORKFLOW_ID', 'HAPPYROBOT_DRONE_NODE', 'HAPPYROBOT_DISPATCH_NODE',
             'HAPPYROBOT_CALL_NODE', 'HAPPYROBOT_ZONE_ALERT_NODE', 'HAPPYROBOT_PERSONAL_MESSAGE_NODE']
    missing = [n for n in nodes if not os.environ.get(n, '').strip()]
    line(OK if not missing else WARN, 'ids de nodo de HappyRobot',
         'los 6 puestos' if not missing else 'faltan '+', '.join(missing)+' (se usan los del código)')
    mode = os.environ.get('HAPPYROBOT_MODE', 'loop')
    line(OK if mode == 'loop' else WARN, 'modo', f'{mode}' + ('' if mode == 'loop' else ' — el bucle de Despacho no se usa en este modo'))
    contacts = directory()
    chats = {d['chat_id'] for d in contacts['districts']}
    line(OK if len(chats) > 1 else WARN, 'canales de Telegram',
         f'{len(chats)} distintos' if len(chats) > 1 else 'los 5 distritos comparten el chat de pruebas (sin DEMO_*_CHAT_ID)')
    phones = {p['phone_number'] for p in contacts['people'] if p['phone_number']}
    line(OK if phones else WARN, 'teléfonos del directorio',
         f'{len(phones)} número(s)' if phones else 'ninguno: el agente no podrá llamar a nadie')
    return os.environ.get('DISPATCH_INCIDENT_ID', 'brunete-demo')


def check_cloud(store, incident):
    print('\nCLOUDFLARE')
    if not store.enabled:
        line(BAD, 'state API', 'sin configurar en .env')
        return None, None
    try:
        health = get(store.url+'/health', timeout=8)
        line(OK if health.get('ok') else BAD, 'Worker vivo', store.url.split('//')[-1])
    except Exception as exc:
        line(BAD, 'Worker vivo', f'{type(exc).__name__}: {str(exc)[:70]}')
        return None, None
    try:
        doc = get(f'{store.url}/state/{incident}', store.token, timeout=10)
    except urllib.error.HTTPError as exc:
        line(BAD if exc.code != 404 else WARN, f'documento {incident}',
             'no existe todavía (enciende el incendio)' if exc.code == 404 else f'HTTP {exc.code}')
        return None, None
    except Exception as exc:
        line(BAD, f'documento {incident}', str(exc)[:70])
        return None, None
    line(OK, 'autenticación', 'el token del .env es válido')
    line(OK, f'documento {incident}',
         f"T+{doc.get('sim_time')} · escrito {doc.get('updated_at')} · sesión {str(doc.get('session_id'))[:8]}")
    try:
        inbox = get(f'{store.url}/inbox/{incident}', store.token, timeout=10)
    except Exception:
        inbox = {}
    return doc, inbox


def check_loop(doc, inbox):
    print('\nBUCLE DE DESPACHO  (HappyRobot)')
    if doc is None:
        return
    seen, generation = doc.get('loop_seen_generation'), inbox.get('generation')
    has_work = inbox.get('has_work')
    if generation is None:
        line(WARN, 'buzón', 'vacío: el simulador aún no ha pedido ninguna decisión')
    else:
        line(OK, 'buzón', f'generación {generation} · visto {seen} · has_work={has_work}')
        if has_work is False and generation == seen:
            line(OK, 'al día', 'el agente ha procesado todo lo pedido')
        elif has_work:
            line(WARN, 'trabajo sin atender', 'hay una petición esperando. Si no baja en ~10 s, no hay Run vivo')
    comms = doc.get('communications_sent') or []
    line(OK if comms else WARN, 'avisos emitidos',
         f'{len(comms)} en el registro' if comms else 'ninguno todavía: el agente no ha avisado a nadie')
    pending = doc.get('pending_command')
    line(OK if pending else WARN, 'órdenes de flota',
         f"última {str((pending or {}).get('command_id'))[:8]}" if pending else 'ninguna todavía')
    if doc.get('session_id') is None:
        line(WARN, 'sesión', 'el documento no tiene sesión: la guardia del Worker no puede proteger nada')


def check_caller(store, incident):
    print('\nLLAMADA ENTRANTE  (lo que oiría un vecino)')
    if not store.enabled:
        return
    try:
        look = get(f'{store.url}/lookup?incident_id={incident}&district_id=town&name=Prueba', store.token, timeout=10)
    except Exception as exc:
        line(BAD, '/lookup', str(exc)[:70])
        return
    guidance = str(look.get('guidance') or '')
    line(OK, 'identificación', f"{look.get('identity_status')} · distrito {(look.get('district') or {}).get('district_id')}")
    line(OK, 'guion', guidance[:96])
    situation = (look.get('situation') or {}).get('summary') or ''
    line(OK, 'situación', situation[:96])


def run(port):
    load_env()
    store = StateStore()
    print('='*74)
    print(f'  PREFLIGHT · {time.strftime("%H:%M:%S")}')
    print('='*74)
    incident = check_env()
    check_local(port)
    doc, inbox = check_cloud(store, incident)
    check_loop(doc, inbox or {})
    check_caller(store, incident)
    print()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--watch', action='store_true', help='repetir cada 5 segundos')
    args = parser.parse_args()
    while True:
        run(args.port)
        if not args.watch:
            break
        time.sleep(5)
