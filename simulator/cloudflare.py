import json
import re
import time
import uuid
import zlib
from urllib.parse import urlparse

from workers import DurableObject, Response, WorkerEntrypoint

from session import SimulatorSession as CoreSession

COOKIE='simulation_session'
SESSION_RE=re.compile(r'^[0-9a-f]{32}$')
SESSION_TTL_MS=7*24*60*60*1000
PAGES={'/':'situacion.html','/situacion':'situacion.html','/incidente':'incidente.html',
       '/incidente/brunete':'incidente.html','/medios':'medios.html','/archivo':'archivo.html',
       '/favicon.ico':'favicon.png'}


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
        self.core=None;self.frames=[];self.cursor=None;self.recorded=[]

    async def load(self):
        if self.core is not None:return
        raw=await self.ctx.storage.get('checkpoint')
        self.core=CoreSession.restore(json.loads(raw)) if raw else CoreSession()
        self.frames=[self.snapshot()]

    async def save(self):
        await self.ctx.storage.put('checkpoint',json.dumps(self.core.checkpoint(),ensure_ascii=False,separators=(',',':')))
        await self.ctx.storage.setAlarm(int(time.time()*1000)+SESSION_TTL_MS)

    def state(self):
        if self.cursor is None:
            state=self.core.public_state();index=len(self.frames)-1
        else:
            state=dict(json.loads(zlib.decompress(self.frames[self.cursor])),busy=False,auto=False,running=False,speed=self.core.speed,error=self.core.error,
                connected=True,workflow_url=None,workflow_calls=self.core.decisions,latency=0,run_evidence='',timings={},
                optimistic=False,state_store=dict(enabled=False,url=None,published=0,events_sent=0,inbox_published=0,last_published=None,error=None),
                policy_mode='deterministic',dispatcher_loop=False)
            index=self.cursor
        return dict(state,frame_index=index,frame_count=len(self.frames),replay=self.cursor is not None,
            live_tick=self.core.sim.tick,recording=self.core.recording,recorded_frames=len(self.recorded))

    def snapshot(self):
        return zlib.compress(json.dumps(self.core.sim.state(),ensure_ascii=False,separators=(',',':')).encode())

    def record(self):
        frame=self.snapshot();self.frames=(self.frames+[frame])[-150:]
        if self.core.recording:self.recorded=(self.recorded+[frame])[-60:]

    async def get_state(self,now_ms):
        await self.load()
        if self.cursor is None and self.core.catch_up(now_ms):
            self.record();await self.save()
        return json.dumps(self.state(),ensure_ascii=False,separators=(',',':'))

    async def perform_action(self,action,data,now_ms):
        await self.load()
        if action=='seek':
            index=int(data.get('index',0))
            if not 0<=index<len(self.frames):raise ValueError('Frame outside replay.')
            self.core.running=False;self.cursor=index
        elif action=='live':self.cursor=None
        else:
            if self.cursor is not None and action!='reset':raise ValueError('Return to Live to change the simulation.')
            self.core.action(action,data,now_ms);self.cursor=None
            if action=='reset':self.frames=[self.snapshot()];self.recorded=[]
            else:self.record()
            await self.save()
        return json.dumps(self.state(),ensure_ascii=False,separators=(',',':'))

    async def shared(self):
        await self.load()
        value=dict(incident_id=self.core.sim.incident_id,
            status=dict(enabled=True,url=None,published=0,events_sent=len(self.core.sim.event_log),inbox_published=0,last_published=self.core.sim.tick,error=None),
            document=trim_shared(self.core.shared_state()),error=None,
            fetched_at=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()))
        return json.dumps(value,ensure_ascii=False,separators=(',',':'))

    async def recording(self):
        await self.load()
        frames=[json.loads(zlib.decompress(frame)) for frame in self.recorded]
        return json.dumps(dict(format='los-panaderos-recording-v1',frames=frames),ensure_ascii=False,separators=(',',':'))

    async def alarm(self,alarm_info=None):
        await self.ctx.storage.deleteAll()
        self.core=None;self.frames=[];self.recorded=[];self.cursor=None


class Default(WorkerEntrypoint):
    async def fetch(self,request):
        url=urlparse(request.url);path=url.path.rstrip('/') or '/'
        if path=='/api/health':return reply(dict(status='ok',service='los-panaderos',policy='deterministic'))
        if path in PAGES:return await self.env.ASSETS.fetch(f'https://assets.local/{PAGES[path]}')
        if not path.startswith('/api/'):return Response('Not found',status=404)
        session_id,is_new=session_cookie(request);stub=self.env.SIMULATIONS.getByName(session_id)
        try:
            if request.method=='GET' and path=='/api/state':value=json.loads(await stub.get_state(int(time.time()*1000)))
            elif request.method=='GET' and path=='/api/shared':value=json.loads(await stub.shared())
            elif request.method=='GET' and path=='/api/recording':value=json.loads(await stub.recording())
            elif request.method=='GET' and path=='/api/config':value=dict(cesium_token=getattr(self.env,'PUBLIC_CESIUM_TOKEN',None),nasa_key=getattr(self.env,'PUBLIC_NASA_KEY',None))
            elif request.method=='POST' and path=='/api/action':
                if request.headers.get('X-Simulator-Request')!='1' or not same_origin(request):return reply(dict(error='Use the same-origin simulator interface.'),403)
                raw=await request.text()
                if not 0<len(raw)<=8192:raise ValueError('Invalid request size.')
                data=json.loads(raw)
                if not isinstance(data,dict) or not isinstance(data.get('action'),str):raise ValueError('Expected an action object.')
                value=json.loads(await stub.perform_action(data['action'],data,int(time.time()*1000)))
            else:return reply(dict(error='Not found'),404)
            return reply(value,session_id=session_id if is_new else None)
        except (ValueError,TypeError,json.JSONDecodeError) as exc:
            return reply(dict(error=str(exc)[:800]),400,session_id if is_new else None)
