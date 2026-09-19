import copy
import json
import unittest
from simulator.engine import Simulation

class FleetTests(unittest.TestCase):
    def decision(self,s,orders):
        return dict(command='hold',target_x=s.base[0],target_y=s.base[1],reason='test',mission='test',scout_orders=orders)

    def test_count_validation_and_maximum_fleet(self):
        for n in (0,5,True,2.5):
            with self.assertRaises(ValueError):Simulation(drone_count=n)
        s=Simulation(drone_count=4)
        self.assertEqual(len(s.scouts),3)
        self.assertEqual({d['drone_id'] for d in s.scouts},{'scout-1','scout-2','scout-3'})

    def test_fleet_and_hidden_live_ignition(self):
        s=Simulation(drone_count=3);s.ignite();s.farmer_call()
        before=s.payload()['world_state'];s.add_fire(40,8)
        self.assertEqual(before,s.payload()['world_state'])
        self.assertEqual(len(json.loads(before)['fleet']),3)
        self.assertEqual(s.state()['drone_count'],3)
        with self.assertRaises(ValueError):s.configure_fleet(4)

    def test_scout_discovery_report_and_dedup(self):
        s=Simulation(drone_count=2);s.ignite();s.farmer_call();s.add_fire(40,8)
        s.scouts[0].update(x=40.,y=15.)
        s.update_scouts()
        self.assertEqual(s.pending_decision_event,'scout_fire_report')
        self.assertEqual(s.scout_reports[0]['location'],[40,8])
        self.assertTrue(any(c['x']==40 and c['y']==8 for c in s.observation))
        s.pending_decision_event=None;s.update_scouts()
        self.assertIsNone(s.pending_decision_event)
        self.assertEqual(len(s.scout_reports),1)
        self.assertEqual(s.suppressed,0)

    def test_orders_atomic_and_patrol_moves(self):
        s=Simulation(drone_count=2);s.ignite();s.farmer_call()
        d=self.decision(s,[dict(drone_id='scout-1',command='contain',waypoints=[[20,20]],reason='bad')])
        before=copy.deepcopy(s.truck)
        d.update(truck_command='attack_sector',truck_target_x=40,truck_target_y=20,truck_reason='test')
        with self.assertRaises(ValueError):s.apply(d,'bad',s.incident_id,s.tick)
        self.assertEqual(before,s.truck)
        d=self.decision(s,[dict(drone_id='scout-1',command='patrol',waypoints=[[20,20],[30,20]],reason='survey')])
        s.apply(d,'ok',s.incident_id,s.tick)
        start=(s.scouts[0]['x'],s.scouts[0]['y']);s.step()
        self.assertNotEqual(start,(s.scouts[0]['x'],s.scouts[0]['y']))
        self.assertEqual(s.scouts[0]['waypoints'],[[30,20]])
        self.assertEqual(s.suppressed,0)

    def test_exact_fleet_and_safety(self):
        s=Simulation(drone_count=2)
        for raw in [None,[],[dict(drone_id='unknown',command='hold',reason='test')]]:
            with self.assertRaises(ValueError):s.validate_scout_orders(raw)
        s.cells[20][20]['heat']=1;s.scouts[0].update(x=25.,y=20.);s.observe()
        with self.assertRaises(ValueError):s.validate_scout_orders([dict(drone_id='scout-1',command='patrol',waypoints=[[20,20]],reason='test')])

    def test_return_waits_for_scout(self):
        s=Simulation(drone_count=2);s.ignited=True;s.scouts[0].update(x=20.,y=20.)
        s.update_completion();self.assertEqual(s.phase,'returning')
        s.step(20);self.assertEqual(s.phase,'finished')

    def test_scout_warns_selected_district_and_people_reach_refuge(self):
        s=Simulation(drone_count=2);s.ignite();s.farmer_call()
        group=s.groups['farm'];scout=s.scouts[0];scout.update(x=float(group['home'][0]),y=float(group['home'][1]))
        order=dict(drone_id='scout-1',command='evacuate_farm',district_id='farm',waypoints=[],reason='Nearby scout warns farm')
        s.apply(self.decision(s,[order]),'warn',s.incident_id,s.tick)
        self.assertEqual(group['status'],'unwarned')
        self.assertEqual(scout['target'],group['home'])
        s.update_scouts()
        self.assertEqual(group['status'],'evacuating');self.assertEqual(scout['status'],'awaiting_assignment')
        self.assertEqual(s.pending_decision_event,'evacuation_warning_delivered')
        self.assertTrue(all(g['status']=='unwarned' for k,g in s.groups.items() if k!='farm'))
        s.set_wind('calm');s.step(30)
        self.assertEqual(group['status'],'safe')
        self.assertEqual(s.suppressed,0)

    def test_scout_district_validation_and_duplicate_assignment(self):
        s=Simulation(drone_count=3)
        def order(i,district):return dict(drone_id=f'scout-{i}',command='evacuate_town',district_id=district,reason='warn')
        for bad in (None,'missing','farm'):
            with self.assertRaises(ValueError):s.validate_scout_orders([order(1,bad),order(2,'town_north')])
        orders=[order(1,'town'),order(2,'town')]
        s.apply(self.decision(s,orders),'duplicate',s.incident_id,0)
        self.assertEqual(s.scouts[0]['mode'],'evacuate_town')
        self.assertEqual(s.scouts[1]['mode'],'hold')
        self.assertEqual(s.pending_decision_event,'coordination_conflict')
        orders=[order(1,'town'),dict(drone_id='scout-2',command='hold',reason='hold')]
        d=self.decision(s,orders);d.update(command='evacuate_town',district_id='town')
        d.update(target_x=s.groups['town']['home'][0],target_y=s.groups['town']['home'][1])
        s.apply(d,'duplicate2',s.incident_id,0)
        self.assertEqual(s.drone['mode'],'hold')
        self.assertEqual(s.scouts[0]['mode'],'evacuate_town')
        continued=self.decision(s,[dict(drone_id='scout-1',command='continue',reason='Finish warning'),dict(drone_id='scout-2',command='hold',reason='Wait')])
        continued.update(command='evacuate_town',district_id='town',target_x=s.groups['town']['home'][0],target_y=s.groups['town']['home'][1])
        s.apply(continued,'duplicate-continue',s.incident_id,0)
        self.assertEqual(s.drone['mode'],'hold')
        self.assertEqual(s.scouts[0]['mode'],'evacuate_town')
        self.assertTrue(s.last_result['coordination_adjustments'])
        s.groups['town']['status']='safe'
        with self.assertRaises(ValueError):s.validate_scout_orders(orders)

    def mixed_orders(self,s):
        return dict(mission='Separate tasks',reason='test',command='hold',target_x=0,target_y=0,
            scout_orders=[dict(drone_id=d['drone_id'],command='hold',reason='test') for d in s.scouts],
            extinguisher_orders=[dict(drone_id=d['drone_id'],command='scout',target_x=25+i*8,target_y=15,district_id='',reason='test') for i,d in enumerate(s.extinguishers)],
            truck_orders=[dict(truck_id=t['truck_id'],command='attack_sector',target_x=30+i*25,target_y=20,reason='test') for i,t in enumerate(s.trucks)])

    def test_independent_counts_and_movement(self):
        s=Simulation(fleet_counts=dict(scouts=2,extinguishers=2,trucks=2));s.ignite();s.farmer_call()
        s.apply(self.mixed_orders(s),'fleet',s.incident_id,s.tick);s.step(10)
        self.assertNotEqual(s.extinguishers[0]['x'],s.extinguishers[1]['x'])
        self.assertNotEqual(s.trucks[0]['crew_target'],s.trucks[1]['crew_target'])
        self.assertNotEqual(s.trucks[0]['x'],s.trucks[1]['x'])
        w=json.loads(s.payload()['world_state']);self.assertEqual(len(w['fleet']),4);self.assertEqual(len(w['fire_trucks']),2)

    def test_zero_roles_have_no_phantom_sensors_or_actions(self):
        s=Simulation(fleet_counts=dict(scouts=1,extinguishers=0,trucks=0))
        s.scouts[0].update(x=65.,y=10.);s.memory={};s.observe()
        self.assertNotIn(f'{s.base[0]},{s.base[1]}',s.memory)
        w=json.loads(s.payload()['world_state']);self.assertIsNone(w['fire_truck']);self.assertEqual(len(w['fleet']),1)
        self.assertIsNone(s.state()['drone']);self.assertIsNone(s.state()['truck'])
        s.ignite();s.farmer_call();s.apply(self.mixed_orders(s),'only-scout',s.incident_id,0);s.step(10)
        self.assertEqual(s.suppressed+s.crew_extinguished,0)

    def test_missing_or_invalid_extra_vehicle_is_atomic(self):
        s=Simulation(fleet_counts=dict(scouts=0,extinguishers=2,trucks=2))
        d=self.mixed_orders(s);d['truck_orders'][1]['target_x']=1000
        before=copy.deepcopy(s.vehicles())
        with self.assertRaises(ValueError):s.apply(d,'bad',s.incident_id,0)
        self.assertEqual(s.vehicles(),before)
        d=self.mixed_orders(s);d['extinguisher_orders'].pop()
        with self.assertRaises(ValueError):s.apply(d,'missing',s.incident_id,0)
        with self.assertRaises(ValueError):s.configure_fleet(scouts=0,extinguishers=0,trucks=0)

    def test_zero_drones_trucks_only(self):
        s=Simulation(fleet_counts=dict(scouts=0,extinguishers=0,trucks=2));s.ignite();s.farmer_call()
        s.apply(self.mixed_orders(s),'trucks',s.incident_id,0);s.step(9)
        self.assertTrue(all(t['x']!=s.base[0] or t['y']!=s.base[1] for t in s.trucks))
