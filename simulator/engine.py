"""Seeded stochastic, deliberately simplified wildfire demo; not a prediction model."""
from collections import deque
import copy
import json
import math
import random
import uuid


class Simulation:
    width, height = 80, 56
    base = (12, 44)
    town = (12, 44)
    farm = (65, 10)
    report = (65, 43)
    sensor_radius = 9
    rules = dict(ignition_probability_per_eligible_cell=0.5,
                 spread_attempts="One chance per eligible adjacent cell per step; failed attempts retry at wind-dependent intervals.",
                 drone_cells_per_step=3,
                 drone_extinguishes_per_step=1, satellite_delay_steps=12,
                 satellite_interval_steps=12, satellite_block_size=8,
                 truck_cells_per_step=2, truck_mobilization_steps=8,
                 firefighter_extinguishes_per_step=6, hose_range=8,
                 drone_standoff_cells=3, drone_suppression_range=6)

    def __init__(self, seed=9):
        self.incident_id = str(uuid.uuid4())
        self.rng = random.Random(seed)
        self.tick = 0
        self.wind = (1, 0)
        self.revision = 0
        self.cells = [[dict(fuel=1, heat=0, age=0) for x in range(self.width)] for y in range(self.height)]
        self.drone = dict(x=12., y=44., status='at_station', target=None, mode='hold')
        self.ignited = self.called = False
        self.call_text = ''
        self.history = []
        self.seen_commands = set()
        self.suppressed = 0
        self.last_result = None
        self.observation = []
        self.memory = {}
        self.satellite = None
        self.satellite_queue = []
        self.mission = 'Awaiting a report'
        self.truck = dict(x=12., y=44., status="at_station", target=None, route=[], mobilized_at=None, observed_fire=[])
        self.roads = {(x,42) for x in range(4,75)} | {(64,y) for y in range(4,50)} | {(12,y) for y in range(28,45)}
        self.crew_due = None
        self.crew_target = None
        self.crew_extinguished = 0
        self.groups = {
            'farm': dict(x=65., y=10., count=6, status='unwarned', refuge=[44, 4]),
            'town': dict(x=12., y=44., count=32, status='unwarned', refuge=[5, 28])}
        self.observe()

    def log(self, source, message, **extra):
        self.history.append(dict(tick=self.tick, source=source, message=message, **extra))
        self.history = self.history[-100:]

    @staticmethod
    def burning(cell):
        return cell['heat'] > 0 and cell['fuel'] > 0

    def place_fire(self,x,y):
        if self.ignited or self.called:raise ValueError('Reset before moving the ignition point.')
        if any(isinstance(v,bool) or not isinstance(v,int) for v in (x,y)) or not (1<=x<self.width-1 and 1<=y<self.height-1):
            raise ValueError('Select an interior map cell.')
        if math.hypot(x-self.base[0],y-self.base[1])<6:raise ValueError('Place the fire away from the station.')
        self.report=(x,y)

    def ignite(self):
        if not self.ignited:
            self.ignited = True
            for x,y in [self.report,(self.report[0],self.report[1]+1),(self.report[0]+1,self.report[1])]:
                self.cells[y][x]['heat'] = 1
            self.log('simulation', 'Fire ignited at the selected location. Ground truth only.')

    def farmer_call(self, message=''):
        if not self.ignited:
            raise ValueError('Start the fire first.')
        if self.called:
            raise ValueError('Farmer report already received; request a new decision instead.')
        self.called = True
        self.call_text = message or f'I am reporting a smoke column around grid {self.report}. Please investigate.'
        self.truck["mobilized_at"] = self.tick + 8
        self.truck["status"] = "mobilizing"
        self.crew_target = list(self.report)
        self.log('farmer', self.call_text)
        self.log('dispatch', 'Truck mobilizing for 8 steps, then travelling on roads at 2 cells/step. Drone scouts ahead.')

    def set_wind(self, name=None, x=None, y=None):
        if x is None and y is None:
            choices = {'east':(1,0), 'north':(0,-1), 'west':(-1,0), 'south':(0,1), 'calm':(0,0)}
            if name not in choices:raise ValueError('Invalid wind direction.')
            x,y=choices[name]
        if any(isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v) or abs(v)>3 for v in (x,y)):
            raise ValueError('Wind X and Y must be finite numbers between -3 and 3.')
        self.wind=(round(x,2),round(y,2))
        self.revision+=1
        self.log('weather',f'Wind vector updated: X={self.wind[0]}, Y={self.wind[1]} (east/south positive); strength {math.hypot(*self.wind):.2f}.')

    def spread_interval(self, dx, dy):
        projection=dx*self.wind[0]+dy*self.wind[1]
        return max(1,round(10/(1+4*projection))) if projection>=0 else round(10*(1-projection))

    def step(self, count=1):
        for _ in range(count):
            self.tick += 1
            ignitions = set()
            for y,row in enumerate(self.cells):
                for x,c in enumerate(row):
                    if not self.burning(c):
                        continue
                    c['age'] += 1
                    for dx,dy in [(1,0),(-1,0),(0,1),(0,-1)]:
                        interval = self.spread_interval(dx,dy)
                        nx,ny = x+dx,y+dy
                        if c['age'] % interval == 0 and 0<=nx<self.width and 0<=ny<self.height:
                            n = self.cells[ny][nx]
                            if n['fuel'] and not n['heat']:
                                ignitions.add((nx,ny))
                    if c['age'] >= 80:
                        c.update(fuel=0,heat=0)
            # Resolve once per destination, regardless of how many neighbors expose it.
            # Stable ordering makes seeded runs reproducible; new fire waits until next tick.
            for x,y in sorted(ignitions):
                if self.rng.random() < self.rules['ignition_probability_per_eligible_cell']:
                    self.cells[y][x]['heat'] = 1
            d = self.drone
            d['last_drop'] = None
            self.move_safely(d,3)
            self.observe()
            if d['mode'] == 'contain' and d['status'] != 'retreating':
                candidates = [c for c in self.observation if math.hypot(c['x']-d['x'],c['y']-d['y'])<=6]
                if candidates:
                    c = max(candidates,key=lambda c:c['x']*self.wind[0]+c['y']*self.wind[1])
                    self.cells[c['y']][c['x']].update(heat=0,fuel=0)
                    self.suppressed += 1
                    d['last_drop'] = [c['x'],c['y']]
            if d['target'] is None and d['mode'].startswith('evacuate_'):
                name = d['mode'].split('_',1)[1]
                group = self.groups[name]
                if group['status'] == 'unwarned':
                    group['status'] = 'evacuating'
                    self.log('drone', f'Loudspeaker warning delivered to {name}: {group["count"]} people moving to refuge.')
            for name,g in self.groups.items():
                if g['status'] in {'evacuating','blocked'}:
                    tx,ty = g['refuge']
                    dist = math.hypot(tx-g['x'],ty-g['y'])
                    nx,ny = (float(tx),float(ty)) if dist<=.8 else (g['x']+.8*(tx-g['x'])/dist,g['y']+.8*(ty-g['y'])/dist)
                    if any(self.burning(self.cells[y][x]) for y in range(max(0,round(ny)-1),min(self.height,round(ny)+2)) for x in range(max(0,round(nx)-1),min(self.width,round(nx)+2))):
                        if g['status'] != 'blocked':
                            self.log('people', f'{name} evacuation route blocked by fire; ground assistance needed.')
                        g['status'] = 'blocked'
                    else:
                        g.update(x=nx,y=ny,status='safe' if dist<=.8 else 'evacuating')
                        if g['status']=='safe':
                            self.log('people', f'{name}: {g["count"]} people reached refuge.')
            self.update_truck()
            self.observe()
            if self.tick % 12 == 0:
                blocks = sorted({(x//8*8,y//8*8) for y,row in enumerate(self.cells) for x,c in enumerate(row) if self.burning(c)})
                self.satellite_queue.append(dict(captured_at=self.tick,available_at=self.tick+12,blocks=blocks))
            while self.satellite_queue and self.satellite_queue[0]['available_at']<=self.tick:
                self.satellite = self.satellite_queue.pop(0)

    def fire_points(self):
        return [(x,y) for y,row in enumerate(self.cells) for x,c in enumerate(row) if self.burning(c)]

    def danger_zone(self, points, clearance=3):
        return {(x+dx,y+dy) for x,y in points for dx in range(-clearance,clearance+1)
                for dy in range(-clearance,clearance+1) if dx*dx+dy*dy<clearance*clearance}

    def route(self, start, goal, blocked, roads=None):
        start=tuple(map(round,start));goal=tuple(map(round,goal))
        if goal in blocked:return []
        q=deque([start]);parents={start:None}
        while q:
            point=q.popleft()
            if point==goal:
                path=[]
                while parents[point] is not None:path.append(list(point));point=parents[point]
                return path[::-1]
            for dx,dy in [(1,0),(-1,0),(0,1),(0,-1)]:
                p=(point[0]+dx,point[1]+dy)
                if p not in parents and p not in blocked and 0<=p[0]<self.width and 0<=p[1]<self.height and (roads is None or p in roads):
                    parents[p]=point;q.append(p)
        return []

    def move_safely(self, vehicle, speed, roads=None):
        # Local collision avoidance is a physical safeguard, not a strategic AI substitute.
        local=[p for p in self.fire_points() if math.hypot(p[0]-vehicle['x'],p[1]-vehicle['y'])<=9]
        blocked=self.danger_zone(local)
        here=(round(vehicle['x']),round(vehicle['y']))
        if here in blocked:
            options=[]
            for dx in range(-speed,speed+1):
                for dy in range(-speed,speed+1):
                    p=(here[0]+dx,here[1]+dy)
                    if abs(dx)+abs(dy)<=speed and p not in blocked and 0<=p[0]<self.width and 0<=p[1]<self.height and (roads is None or p in roads):
                        path=self.route(here,p,set(local),roads)
                        if len(path)<=speed and path:options.append((len(path),p,path))
            if options:
                _,p,path=min(options);vehicle.update(x=float(p[0]),y=float(p[1]),route=path,status='retreating')
            else:vehicle.update(status='trapped',route=[])
            return
        target=vehicle.get('target')
        if target is None:return
        path=self.route(here,target,blocked,roads)
        vehicle['route']=path
        if not path and here!=tuple(target):
            vehicle['status']='blocked';return
        if path:
            x,y=path[min(speed,len(path))-1];vehicle.update(x=float(x),y=float(y),route=path[speed:])
        if (vehicle['x'],vehicle['y'])==tuple(target):
            vehicle.update(target=None,status=vehicle.get('mode','on_scene'),route=[])
        else:vehicle['status']='en_route'

    def safe_drone_positions(self):
        blocked=self.danger_zone([(c['x'],c['y']) for c in self.observation])
        candidates=[]
        for c in self.memory.values():
            p=(c['x'],c['y'])
            if c['observed_at']==self.tick and not c['burning'] and p not in blocked:
                fires=sum(math.hypot(f['x']-p[0],f['y']-p[1])<=6 for f in self.observation)
                if fires:candidates.append(( -fires,math.hypot(p[0]-self.drone['x'],p[1]-self.drone['y']),p))
        return [dict(x=p[0],y=p[1]) for _,__,p in sorted(candidates)[:12]]

    def update_truck(self):
        t=self.truck
        t['last_drops']=[]
        t['observed_fire']=[dict(x=x,y=y) for x,y in self.fire_points() if math.hypot(x-t['x'],y-t['y'])<=10]
        if t['mobilized_at'] is None or self.tick<t['mobilized_at']:return
        if t['observed_fire']:
            goal=min(t['observed_fire'],key=lambda c:math.hypot(c['x']-t['x'],c['y']-t['y']))
            self.crew_target=[goal['x'],goal['y']]
        if self.crew_target:
            blocked=self.danger_zone([(c['x'],c['y']) for c in t['observed_fire']])
            options=sorted((math.hypot(x-self.crew_target[0],y-self.crew_target[1]),abs(x-t['x'])+abs(y-t['y']),(x,y)) for x,y in self.roads if (x,y) not in blocked)
            for _,__,p in options:
                if (t['x'],t['y'])==p or self.route((t['x'],t['y']),p,blocked,self.roads):
                    t['target']=list(p);break
        self.move_safely(t,self.rules['truck_cells_per_step'],self.roads)
        local=[(x,y) for x,y in self.fire_points() if math.hypot(x-t['x'],y-t['y'])<=8]
        if local and t['status']!='trapped':
            for x,y in sorted(local,key=lambda p:math.hypot(p[0]-t['x'],p[1]-t['y']))[:6]:
                self.cells[y][x].update(heat=0,fuel=0);self.crew_extinguished+=1
                t['last_drops'].append([x,y])
            t['status']='suppressing'
        distance=len(self.route((t['x'],t['y']),t['target'],set(),self.roads)) if t['target'] else 0
        self.crew_due=self.tick+math.ceil(distance/self.rules['truck_cells_per_step']) if t['status'] not in {'blocked','trapped'} else None
        t['observed_fire']=[dict(x=x,y=y) for x,y in self.fire_points() if math.hypot(x-t['x'],y-t['y'])<=10]

    def truck_telemetry(self):
        return dict(self.truck,truck_id='engine-1',speed=self.rules['truck_cells_per_step'],hose_range=8,extinguishes_per_step=6,
                    position_reported_at=self.tick,arrival_estimate_steps=max(0,self.crew_due-self.tick) if self.crew_due else None)

    def observe(self):
        d = self.drone
        self.observation = []
        for y in range(max(0,int(d['y'])-9),min(self.height,int(d['y'])+10)):
            for x in range(max(0,int(d['x'])-9),min(self.width,int(d['x'])+10)):
                if math.hypot(x-d['x'],y-d['y'])<=self.sensor_radius:
                    fire = self.burning(self.cells[y][x])
                    self.memory[f'{x},{y}'] = dict(x=x,y=y,burning=fire,observed_at=self.tick)
                    if fire:
                        self.observation.append(dict(x=x,y=y))
        if self.observation:
            self.crew_target = [self.observation[0]['x'],self.observation[0]['y']]
        return self.observation

    def telemetry(self):
        return dict(self.drone,drone_id='drone-1',sensor_radius=9,standoff_cells=3,suppression_range=6,safe_containment_positions=self.safe_drone_positions(),capabilities=['scout','contain','evacuate_farm','evacuate_town'])

    def payload(self, event_type='local_observation'):
        self.observe()
        known = dict(width=self.width,height=self.height,wind=dict(dx=self.wind[0],dy=self.wind[1],strength=round(math.hypot(*self.wind),2),units="relative simulation strength",convention="positive X east, positive Y south; vector points TO spread",spread_steps={name:self.spread_interval(dx,dy) for name,dx,dy in [("east",1,0),("west",-1,0),("north",0,-1),("south",0,1)]}),
            forecast=dict(issued_at=self.tick,description='Synthetic forecast; arbitrary X/Y vector points TO destination, including diagonal and calm wind. wind.spread_steps gives directional ignition ATTEMPT intervals, not guaranteed propagation times. Each eligible adjacent cell has a 50% ignition chance per attempt; stronger downwind wind shortens the interval, while upwind spread is slower. Failed attempts retry; predict uncertain fire arrival, not exact fronts. Assess settlement alignment with the full vector, not just named cardinal presets.'),
            farmer_report_location=dict(x=self.report[0],y=self.report[1]) if self.called else None,
            scenario_instructions="The ignition point is user-selected. Ignore fixed-coordinate examples. Assess life risk from farmer_report_location and forecast BEFORE scouting. Strong wind (magnitude >=2 in demo units) toward unwarned residents warrants precautionary evacuation without waiting for thermal confirmation. Otherwise scout from safe stand-off.",
            farm=dict(x=65,y=10),town=dict(x=12,y=44),station=dict(x=12,y=44),
            satellite=self.satellite,rules=self.rules,people=self.groups,fire_truck=self.truck_telemetry(),
            firefighters_eta=max(0,self.crew_due-self.tick) if self.crew_due else None,
            mission=self.mission,last_action_result=self.last_result,
            memory=[e for e in self.history if e['source']!='simulation'][-8:])
        return dict(event_id=str(uuid.uuid4()),event_type=event_type,incident_id=self.incident_id,sim_time=str(self.tick),
            world_state=json.dumps(known),drone_telemetry=json.dumps(self.telemetry()),
            thermal_detections=json.dumps(dict(observed_at=self.tick,burning_cells=self.observation,
                coverage='Only radius 9 around drone. Empty is not global containment.')),
            human_messages=self.call_text)

    def apply(self, decision, command_id, incident_id, expected_tick):
        if incident_id!=self.incident_id or expected_tick!=self.tick:
            raise ValueError('Stale decision: request a new decision.')
        if command_id in self.seen_commands:
            raise ValueError('Duplicate command rejected.')
        command = decision.get('command')
        if command not in {'scout','contain','evacuate_farm','evacuate_town','hold'}:
            raise ValueError('Unsupported drone command.')
        x,y = decision.get('target_x'),decision.get('target_y')
        if any(isinstance(v,bool) or not isinstance(v,(float,int)) or not math.isfinite(v) or int(v)!=v for v in (x,y)):
            raise ValueError('Target must use integer grid coordinates.')
        x,y = int(x),int(y)
        if not (0<=x<self.width and 0<=y<self.height):
            raise ValueError('Target outside map.')
        self.observe()
        if command=='contain' and (x,y) not in {(c['x'],c['y']) for c in self.safe_drone_positions()}:
            raise ValueError('Containment position unsafe or ineffective. Choose exact coordinates from drone_telemetry.safe_containment_positions; these are flight positions, NOT burning targets.')
        if command in {'scout','contain'} and (x,y) in self.danger_zone([(c['x'],c['y']) for c in self.observation]):
            raise ValueError('Flight target violates the 3-cell fire stand-off. Scout from outside the burning area.')
        if command.startswith('evacuate_'):
            x,y = self.farm if command=='evacuate_farm' else self.town
        self.seen_commands.add(command_id)
        self.mission = str(decision.get('mission',''))[:500]
        self.drone.update(mode=command,target=None if command=='hold' else [x,y],status='holding' if command=='hold' else 'en_route',sector=[x,y])
        self.last_result = dict(command=command,target=[x,y],accepted_at=self.tick,command_id=command_id)
        self.log('central',self.mission)
        self.log('edge',str(decision.get('reason',''))[:1000],decision=decision)
        return self.last_result

    def state(self):
        burning = sum(self.burning(c) for row in self.cells for c in row)
        return copy.deepcopy(dict(incident_id=self.incident_id,tick=self.tick,width=self.width,height=self.height,
            cells=self.cells,drone=self.telemetry(),wind=self.wind,base=self.base,town=self.town,farm=self.farm,
            ignition_point=self.report,report=self.report if self.called else None,ignited=self.ignited,called=self.called,mission=self.mission,
            observation=self.observation,observed_cells=list(self.memory.values()),satellite=self.satellite,
            history=self.history,burning=burning,burned=sum(c['fuel']==0 for row in self.cells for c in row),
            extinguished=self.suppressed,contained=self.ignited and burning==0,people=self.groups,
            truck=self.truck_telemetry(),roads=sorted(self.roads),crew_due=self.crew_due,crew_target=self.crew_target,crew_extinguished=self.crew_extinguished,rules=self.rules))
