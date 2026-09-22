"""Thread-independent simulator session for local and Cloudflare runtimes."""
import copy
import json
import time

try:
    from .engine import Simulation
    from .policy import DeterministicFleetPolicy
    from .state_store import build_state
except ImportError:
    from engine import Simulation
    from policy import DeterministicFleetPolicy
    from state_store import build_state


class SimulatorSession:
    version=1
    max_catch_up_steps=32

    def __init__(self,sim=None,policy=None,now_ms=None):
        self.sim=sim or Simulation(drone_count=2)
        self.policy=policy or DeterministicFleetPolicy()
        self.auto=False
        self.running=False
        self.speed=2
        self.error=None
        self.decisions=0
        self.next_decision=0
        self.recording=False
        self.optimistic=False
        self.updated_at_ms=self.now_ms() if now_ms is None else int(now_ms)
        self.last_decision=None

    @staticmethod
    def now_ms():return int(time.time()*1000)

    def public_state(self):
        return dict(self.sim.state(),pending_fires=0,reset_pending=False,busy=False,auto=self.auto,
            running=self.running,speed=self.speed,recording=self.recording,recorded_frames=0,
            replay=False,live_tick=self.sim.tick,connected=True,error=self.error,workflow_url=None,
            workflow_calls=self.decisions,latency=0,run_evidence=json.dumps(self.last_decision,ensure_ascii=False,indent=2) if self.last_decision else '',
            timings={},optimistic=self.optimistic,state_store=dict(enabled=False,url=None,published=0,events_sent=0,inbox_published=0,last_published=None,error=None),
            policy_mode='deterministic',dispatcher_loop=False)

    def shared_state(self):return build_state(self.sim)

    def checkpoint(self):
        return dict(version=self.version,simulation=self.sim.checkpoint(),auto=self.auto,running=self.running,
            speed=self.speed,error=self.error,decisions=self.decisions,next_decision=self.next_decision,
            recording=self.recording,optimistic=self.optimistic,updated_at_ms=self.updated_at_ms,
            last_decision=copy.deepcopy(self.last_decision))

    @classmethod
    def restore(cls,value,policy=None):
        if not isinstance(value,dict) or value.get('version')!=cls.version:raise ValueError('Unsupported session checkpoint version.')
        session=cls(Simulation.restore(value.get('simulation')),policy,value.get('updated_at_ms',0))
        session.auto=bool(value.get('auto'));session.running=bool(value.get('running'))
        session.speed=int(value.get('speed',2))
        if session.speed not in {1,2,4,8}:raise ValueError('Invalid checkpoint speed.')
        session.error=value.get('error');session.decisions=int(value.get('decisions',0))
        session.next_decision=int(value.get('next_decision',0));session.recording=bool(value.get('recording'))
        session.optimistic=bool(value.get('optimistic'));session.last_decision=copy.deepcopy(value.get('last_decision'))
        return session

    def decision_due(self):
        event=self.sim.pending_decision_event
        urgent=event in {'scout_fire_confirmation','scout_fire_report'}
        return self.sim.tick>=self.next_decision or bool(event and (urgent or self.sim.tick>=self.next_decision-8))

    def decide(self,event='local_observation'):
        if self.sim.phase!='active':raise ValueError('Fire is out; vehicles are returning or at station.')
        if not self.sim.called:raise ValueError('Send the farmer report first.')
        payload=self.sim.payload(event)
        decision=self.policy.decide(self.sim)
        self.sim.apply(decision,payload['event_id'],payload['incident_id'],self.sim.tick)
        self.sim.record_dispatch(dict(decision='deterministic_fleet_policy',justificacion=decision['reason'],criticidad='rule-based',avisos_lanzados=[],destinatarios=[]))
        self.sim.pending_decision_event=None
        self.decisions+=1;self.next_decision=self.sim.tick+16;self.last_decision=copy.deepcopy(decision);self.error=None
        return decision

    def step_once(self):
        self.sim.step()
        if self.sim.phase!='active':self.auto=False
        if self.sim.phase=='finished':self.running=False
        if self.auto and self.sim.called and self.sim.phase=='active' and self.decision_due():
            self.decide(self.sim.pending_decision_event or 'local_observation')

    def catch_up(self,now_ms=None):
        now=self.now_ms() if now_ms is None else int(now_ms)
        elapsed=max(0,now-self.updated_at_ms);self.updated_at_ms=now
        if not self.running:return 0
        steps=min(self.max_catch_up_steps,int(elapsed*self.speed/1000))
        for _ in range(steps):
            self.step_once()
            if not self.running:break
        return steps

    def action(self,action,data=None,now_ms=None):
        data=data or {};now=self.now_ms() if now_ms is None else int(now_ms);self.catch_up(now)
        if action=='stop_recording':self.recording=False;self.running=False
        elif action=='pause':self.running=False
        elif action=='optimistic':self.optimistic=bool(data.get('enabled'))
        elif action=='reset':
            counts=self.sim.fleet_counts();self.__init__(Simulation(fleet_counts=counts),self.policy,now)
        elif action=='fleet':self.sim.configure_fleet(data.get('count'),**data.get('counts',{}));self.sim.observe()
        elif action=='add_fire':self.sim.add_fire(data.get('x'),data.get('y'))
        elif action=='place_fire':self.sim.place_fire(data.get('x'),data.get('y'))
        elif action=='record_run':
            if 'x' in data or 'y' in data:self.sim.set_wind(x=data.get('x'),y=data.get('y'))
            self.recording=True;self.sim.ignite()
            if not self.sim.called:self.sim.farmer_call()
            self.running=self.auto=True;self.decide('farmer_call' if self.decisions==0 else 'local_observation')
        elif action=='ignite':self.sim.ignite()
        elif action in {'step','advance'}:
            count=1 if action=='step' else int(data.get('steps',1))
            if not 1<=count<=self.max_catch_up_steps:raise ValueError('Invalid advance step count.')
            for _ in range(count):self.step_once()
        elif action=='spread_factor':
            self.sim.set_spread_factor(data.get('value'))
            if self.sim.called:self.decide('forecast_update')
        elif action=='wind':
            self.sim.set_wind(data.get('direction','east'),data.get('x'),data.get('y'))
            if self.sim.called:self.decide('forecast_update')
        elif action=='call':
            self.sim.farmer_call(str(data.get('message',''))[:2000].strip());self.auto=self.running=True;self.decide('farmer_call')
        elif action in {'decision','auto'}:
            self.auto=action=='auto';self.running=self.auto;self.decide()
        elif action=='play':self.running=True
        elif action=='speed':
            speed=int(data.get('speed',2))
            if speed not in {1,2,4,8}:raise ValueError('Invalid playback speed.')
            self.speed=speed
        else:raise ValueError('Unknown action.')
        self.updated_at_ms=now
        return self.public_state()
