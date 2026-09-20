"""Run with python3 -m simulator.server; open http://127.0.0.1:8765."""
import argparse
import atexit
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import threading
import time
import zlib
from urllib.parse import urlparse

from .contacts import directory as contact_directory, load_env
from .engine import Simulation
from .geo import PLACE
from .happyrobot import HappyRobot, EDITOR
from .state_store import StateStore, build_state


def happyrobot_mode():
    load_env()
    return (os.environ.get('HAPPYROBOT_MODE', 'loop') or 'loop').strip().lower()


def dispatch_incident_id():
    load_env()
    return (os.environ.get('DISPATCH_INCIDENT_ID', 'brunete-demo') or 'brunete-demo').strip() or 'brunete-demo'


def loop_mode():
    return happyrobot_mode() == 'loop'

ROOT = Path(__file__).resolve().parents[1]


def _env_file():
    values = {}
    path = ROOT / '.env'
    if not path.exists():
        return values
    for line in path.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def local_host(host_header):
    """Only the loopback interface may read local API keys."""
    return (host_header or '').split(':')[0] in {'127.0.0.1', 'localhost'}


def action_origin_allowed(origin, host_header, port):
    """Same-origin only: localhost, PUBLIC_ORIGIN, or Origin matching Host (Cloudflare tunnel)."""
    if not origin:
        return False
    allowed = {f'http://127.0.0.1:{port}', f'http://localhost:{port}'}
    public = os.environ.get('PUBLIC_ORIGIN', '').strip().rstrip('/')
    if public:
        allowed.add(public)
    if origin in allowed:
        return True
    host = (host_header or '').split(',')[0].strip()
    if not host:
        return False
    return origin in {f'https://{host}', f'http://{host}'}


class Controller:
    def __init__(self):
        self.lock = threading.RLock()
        self.loop = loop_mode()
        self.sim = Simulation(drone_count=2, incident_id=dispatch_incident_id() if self.loop else None)
        self.robot = HappyRobot()
        self.store = StateStore()
        self.busy = False
        self.pending_fires = []
        self.reset_pending = False
        self.auto = False
        self.running = False
        self.speed = 2
        self.error = None
        self.run_evidence = ''
        self.recording = False
        self.recorded_frames = []
        self.calls = 0
        self.latency = None
        self.stop = threading.Event()
        self.frames = [self.snapshot()]
        self.cursor = None
        self.next_decision = 0
        self.repair_attempts = 0
        # Optimistic clock: keep simulating while HappyRobot deliberates and apply the
        # decision to the live tick on arrival (validation still rejects unsafe stale orders).
        self.optimistic = False
        self._cache_key = None
        self._cache_body = b''
        self._cache_etag = ''
        self._applied_command_id = None
        self._applied_dispatch = None
        self._inbox_generation = 0
        threading.Thread(target=self._clock, daemon=True).start()

    def snapshot(self):
        return zlib.compress(json.dumps(self.sim.state()).encode())

    def publish_state(self, force=False):
        """Push the shared incident state (districts, danger levels, contacts, comms) to the state API."""
        if not self.store.enabled or not self.sim.ignited:
            return False
        return self.store.publish(build_state(self.sim), force=force, events=self.sim.drain_events())

    def inbox_payload(self, event='local_observation'):
        payload = self.sim.payload(event)
        payload['source'] = 'los-panaderos-simulator'
        payload['phase'] = self.sim.phase
        return payload

    def publish_inbox(self, event='local_observation', force=False):
        if not self.store.enabled:
            return False
        return self.store.publish_inbox(self.inbox_payload(event), force=force)

    def pull_dispatch(self):
        """Apply fleet orders and dispatch summary the looping Despacho wrote to KV."""
        if not self.loop or not self.store.enabled or not self.sim.ignited:
            return
        try:
            remote = self.store.get(self.sim.incident_id)
        except Exception as exc:
            self.store.last_error = f'State pull failed: {str(exc)[:200]}'
            return
        if not isinstance(remote, dict):
            return
        dispatch = remote.get('last_dispatch')
        if isinstance(dispatch, dict) and dispatch != self._applied_dispatch:
            self.sim.record_dispatch(dispatch)
            self._applied_dispatch = dict(dispatch)
        comms = remote.get('communications_sent')
        if isinstance(comms, list) and comms:
            known = {(c.get('kind'), c.get('contact_name'), c.get('information'), c.get('tick')) for c in self.sim.communications}
            fresh = [c for c in comms if isinstance(c, dict) and (c.get('kind'), c.get('contact_name'), c.get('information'), c.get('tick')) not in known]
            if fresh:
                self.sim.apply_communications(fresh)
        command = remote.get('pending_command')
        if not isinstance(command, dict):
            return
        command_id = str(command.get('command_id') or command.get('event_id') or '')
        if not command_id or command_id == self._applied_command_id:
            return
        decision = HappyRobot.normalize(command) or (command if 'command' in command and 'mission' in command else None)
        if decision is None:
            return
        try:
            self.sim.apply(decision, command_id, self.sim.incident_id, self.sim.tick)
            self._applied_command_id = command_id
            self.calls += 1
            self.run_evidence = json.dumps(dict(source='kv-pull', command_id=command_id, decision=self.sim.dispatch), ensure_ascii=False, indent=2)[:16000]
        except ValueError as exc:
            self.sim.last_result = dict(status='rejected', reason=str(exc)[:800],
                instruction='Choose a new valid command using CURRENT observations.')
            self.sim.log('system', 'Command from dispatcher loop rejected: '+str(exc)[:200])
            self._applied_command_id = command_id

    def wipe_shared_session(self, incident_id):
        """Clear the shared incident, its events and the dispatcher inbox on Reset.

        Without this a Reset only rebuilt the local simulation. The KV document kept the
        finished fire, so an inbound caller was still told about it, and the stored
        loop_seen_generation stayed ahead of the fresh inbox, which silently swallowed the
        next event the dispatcher should have picked up. StateStore.delete and the Worker
        route already existed; nothing called them.

        Runs off-thread: the controller lock is held here and the browser poll must not
        wait on the network. A failure is reported through the store status, never raised,
        so Reset always resets the simulation.
        """
        if not self.store.enabled or not incident_id:
            return False
        # Drop queued publishes first: a coalesced flush from the incident that just ended
        # would land after the wipe and put it straight back.
        self.store.cancel_pending()

        def wipe():
            try:
                self.store.delete(incident_id)
            except Exception as exc:
                self.store.last_error = f'Session reset failed: {str(exc)[:200]}'

        threading.Thread(target=wipe, daemon=True).start()
        return True

    def record(self):
        frame=self.snapshot()
        self.frames.append(frame)
        self.publish_state()
        if self.recording:
            self.recorded_frames.append(frame)
            if len(self.recorded_frames)>=1500:self.recording=False
        if len(self.frames)>1500:
            self.frames.pop(0)

    def _clock(self):
        while not self.stop.wait(1/self.speed):
            with self.lock:
                if not self.running or (self.busy and not self.optimistic) or self.cursor is not None:
                    continue
                self.sim.step()
                if self.sim.phase != 'active':
                    self.auto = False
                if self.sim.phase == 'finished':
                    self.running = False
                self.record()
                if self.sim.phase == 'finished':
                    self.recording = False
                if self.loop:
                    self.pull_dispatch()
                    if self.auto and self.sim.called and (self.sim.pending_decision_event or self.sim.tick>=self.next_decision):
                        event = self.sim.pending_decision_event or 'local_observation'
                        self.sim.pending_decision_event = None
                        self.publish_inbox(event, force=True)
                        self.next_decision = self.sim.tick + 16
                elif self.auto and not self.busy and self.sim.called and (self.sim.pending_decision_event or self.sim.tick>=self.next_decision):
                    self.request_decision(self.sim.pending_decision_event or 'local_observation')

    def state(self):
        with self.lock:
            frame = self.sim.state() if self.cursor is None else json.loads(zlib.decompress(self.frames[self.cursor]))
            return dict(frame, pending_fires=len(self.pending_fires), reset_pending=self.reset_pending, busy=self.busy, auto=self.auto,running=self.running,speed=self.speed,
                        frame_index=len(self.frames)-1 if self.cursor is None else self.cursor,
                        recording=self.recording,recorded_frames=len(self.recorded_frames),
                        frame_count=len(self.frames),replay=self.cursor is not None,live_tick=self.sim.tick,
                        connected=self.robot.connected, error=self.error, workflow_url=EDITOR,
                        workflow_calls=self.calls, latency=self.latency, run_evidence=self.run_evidence,
                        timings=getattr(self.robot,'last_timings',{}), optimistic=self.optimistic,
                        state_store=self.store.status(), happyrobot_mode='loop' if self.loop else 'push',
                        dispatcher_loop=self.loop)

    def state_bytes(self):
        """Serialized state with an ETag. Re-serializes only when something observable changed,
        so the 600 ms browser poll costs nothing while HappyRobot deliberates."""
        with self.lock:
            key = (len(self.frames), self.sim.tick, self.sim.incident_id, self.cursor, self.busy, self.running, self.auto,
                   self.error, self.calls, self.recording, len(self.recorded_frames), self.reset_pending,
                   len(self.pending_fires), self.speed, self.robot.connected, self.optimistic, self.latency,
                   json.dumps(self.store.status(), sort_keys=True, default=str))
            if key != self._cache_key:
                self._cache_body = json.dumps(self.state()).encode()
                self._cache_etag = '"%08x-%d"' % (zlib.crc32(self._cache_body), len(self._cache_body))
                self._cache_key = key
            return self._cache_etag, self._cache_body

    def request_decision(self, event='local_observation'):
        if self.sim.phase != 'active':
            raise ValueError('Fire is out; vehicles are returning or at station.')
        if self.cursor is not None:
            raise ValueError('Return to Live before requesting decisions.')
        if self.loop:
            if not self.sim.called:
                raise ValueError('Send the farmer report first.')
            self.sim.pending_decision_event = None
            self.error = None
            self.publish_inbox(event, force=True)
            self.next_decision = self.sim.tick + 16
            return
        if self.busy:
            raise ValueError('A decision is already running.')
        if not self.sim.called:
            raise ValueError('Send the farmer report first.')
        if event != 'command_rejected':
            self.repair_attempts = 0
        payload = self.sim.payload(event)
        self.sim.pending_decision_event = None
        self.busy = True
        self.error = None
        threading.Thread(target=self._decide, args=(payload,self.sim.tick), daemon=True).start()

    def _decide(self, payload, tick):
        start = time.monotonic()
        retry = False
        try:
            decision, evidence = self.robot.decide(payload)
            with self.lock:
                if self.reset_pending:return
                self.calls += 1
                self.latency = round(time.monotonic()-start, 1)
                self.run_evidence = evidence
                # Communications and the dispatch summary are facts about what Central already did;
                # record them even if the drone mission is later rejected by validation.
                if self.sim.incident_id==payload['incident_id']:
                    self.sim.record_dispatch(getattr(self.robot,'last_dispatch',None))
                    self.sim.apply_communications(getattr(self.robot,'last_communications',None))
                if decision is not None:
                    if self.optimistic and self.sim.tick!=tick:
                        self.sim.log('system',f'Optimistic clock: applying decision made at T+{tick} to live T+{self.sim.tick}; safety validation uses current observations.')
                        tick=self.sim.tick
                    self.sim.apply(decision,payload['event_id'],payload['incident_id'],tick)
                else:
                    self.sim.log('central','No drone mission issued this round; vehicles keep their current orders.')
                self.next_decision = self.sim.tick + 16
                self.record()
                self.publish_state(force=True)
        except Exception as exc:
            with self.lock:
                if self.reset_pending:return
                message = str(exc)[:800]
                if isinstance(exc, ValueError) and self.repair_attempts < 1 and self.cursor is None:
                    self.repair_attempts += 1
                    retry = True
                    self.sim.last_result = dict(status='rejected',reason=message,
                        instruction='Choose a new valid command using CURRENT observations. For contain use an exact x,y pair from drone_telemetry.safe_containment_positions, not a burning cell.')
                    self.sim.log('system','Command rejected; requesting one corrected HappyRobot decision. '+message)
                else:
                    self.error = message
                    self.running = self.auto = False
                    self.sim.log('system',self.error)
                self.record()
        finally:
            with self.lock:
                self.busy = False
                if self.reset_pending:
                    self.action('reset',{})
                else:
                    for x,y in self.pending_fires:
                        self.sim.add_fire(x,y)
                    if self.pending_fires:self.record()
                    self.pending_fires.clear()
                    if retry:self.request_decision('command_rejected')

    def action(self, action, data):
        with self.lock:
            if action == 'stop_recording':
                self.recording=False
                self.running=False
                return
            if action == 'pause':
                self.running = False
                return
            if action == 'optimistic':
                self.optimistic = bool(data.get('enabled'))
                return
            if action == 'seek':
                index = int(data.get('index',0))
                if not 0<=index<len(self.frames):
                    raise ValueError('Frame outside replay.')
                self.running = False
                self.cursor = index
                return
            if action == 'live':
                self.cursor = None
                return
            if self.cursor is not None and action != 'reset':
                raise ValueError('Return to Live to change the simulation. Replay never reruns AI.')
            if self.busy and action == 'reset':
                self.reset_pending=True
                self.running=self.auto=False
                return
            if self.busy and action == 'add_fire' and not self.reset_pending:
                x,y=data.get('x'),data.get('y')
                self.sim.validate_ignition(x,y)
                if (x,y) not in self.pending_fires:self.pending_fires.append((x,y))
                return
            if self.busy:
                raise ValueError('HappyRobot is deciding. You can pause or inspect the timeline.')
            if action == 'reset':
                self.wipe_shared_session(self.sim.incident_id)
                self.reset_pending=False
                self.pending_fires.clear()
                self.repair_attempts=0
                self.cursor = None
                self.sim = Simulation(fleet_counts=self.sim.fleet_counts(), incident_id=dispatch_incident_id() if self.loop else None)
                self.recording=False
                self.error = None
                self.auto = self.running = False
                self.calls = 0
                self.run_evidence = ''
                self.latency = None
                self.frames = [self.snapshot()]
                self.next_decision = 0
                self._applied_command_id = None
                self._applied_dispatch = None
                self._inbox_generation = 0
            elif action == 'fleet':
                self.sim.configure_fleet(data.get('count'),**data.get('counts',{}))
                self.sim.observe()
            elif action == 'add_fire':
                self.sim.add_fire(data.get('x'),data.get('y'))
            elif action == 'place_fire':
                self.sim.place_fire(data.get('x'),data.get('y'))
            elif action == 'record_run':
                if 'x' in data or 'y' in data:self.sim.set_wind(x=data.get('x'),y=data.get('y'))
                self.recorded_frames=[self.snapshot()]
                self.recording=True
                self.sim.ignite()
                if not self.sim.called:self.sim.farmer_call()
                self.running=self.auto=True
                self.request_decision('farmer_call' if self.calls==0 else 'local_observation')
            elif action == 'ignite':
                self.sim.ignite()
            elif action == 'step':
                self.sim.step()
            elif action == 'spread_factor':
                self.sim.set_spread_factor(data.get('value'))
                if self.sim.called:
                    self.request_decision('forecast_update')
            elif action == 'wind':
                self.sim.set_wind(data.get('direction','east'),data.get('x'),data.get('y'))
                if self.sim.called:
                    self.request_decision('forecast_update')
            elif action == 'call':
                self.sim.farmer_call(str(data.get('message',''))[:2000].strip())
                self.auto = self.running = True
                self.request_decision('farmer_call')
            elif action in {'decision','auto'}:
                self.auto = action=='auto'
                self.running = self.auto
                self.request_decision()
            elif action == 'play':
                self.running = True
            elif action == 'speed':
                speed = int(data.get('speed',2))
                if speed not in {1,2,4,8}:
                    raise ValueError('Invalid playback speed.')
                self.speed = speed
            else:
                raise ValueError('Unknown action.')
            self.record()


def serve(port=8765):
    controller = Controller()
    atexit.register(controller.robot.close)
    static = Path(__file__).parent/'static'
    pages = {'/': 'situacion.html', '/situacion': 'situacion.html',
             '/incidente': 'incidente.html', '/incidente/brunete': 'incidente.html',
             '/medios': 'medios.html', '/archivo': 'archivo.html',
             '/favicon.ico': 'favicon.png'}

    class Handler(BaseHTTPRequestHandler):
        def reply(self, code, body, content_type='application/json'):
            if not isinstance(body, bytes):
                body = json.dumps(body).encode()
            self.send_response(code)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            path = urlparse(self.path).path
            if path == '/api/recording':
                with controller.lock:
                    frames=[json.loads(zlib.decompress(f)) for f in controller.recorded_frames]
                self.reply(200,dict(format='los-panaderos-recording-v1',frames=frames))
            elif path == '/api/state':
                etag, body = controller.state_bytes()
                if self.headers.get('If-None-Match') == etag:
                    self.send_response(304)
                    self.send_header('ETag', etag)
                    self.send_header('Cache-Control', 'no-cache')
                    self.end_headers()
                    return
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', str(len(body)))
                self.send_header('ETag', etag)
                self.send_header('Cache-Control', 'no-cache')
                self.send_header('X-Content-Type-Options', 'nosniff')
                self.end_headers()
                self.wfile.write(body)
            elif path == '/api/config':
                if not local_host(self.headers.get('Host')):
                    self.reply(403, {'error': 'Local config only.'})
                    return
                env = _env_file()
                self.reply(200, dict(
                    cesium_token=env.get('CESIUM_API_KEY') or None,
                    nasa_key=env.get('NASA_KEY') or None,
                    place=dict(PLACE)))
            elif path in pages or path in {'/app.js', '/ops.js', '/chrome.js', '/situacion.js', '/medios.js', '/archivo.js', '/mapa.js', '/mapa.css', '/observation-map.js', '/vendor/bootstrap-icons.js', '/style.css', '/favicon.png', '/cursors/flamethrower-hover.svg', '/cursors/flamethrower-active.svg', '/maps/brunete.jpg', '/maps/brunete-illustrated.png', '/maps/spain-location.svg'}:
                name = pages[path] if path in pages else path[1:]
                types = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.jpg':'image/jpeg', '.png':'image/png', '.svg':'image/svg+xml'}
                file = static/name
                self.reply(200, file.read_bytes(), types[file.suffix])
            else:
                self.reply(404, {'error': 'Not found'})

        def do_POST(self):
            # Reject cross-origin requests to the local authenticated MCP bridge.
            # Cloudflare tunnels are same-origin: Origin matches the public Host header.
            if self.headers.get('X-Simulator-Request') != '1' or not action_origin_allowed(
                    self.headers.get('Origin'), self.headers.get('Host'), port):
                self.reply(403, {'error': 'Use the local simulator interface.'})
                return
            if self.path != '/api/action':
                self.reply(404, {'error': 'Not found'})
                return
            try:
                length = int(self.headers.get('Content-Length', '0'))
                if not 0 < length <= 8192:
                    raise ValueError('Invalid request size.')
                data = json.loads(self.rfile.read(length))
                if not isinstance(data, dict):
                    raise ValueError('Expected JSON object.')
                controller.action(data.get('action'), data)
                self.reply(200, controller.state())
            except (ValueError, TypeError) as exc:
                self.reply(400, {'error': str(exc)})

        def log_message(self, *_):
            pass

    server = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    print(f'Los Panaderos: http://127.0.0.1:{port}', flush=True)
    mode = 'loop (sim writes KV inbox; click Run on Despacho in HappyRobot development)' if loop_mode() else 'push (each tick starts a Despacho run)'
    print(f'HappyRobot mode={happyrobot_mode()}: {mode}', flush=True)
    if loop_mode():
        print(f'Dispatcher session key: {dispatch_incident_id()} — click Run on Despacho Central (development).', flush=True)
    print('Farmer call is a simulated transcript.', flush=True)
    missing = contact_directory().get('missing', [])
    if missing:
        print('Demo contacts without phone/Telegram IDs (set DEMO_* in .env): '+', '.join(missing), flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        controller.stop.set()
        controller.robot.close()
        server.server_close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8765)
    serve(parser.parse_args().port)
