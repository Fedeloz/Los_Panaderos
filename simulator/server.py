"""Run with python3 -m simulator.server; open http://127.0.0.1:8765."""
import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import threading
import zlib
from urllib.parse import urlparse

from .session import SimulatorSession
from .operational_state import build_state

def local_host(host_header):
    return (host_header or '').split(':')[0] in {'127.0.0.1','localhost'}


def action_origin_allowed(origin,host_header,port):
    if not origin:return False
    allowed={f'http://127.0.0.1:{port}',f'http://localhost:{port}'}
    public=os.environ.get('PUBLIC_ORIGIN','').strip().rstrip('/')
    if public:allowed.add(public)
    if origin in allowed:return True
    host=(host_header or '').split(',')[0].strip()
    return bool(host) and origin in {f'https://{host}',f'http://{host}'}


class Controller:
    SHARED_FIELDS=('incident_id','sim_time','phase','updated_at','incident_danger_level','mission','wind','auto_public_message','public_message','last_dispatch')
    SHARED_DISTRICT_FIELDS=('district_id','name','kind','population','status','burnt','danger_level','auto_danger_level','advice','auto_advice','evacuation_point','advice_updated_at')

    def __init__(self):
        self.lock=threading.RLock();self.session=SimulatorSession();self.stop=threading.Event()
        self._cache_key=None;self._cache_body=b'';self._cache_etag=''

    @property
    def sim(self):return self.session.sim

    @property
    def running(self):return self.session.running

    @running.setter
    def running(self,value):self.session.running=bool(value)

    @property
    def speed(self):return self.session.speed

    @speed.setter
    def speed(self,value):self.session.speed=int(value)

    def request_decision(self,event='local_observation'):
        with self.lock:return self.session.decide(event)

    def action(self,action,data):
        with self.lock:
            if action=='seek':raise ValueError('Replay is client-side and cannot seek server state.')
            if action=='live':return self.state()
            return self.session.action(action,data)

    def state(self):
        with self.lock:
            self.session.catch_up()
            return dict(self.session.public_state(),frame_index=0,frame_count=1,replay=False,
                live_tick=self.sim.tick,recorded_frames=0)

    def state_bytes(self):
        with self.lock:
            state=self.state();body=json.dumps(state).encode();key=zlib.crc32(body)
            if key!=self._cache_key:
                self._cache_key=key;self._cache_body=body
                self._cache_etag='"%08x-%d"'%(key,len(body))
            return self._cache_etag,self._cache_body

    @classmethod
    def trim_shared(cls,doc):
        if not isinstance(doc,dict):return None
        fire=doc.get('fire') or {}
        return dict({key:doc.get(key) for key in cls.SHARED_FIELDS},
            fire=dict(confirmed=fire.get('confirmed'),burning_cells=fire.get('burning_cells'),front=fire.get('front'),report=fire.get('report'),detections=(fire.get('detections') or [])[-8:]),
            districts=[{key:item.get(key) for key in cls.SHARED_DISTRICT_FIELDS} for item in (doc.get('districts') or []) if isinstance(item,dict)],
            vehicles=doc.get('vehicles') or {},events=(doc.get('events') or [])[-12:],communications_sent=(doc.get('communications_sent') or [])[-20:])

    def shared_snapshot(self):
        with self.lock:
            document=self.trim_shared(build_state(self.sim))
            return dict(incident_id=self.sim.incident_id,
                status=dict(enabled=True,url=None,published=0,events_sent=len(self.sim.event_log),inbox_published=0,last_published=self.sim.tick,error=None),
                document=document,error=None)


def serve(port=8765):
    controller=Controller();static=Path(__file__).parent/'static'
    pages={'/':'situacion.html','/situacion':'situacion.html','/incidente':'incidente.html','/incidente/brunete':'incidente.html','/medios':'medios.html','/archivo':'archivo.html','/favicon.ico':'favicon.png'}
    assets={'/app.js','/chrome.js','/situacion.js','/medios.js','/archivo.js','/mapa.js','/mapa.css','/observation-map.js','/vendor/bootstrap-icons.js','/style.css','/favicon.png','/cursors/flamethrower-hover.svg','/cursors/flamethrower-active.svg','/maps/brunete.jpg','/maps/brunete-illustrated.png','/maps/spain-location.svg'}

    class Handler(BaseHTTPRequestHandler):
        def reply(self,code,body,content_type='application/json'):
            if not isinstance(body,bytes):body=json.dumps(body).encode()
            self.send_response(code);self.send_header('Content-Type',content_type);self.send_header('Content-Length',str(len(body)))
            self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff');self.end_headers();self.wfile.write(body)

        def do_GET(self):
            path=urlparse(self.path).path
            if path=='/api/recording':self.reply(200,dict(format='los-panaderos-recording-v1',frames=[]))
            elif path=='/api/state':
                etag,body=controller.state_bytes()
                if self.headers.get('If-None-Match')==etag:
                    self.send_response(304);self.send_header('ETag',etag);self.send_header('Cache-Control','no-cache');self.end_headers();return
                self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(body)));self.send_header('ETag',etag);self.send_header('Cache-Control','no-cache');self.send_header('X-Content-Type-Options','nosniff');self.end_headers();self.wfile.write(body)
            elif path=='/api/shared':self.reply(200,controller.shared_snapshot())
            elif path=='/api/config':
                if not local_host(self.headers.get('Host')):self.reply(403,{'error':'Local config only.'});return
                self.reply(200,{})
            elif path in pages or path in assets:
                name=pages[path] if path in pages else path[1:]
                types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml'}
                file=static/name;self.reply(200,file.read_bytes(),types[file.suffix])
            else:self.reply(404,{'error':'Not found'})

        def do_POST(self):
            if self.headers.get('X-Simulator-Request')!='1' or not action_origin_allowed(self.headers.get('Origin'),self.headers.get('Host'),port):self.reply(403,{'error':'Use the local simulator interface.'});return
            if self.path!='/api/action':self.reply(404,{'error':'Not found'});return
            if not (self.headers.get('Content-Type') or '').lower().startswith('application/json'):self.reply(415,{'error':'Content-Type must be application/json.'});return
            try:
                length=int(self.headers.get('Content-Length','0'))
                if not 0<length<=8192:raise ValueError('Invalid request size.')
                data=json.loads(self.rfile.read(length))
                if not isinstance(data,dict):raise ValueError('Expected JSON object.')
                controller.action(data.get('action'),data);self.reply(200,controller.state())
            except (ValueError,TypeError,json.JSONDecodeError) as exc:self.reply(400,{'error':str(exc)})
            except Exception:self.reply(500,{'error':'Internal server error.'})

        def log_message(self,*_):pass

    server=ThreadingHTTPServer(('127.0.0.1',port),Handler)
    print(f'Los Panaderos: http://127.0.0.1:{port}',flush=True)
    print('Deterministic fleet policy; farmer call and communications are simulated.',flush=True)
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:controller.stop.set();server.server_close()


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=8765);serve(parser.parse_args().port)
