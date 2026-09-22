import json
import re
import time
import uuid
from urllib.parse import urlparse

from workers import DurableObject, Response, WorkerEntrypoint

from session import SimulatorSession as CoreSession

COOKIE='simulation_session'
SESSION_RE=re.compile(r'^[0-9a-f]{32}$')
SESSION_TTL_MS=7*24*60*60*1000
ACTION_FIELDS={
    'stop_recording':set(),'pause':set(),'reset':set(),'ignite':set(),'step':set(),'decision':set(),'auto':set(),'play':set(),'live':set(),
    'optimistic':{'enabled'},'fleet':{'count','counts'},'add_fire':{'x','y'},'place_fire':{'x','y'},
    'record_run':{'x','y'},'advance':{'steps'},'spread_factor':{'value'},'wind':{'direction','x','y'},
    'call':{'message'},'speed':{'speed'}}


def log_event(kind,**fields):
    print(json.dumps(dict(event=kind,**fields),ensure_ascii=False,separators=(',',':')))


def reply(value,status=200,session_id=None):
    headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}
    if session_id:headers['Set-Cookie']=f'{COOKIE}={session_id}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400'
    return Response(json.dumps(value,ensure_ascii=False,separators=(',',':')),status=status,headers=headers)


def session_cookie(request):
    values={}
    for item in (request.headers.get('Cookie') or '').split(';'):
        if '=' in item:
            key,value=item.strip().split('=',1);values[key]=value
    current=values.get(COOKIE,'')
    if SESSION_RE.fullmatch(current):return current,False
    return uuid.uuid4().hex,True


def same_origin(request):
    origin=request.headers.get('Origin') or ''
    url=urlparse(request.url)
    return origin==f'{url.scheme}://{url.netloc}'


def validate_action(data):
    if not isinstance(data,dict) or not isinstance(data.get('action'),str):raise ValueError('Expected an action object.')
    action=data['action'];allowed=ACTION_FIELDS.get(action)
    if allowed is None:raise ValueError('Unknown action.')
    unexpected=set(data)-allowed-{'action'}
    if unexpected:raise ValueError('Unexpected action fields: '+', '.join(sorted(unexpected)))
    return action


def trim_shared(doc):
    fields=('incident_id','sim_time','phase','updated_at','incident_danger_level','mission','wind','auto_public_message','public_message','last_dispatch')
    district_fields=('district_id','name','kind','population','status','burnt','danger_level','auto_danger_level','advice','auto_advice','evacuation_point','advice_updated_at')
    fire=doc.get('fire') or {}
    return dict({key:doc.get(key) for key in fields},
        fire=dict(confirmed=fire.get('confirmed'),burning_cells=fire.get('burning_cells'),front=fire.get('front'),report=fire.get('report'),detections=(fire.get('detections') or [])[-8:]),
        districts=[{key:item.get(key) for key in district_fields} for item in (doc.get('districts') or []) if isinstance(item,dict)],
        vehicles=doc.get('vehicles') or {},events=(doc.get('events') or [])[-12:],communications_sent=(doc.get('communications_sent') or [])[-20:])


class SimulationSession(DurableObject):
    def __init__(self,ctx,env):
        super().__init__(ctx,env)
        self.core=None

    async def load(self):
        if self.core is not None:return
        raw=await self.ctx.storage.get('checkpoint')
        self.core=CoreSession.restore(json.loads(raw)) if raw else CoreSession()

    async def save(self):
        await self.ctx.storage.put('checkpoint',json.dumps(self.core.checkpoint(),ensure_ascii=False,separators=(',',':')))
        await self.ctx.storage.setAlarm(int(time.time()*1000)+SESSION_TTL_MS)

    def state(self):
        return dict(self.core.public_state(),frame_index=0,frame_count=1,replay=False,
            live_tick=self.core.sim.tick,recorded_frames=0)

    async def get_state(self,now_ms):
        await self.load()
        if self.core.catch_up(now_ms):await self.save()
        return json.dumps(self.state(),ensure_ascii=False,separators=(',',':'))

    async def perform_action(self,action,data,now_ms):
        await self.load()
        if action=='seek':raise ValueError('Replay is client-side and cannot seek server state.')
        if action!='live':
            self.core.action(action,data,now_ms)
            await self.save()
        log_event('simulation_action',action=action,tick=self.core.sim.tick,status='ok')
        return json.dumps(self.state(),ensure_ascii=False,separators=(',',':'))

    async def shared(self):
        await self.load()
        value=dict(incident_id=self.core.sim.incident_id,
            status=dict(enabled=True,url=None,published=0,events_sent=len(self.core.sim.event_log),inbox_published=0,last_published=self.core.sim.tick,error=None),
            document=trim_shared(self.core.shared_state()),error=None,
            fetched_at=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()))
        return json.dumps(value,ensure_ascii=False,separators=(',',':'))

    async def recording(self):
        return json.dumps(dict(format='los-panaderos-recording-v1',frames=[]),separators=(',',':'))

    async def alarm(self,alarm_info=None):
        await self.ctx.storage.deleteAll();self.core=None
        log_event('session_expired')


class Default(WorkerEntrypoint):
    async def fetch(self,request):
        started=time.time();url=urlparse(request.url);path=url.path.rstrip('/') or '/'
        if path=='/api/health':return reply(dict(status='ok',service='los-panaderos',policy='deterministic'))
        if not path.startswith('/api/'):return reply(dict(error='Not found'),404)
        session_id,is_new=session_cookie(request);stub=self.env.SIMULATIONS.getByName(session_id)
        try:
            if request.method=='GET' and path=='/api/state':value=json.loads(await stub.get_state(int(time.time()*1000)))
            elif request.method=='GET' and path=='/api/shared':value=json.loads(await stub.shared())
            elif request.method=='GET' and path=='/api/recording':value=json.loads(await stub.recording())
            elif request.method=='GET' and path=='/api/config':value=dict(cesium_token=getattr(self.env,'PUBLIC_CESIUM_TOKEN',None),nasa_key=getattr(self.env,'PUBLIC_NASA_KEY',None))
            elif request.method=='POST' and path=='/api/action':
                if request.headers.get('X-Simulator-Request')!='1' or not same_origin(request):return reply(dict(error='Use the same-origin simulator interface.'),403)
                if not (request.headers.get('Content-Type') or '').lower().startswith('application/json'):return reply(dict(error='Content-Type must be application/json.'),415)
                raw=await request.text()
                if not 0<len(raw)<=8192:raise ValueError('Invalid request size.')
                data=json.loads(raw);action=validate_action(data)
                value=json.loads(await stub.perform_action(action,data,int(time.time()*1000)))
            else:return reply(dict(error='Not found'),404)
            log_event('http_request',method=request.method,path=path,status=200,duration_ms=round((time.time()-started)*1000,1))
            return reply(value,session_id=session_id if is_new else None)
        except (ValueError,TypeError,json.JSONDecodeError) as exc:
            log_event('http_request',method=request.method,path=path,status=400,error=type(exc).__name__)
            return reply(dict(error=str(exc)[:800]),400,session_id if is_new else None)
        except Exception as exc:
            log_event('http_request',method=request.method,path=path,status=500,error=type(exc).__name__)
            return reply(dict(error='Internal server error.'),500,session_id if is_new else None)
