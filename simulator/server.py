"""Run with python3 -m simulator.server; open http://127.0.0.1:8765."""
import argparse
import atexit
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import threading
import time
import zlib
from urllib.parse import urlparse

from .engine import Simulation
from .happyrobot import HappyRobot, EDITOR


class Controller:
    def __init__(self):
        self.lock = threading.RLock()
        self.sim = Simulation()
        self.robot = HappyRobot()
        self.busy = False
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
        threading.Thread(target=self._clock, daemon=True).start()

    def snapshot(self):
        return zlib.compress(json.dumps(self.sim.state()).encode())

    def record(self):
        frame=self.snapshot()
        self.frames.append(frame)
        if self.recording:
            self.recorded_frames.append(frame)
            if len(self.recorded_frames)>=1500:self.recording=False
        if len(self.frames)>1500:
            self.frames.pop(0)

    def _clock(self):
        while not self.stop.wait(1/self.speed):
            with self.lock:
                if not self.running or self.busy or self.cursor is not None:
                    continue
                self.sim.step()
                if self.sim.phase != 'active':
                    self.auto = False
                if self.sim.phase == 'finished':
                    self.running = False
                self.record()
                if self.sim.phase == 'finished':
                    self.recording = False
                if self.auto and self.sim.called and (self.sim.pending_decision_event or self.sim.tick>=self.next_decision):
                    self.request_decision(self.sim.pending_decision_event or 'local_observation')

    def state(self):
        with self.lock:
            frame = self.sim.state() if self.cursor is None else json.loads(zlib.decompress(self.frames[self.cursor]))
            return dict(frame, busy=self.busy, auto=self.auto,running=self.running,speed=self.speed,
                        frame_index=len(self.frames)-1 if self.cursor is None else self.cursor,
                        recording=self.recording,recorded_frames=len(self.recorded_frames),
                        frame_count=len(self.frames),replay=self.cursor is not None,live_tick=self.sim.tick,
                        connected=self.robot.connected, error=self.error, workflow_url=EDITOR,
                        workflow_calls=self.calls, latency=self.latency, run_evidence=self.run_evidence)

    def request_decision(self, event='local_observation'):
        if self.sim.phase != 'active':
            raise ValueError('Fire is out; vehicles are returning or at station.')
        if self.busy:
            raise ValueError('A decision is already running.')
        if not self.sim.called:
            raise ValueError('Send the farmer report first.')
        if self.cursor is not None:
            raise ValueError('Return to Live before requesting decisions.')
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
                self.calls += 1
                self.latency = round(time.monotonic()-start, 1)
                self.run_evidence = evidence
                self.sim.apply(decision,payload['event_id'],payload['incident_id'],tick)
                self.next_decision = self.sim.tick + 16
                self.record()
        except Exception as exc:
            with self.lock:
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
                if retry:
                    self.request_decision('command_rejected')

    def action(self, action, data):
        with self.lock:
            if action == 'stop_recording':
                self.recording=False
                self.running=False
                return
            if action == 'pause':
                self.running = False
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
            if self.busy:
                raise ValueError('HappyRobot is deciding. You can pause or inspect the timeline.')
            if action == 'reset':
                self.cursor = None
                self.sim = Simulation()
                self.recording=False
                self.error = None
                self.auto = self.running = False
                self.calls = 0
                self.run_evidence = ''
                self.latency = None
                self.frames = [self.snapshot()]
                self.next_decision = 0
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
                self.reply(200, controller.state())
            elif path in {'/', '/app.js', '/style.css'}:
                name = 'index.html' if path == '/' else path[1:]
                types = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css'}
                file = static/name
                self.reply(200, file.read_bytes(), types[file.suffix])
            else:
                self.reply(404, {'error': 'Not found'})

        def do_POST(self):
            # Reject cross-origin requests to the local authenticated MCP bridge.
            allowed = {f'http://127.0.0.1:{port}', f'http://localhost:{port}'}
            if self.headers.get('Origin') not in allowed or self.headers.get('X-Simulator-Request') != '1':
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
    print('HappyRobot development workflow; farmer call is a simulated transcript.', flush=True)
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
