import copy
import json
import math
import unittest
import threading
import time
from unittest.mock import patch
from tempfile import TemporaryDirectory
from pathlib import Path

from simulator.engine import Simulation
from simulator.happyrobot import HappyRobot


def command(action='contain', x=65, y=43):
    return dict(command=action, target_x=x, target_y=y, reason='Test decision', mission='Contain',district_id='farm' if action=='evacuate_farm' else 'town' if action=='evacuate_town' else '')


class PhysicsTests(unittest.TestCase):
    def test_intense_fire_requires_repeated_cooling_and_preserves_fuel(self):
        s=Simulation();c=s.cells[20][30];c['heat']=1.
        with patch.object(s.suppression_rng,'random',return_value=0):
            hits=[s.suppress([(30,20)],1,.4)[0] for _ in range(5)]
        self.assertEqual([a['extinguished'] for a in hits],[False,False,False,False,True])
        self.assertEqual(c['heat'],0)
        self.assertEqual(c['fuel'],1)
        self.assertEqual(c['wet'],8)

    def test_wet_fire_does_not_regrow_and_dried_fuel_can_reignite(self):
        s=Simulation();s.set_wind('east');s.set_spread_factor(4)
        source=s.cells[20][30];target=s.cells[20][31]
        source['heat']=1;target.update(heat=.1,wet=0)
        with patch.object(s.suppression_rng,'random',return_value=0):s.suppress([(31,20)],1,.4)
        with patch.object(s.rng,'random',return_value=0):
            s.step(7);self.assertEqual(target['heat'],0)
            s.step(2);self.assertGreater(target['heat'],0)

    def test_noncombustible_cells_block_surface_fire(self):
        s=Simulation();s.set_spread_factor(4)
        for row in s.cells:
            for c in row:c.update(fuel=0,heat=0,terrain='road')
        s.cells[20][20].update(fuel=1,heat=1,terrain='field')
        s.cells[21][21].update(fuel=1,heat=0,terrain='field')
        with patch.object(s.rng,'random',return_value=0):s.step(8)
        self.assertEqual(s.cells[21][21]['heat'],0) # Cannot cut a blocked corner.
        self.assertEqual(s.cells[20][21]['heat'],0)
        with self.assertRaises(ValueError):s.place_fire(30,30)

    def test_woodland_consumes_fuel_slower_than_fields(self):
        s=Simulation();field=s.cells[20][30];wood=s.cells[20][31]
        field.update(terrain='field',heat=1);wood.update(terrain='woodland',heat=1)
        with patch.object(s.rng,'random',return_value=1):s.step(10)
        self.assertGreater(wood['fuel'],field['fuel'])
        self.assertGreater(field['burned'],wood['burned'])

    def test_agent_intensity_details_exclude_hidden_fire(self):
        s=Simulation();s.cells[38][13].update(fuel=1,heat=.7,terrain='scrub')
        s.cells[2][75].update(fuel=1,heat=.9)
        w=json.loads(s.payload()['world_state']);details=w['observed_fire_details']
        seen=next(c for c in details if (c['x'],c['y'])==(13,38))
        self.assertEqual(seen['intensity'],.7)
        self.assertEqual(seen['terrain'],'scrub')
        self.assertFalse(any((c['x'],c['y'])==(75,2) for c in details))
        self.assertEqual(len(w['terrain_map']['rows']),56)

    def test_illustrated_geography_matches_agents_and_grid(self):
        s=Simulation();world=json.loads(s.payload()['world_state'])
        self.assertEqual(s.farm,(73,21))
        self.assertEqual(s.base,(12,32))
        self.assertEqual(world['farm'],dict(x=73,y=21))
        self.assertEqual(world['station'],dict(x=12,y=32))
        self.assertEqual((s.truck['x'],s.truck['y']),s.base)
        self.assertEqual((s.drone['x'],s.drone['y']),s.base)
        self.assertEqual((s.groups['farm']['x'],s.groups['farm']['y']),s.farm)
        self.assertEqual(s.state()['geography']['id'],'brunete-illustrated-v1')
        self.assertNotIn('bounds_3857',s.state()['geography'])
        self.assertTrue(all(0<=x<80 and 0<=y<56 for x,y in s.roads))
        self.assertIn(s.base,s.roads)
        self.assertIn(s.farm,s.roads)

    def test_spread_factor_scales_intervals_and_context(self):
        s=Simulation();s.set_wind('calm')
        self.assertEqual(s.spread_interval(1,0),20)
        s.set_spread_factor(2)
        self.assertEqual(s.spread_interval(1,0),5)
        s.set_spread_factor(0.5)
        self.assertEqual(s.spread_interval(1,0),20)
        self.assertEqual(s.state()['rules']['spread_factor'],0.5)
        self.assertEqual(json.loads(s.payload()['world_state'])['rules']['spread_factor'],0.5)
        s.set_wind('east');s.set_spread_factor(4)
        self.assertEqual(s.spread_interval(1,0),1)
        for invalid in [0,5,True,None,'2',float('nan'),float('inf')]:
            with self.assertRaises(ValueError):s.set_spread_factor(invalid)
        self.assertEqual(Simulation().rules['spread_factor'],0.5)

    @patch("random.Random.random", return_value=0.0)
    def test_spread_factor_changes_actual_ignition_time(self, _random):
        for factor,steps in [(0.5,20),(2,5)]:
            s=Simulation();s.set_wind('calm');s.set_spread_factor(factor)
            s.cells[20][20]['heat']=1
            s.step(steps-1)
            self.assertFalse(s.burning(s.cells[20][21]))
            s.step()
            self.assertTrue(s.burning(s.cells[20][21]))

    def test_selected_fire_location_updates_report_and_payload(self):
        s=Simulation();s.place_fire(35,20);s.ignite();s.farmer_call()
        self.assertTrue(s.burning(s.cells[20][35]))
        self.assertFalse(s.burning(s.cells[43][65]))
        self.assertIn('(35, 20)',s.call_text)
        self.assertEqual(json.loads(s.payload()['world_state'])['farmer_report_location'],dict(x=35,y=20))
        with self.assertRaises(ValueError):s.place_fire(20,20)

    @patch("random.Random.random", return_value=0.0)
    def test_fire_attempts_at_advertised_interval(self, _random):
        s=Simulation();s.set_spread_factor(1);s.place_fire(65,43);s.ignite();s.step(1)
        self.assertFalse(s.burning(s.cells[43][67]))
        s.step();self.assertTrue(s.burning(s.cells[43][67]))
        self.assertFalse(s.burning(s.cells[42][65]))

    def test_failed_ignition_retries_at_terrain_adjusted_threshold(self):
        s=Simulation();s.set_spread_factor(1);s.cells[20][20]['heat']=1
        with patch.object(s.rng,'random',return_value=0.575):
            s.step(2)
        self.assertFalse(s.burning(s.cells[20][21]))
        with patch.object(s.rng,'random',return_value=0.574):
            s.step(2)
        self.assertTrue(s.burning(s.cells[20][21]))

    def test_multiple_neighbors_give_only_one_chance_per_cell(self):
        s=Simulation();s.set_spread_factor(1);s.set_wind('calm')
        s.cells[20][19]['heat']=s.cells[20][21]['heat']=1
        with patch.object(s.rng,'random',return_value=0.9) as draw:
            s.step(10)
        self.assertEqual(draw.call_count,13)
        self.assertFalse(s.burning(s.cells[20][20]))

    def test_seed_reproduces_uneven_front(self):
        sims=[Simulation(seed=seed) for seed in (9,9,10)]
        for s in sims:s.ignite();s.step(30)
        self.assertEqual(sims[0].cells,sims[1].cells)
        self.assertNotEqual(sims[0].cells,sims[2].cells)

    @patch("random.Random.random", return_value=0.0)
    def test_containment_extinguishes_one_cell_per_step(self, _random):
        s=Simulation();s.place_fire(65,43);s.ignite();s.drone.update(x=61.,y=43.)
        for x,y in s.fire_points():s.cells[y][x]['heat']=.1
        s.observe();pos=s.safe_drone_positions()[0];s.apply(command('contain',pos['x'],pos['y']),'a',s.incident_id,0)
        s.step();self.assertEqual(s.suppressed,1)
        before=s.suppressed;s.step();self.assertEqual(s.suppressed-before,1)

    def test_drone_never_flies_through_fire(self):
        for wind in ['east','north','west']:
            s=Simulation();s.ignite();s.set_wind(wind)
            s.apply(command('scout',72,43),'a',s.incident_id,0)
            for _ in range(70):
                s.step()
                self.assertFalse(s.burning(s.cells[round(s.drone['y'])][round(s.drone['x'])]))
                self.assertNotIn((round(s.drone['x']),round(s.drone['y'])),s.danger_zone(s.fire_points()))

    def test_fire_exposure_counts_people_once_and_freezes_group(self):
        for status in ['unwarned','evacuating','blocked','safe']:
            s=Simulation();g=s.groups['farm'];g['status']=status
            s.cells[s.farm[1]][s.farm[0]]['heat']=1
            s.step()
            self.assertEqual((g['burnt'],g['status']),(100,'burnt'))
            frame=s.state()
            s.step(3)
            self.assertEqual((g['x'],g['y']),s.farm)
            self.assertEqual(s.state()['burnt_people'],100)
            self.assertEqual(frame['people']['farm']['burnt'],100)
            self.assertEqual(sum('people burnt' in e['message'] for e in s.history),1)
        fresh=Simulation()
        self.assertEqual(fresh.state()['burnt_people'],0)

    def test_population_alignment_uses_known_source_and_full_wind_vector(self):
        s=Simulation();s.ignite();s.set_wind('west')
        self.assertFalse(any(g['measurements'] for g in s.population_wind_alignment().values()))
        s.farmer_call()
        for wind,expected in [((-3,0),['town','town_north','town_south','town_rosales']),((0,-3),['farm']),((3,0),[]),((0,0),[])]:
            s.set_wind(x=wind[0],y=wind[1])
            alignment=s.population_wind_alignment()
            self.assertEqual([name for name,g in alignment.items() if g['downwind_sector']],
                             expected)

    def test_containment_options_cover_downwind_front_safely(self):
        for wind,pos in [((1,0),(69,43)),((-1,0),(61,43)),((0,-1),(65,39)),((0,1),(65,48)),((1,-1),(69,39))]:
            s=Simulation();s.place_fire(65,43);s.ignite();s.set_wind(x=wind[0],y=wind[1])
            s.drone.update(x=pos[0],y=pos[1]);s.observe()
            options=s.safe_drone_positions()
            self.assertTrue(options)
            self.assertGreater(options[0]['downwind_front_reachable'],0)
            self.assertGreaterEqual(options[0]['downwind_offset'],0)
            for p in options:self.assertNotIn((p['x'],p['y']),s.danger_zone(s.fire_points()))
        s.set_wind('calm');s.observe()
        self.assertTrue(all(p['downwind_offset']==0 for p in s.safe_drone_positions()))

    def test_burning_targets_rejected_even_when_observed(self):
        s=Simulation();s.place_fire(65,43);s.ignite();s.drone.update(x=61.,y=43.)
        for action in ['scout','contain']:
            with self.assertRaises(ValueError):s.apply(command(action,65,43),'a',s.incident_id,0)

    def test_truck_mobilizes_and_cannot_suppress_remotely(self):
        s=Simulation();s.ignite();s.farmer_call();s.step(7)
        self.assertEqual(s.truck['x'],s.base[0]);self.assertEqual(s.crew_extinguished,0)
        s.step();self.assertNotEqual((s.truck['x'],s.truck['y']),s.base)
        self.assertEqual(s.truck_telemetry()['speed'],2)
        previous=(s.truck['x'],s.truck['y'])
        for _ in range(80):
            s.step();now=(s.truck['x'],s.truck['y'])
            self.assertLessEqual(math.dist(now,previous),2+math.sqrt(2))
            previous=now
        self.assertGreater(s.crew_extinguished,0)
        world=json.loads(s.payload()['world_state'])
        self.assertEqual(world['fire_truck']['x'],s.truck['x'])
        self.assertIn('route',world['fire_truck'])

    def test_global_fire_out_returns_both_vehicles_and_finishes(self):
        s=Simulation();s.ignite()
        s.drone.update(x=50.,y=20.,mode='contain',target=[65,43])
        s.truck.update(x=35.,y=20.,mobilized_at=None)
        for row in s.cells:
            for c in row:c.update(heat=0)
        s.step()
        self.assertEqual(s.phase,'returning')
        self.assertEqual(s.drone['target'],list(s.base))
        self.assertEqual(s.truck['target'],list(s.base))
        with self.assertRaises(ValueError):s.apply(command('scout',30,30),'late',s.incident_id,s.tick)
        s.step(100)
        self.assertEqual(s.phase,'finished')
        for v in (s.drone,s.truck):
            self.assertEqual((v['x'],v['y']),s.base)
            self.assertEqual(v['status'],'at_station')
        before=s.tick;s.step(10);self.assertEqual(s.tick,before)
        self.assertEqual(sum('Global simulator trigger' in e['message'] for e in s.history),1)
        self.assertEqual(Simulation().phase,'active')

    def test_last_fire_suppressed_at_base_does_not_dispatch_truck(self):
        s=Simulation();s.ignited=True;s.drone['mode']='contain'
        x,y=s.base[0]+4,s.base[1]
        s.truck['mobilized_at']=0;s.crew_target=[x,y]
        s.cells[y][x].update(heat=.1,fuel=1.,terrain='field')
        with patch.object(s.suppression_rng,'random',return_value=0):s.step()
        self.assertEqual(s.phase,'finished')
        self.assertEqual((s.truck['x'],s.truck['y']),s.base)

    def test_drone_orders_truck_while_evacuating(self):
        s=Simulation();s.ignite();s.farmer_call()
        d=command('evacuate_farm',65,10)
        d.update(truck_command='attack_sector',truck_target_x=45,truck_target_y=25,
                 truck_reason='Truck leads the main attack with six times drone suppression.')
        s.apply(d,'coordinated',s.incident_id,s.tick)
        self.assertEqual(s.crew_target,[45,25])
        self.assertEqual(s.truck['drone_order']['issued_by'],'drone')
        s.drone.update(x=61.,y=43.);s.observe()
        self.assertEqual(s.crew_target,[45,25])
        s.tick=8;s.update_truck()
        self.assertEqual(s.crew_target,[45,25])
        self.assertNotEqual((s.truck['x'],s.truck['y']),s.base)
        s.apply(dict(command('hold',61,43),truck_command='continue'),'keep',s.incident_id,s.tick)
        self.assertEqual(s.truck_telemetry()['drone_order']['sector'],[45,25])

    def test_invalid_truck_order_rejects_drone_command(self):
        s=Simulation()
        before=copy.deepcopy(s.drone)
        d=dict(command('scout',40,20),truck_command='attack_sector',
               truck_target_x=100,truck_target_y=20,truck_reason='Attack')
        with self.assertRaises(ValueError):s.apply(d,'invalid',s.incident_id,0)
        self.assertEqual(s.drone,before)
        self.assertIsNone(s.truck['drone_order'])
        self.assertNotIn('invalid',s.seen_commands)

    def test_known_map_hides_unobserved_truth_and_marks_stale_cells(self):
        s=Simulation();s.place_fire(65,43);s.ignite()
        w=json.loads(s.payload()['world_state'])
        self.assertEqual(w['known_map']['rows'][43][65],'?')
        self.assertIsNone(w['known_map']['smoke_report'])
        s.drone.update(x=61.,y=43.);s.observe()
        self.assertEqual(s.known_map()['rows'][43][65],'F')
        s.tick+=1;s.drone.update(x=12.,y=44.);s.observe()
        self.assertEqual(s.known_map()['rows'][43][65],'f')
        s.cells[43][65]['heat']=0
        self.assertEqual(s.known_map()['rows'][43][65],'f')
        s.drone.update(x=61.,y=43.);s.observe()
        self.assertEqual(s.known_map()['rows'][43][65],'.')

    def test_first_scout_prefers_the_wind_direction(self):
        s=Simulation();s.ignite();s.farmer_call()
        for wind in [(1,0),(-1,0),(0,-1),(0,1),(1,-1)]:
            s.set_wind(x=wind[0],y=wind[1])
            p=s.smoke_scout_positions()[0]
            self.assertGreaterEqual(p['wind_alignment'],0.7)
            self.assertGreater((p['x']-s.report[0])*wind[0]+(p['y']-s.report[1])*wind[1],0)
        s.set_wind('calm')
        self.assertTrue(all(p['wind_alignment']==0 for p in s.smoke_scout_positions()))

    def test_smoke_scout_positions_are_near_report_and_avoid_known_fire(self):
        s=Simulation();s.place_fire(65,43);s.ignite()
        self.assertEqual(s.smoke_scout_positions(),[])
        s.farmer_call()
        for p in s.smoke_scout_positions():
            self.assertGreaterEqual(math.dist((p['x'],p['y']),s.report),3)
            self.assertLessEqual(math.dist((p['x'],p['y']),s.report),4)
        s.drone.update(x=61.,y=43.);s.observe()
        blocked=s.danger_zone(s.fire_points())
        self.assertTrue(all((p['x'],p['y']) not in blocked for p in s.smoke_scout_positions()))

    def test_mission_context_preserves_observed_outcomes(self):
        s=Simulation()
        s.apply(command('scout',30,30),'first',s.incident_id,0)
        s.step(2)
        first=s.mission_context()[0]
        self.assertEqual(first['outcome_so_far']['elapsed_steps'],2)
        s.apply(command('hold',30,30),'second',s.incident_id,s.tick)
        s.step()
        context=s.mission_context()
        self.assertEqual(context[0]['outcome_so_far'],first['outcome_so_far'])
        self.assertEqual(context[1]['outcome_so_far']['elapsed_steps'],1)
        self.assertEqual(len(s.state()['mission_context']),2)
        self.assertEqual(Simulation().mission_context(),[])

    def test_joint_observation_shares_fire_and_clear_updates(self):
        s=Simulation();s.drone.update(x=20.,y=20.);s.truck.update(x=60.,y=20.)
        s.cells[20][25]['heat']=1;s.cells[20][65]['heat']=1
        s.observe()
        self.assertEqual({(c['x'],c['y']) for c in s.observation},{(25,20),(65,20)})
        self.assertEqual(s.memory['65,20']['sources'],['truck'])
        s.drone.update(x=10.,y=40.);s.tick+=1
        s.cells[20][65]['heat']=0;s.observe()
        self.assertFalse(s.memory['65,20']['burning'])
        self.assertTrue(s.memory['25,20']['burning'])
        self.assertLess(s.memory['25,20']['observed_at'],s.tick)
        self.assertNotIn(dict(x=25,y=20),s.observation)

    @patch("random.Random.random", return_value=0.0)
    def test_truck_suppresses_drone_sighting_beyond_own_sensor(self, _random):
        s=Simulation();s.drone.update(x=35.,y=20.)
        s.truck.update(x=20.,y=20.,mobilized_at=0,
                       drone_order=dict(command='attack_sector',sector=[30,20]))
        s.crew_target=[30,20];s.cells[20][30]['heat']=.1
        s.observe()
        self.assertEqual(s.truck['observed_fire'],[])
        self.assertIn(dict(x=30,y=20),s.observation)
        s.update_truck()
        self.assertEqual((s.truck['x'],s.truck['y']),(20,20))
        self.assertEqual(s.crew_extinguished,1)
        self.assertFalse(s.memory['30,20']['burning'])

    def test_shared_map_does_not_allow_blind_suppression(self):
        s=Simulation();s.drone.update(x=70.,y=40.)
        s.truck.update(x=20.,y=20.,mobilized_at=0,
                       drone_order=dict(command='attack_sector',sector=[28,20]))
        s.crew_target=[28,20];s.cells[20][30]['heat']=1
        s.update_truck()
        self.assertEqual(s.crew_extinguished,0)
        self.assertTrue(s.burning(s.cells[20][30]))

    def test_vehicle_observation_radii(self):
        s=Simulation();s.drone.update(x=20.,y=20.)
        s.truck.update(x=50.,y=20.)
        for x,y in [(32,20),(33,20),(59,20),(60,20)]:s.cells[y][x]['heat']=1
        s.observe();s.update_truck()
        self.assertIn(dict(x=32,y=20),s.observation)
        self.assertNotIn(dict(x=33,y=20),s.observation)
        self.assertIn(dict(x=59,y=20),s.truck['observed_fire'])
        self.assertNotIn(dict(x=60,y=20),s.truck['observed_fire'])
        self.assertEqual(s.telemetry()['sensor_radius'],12)
        self.assertEqual(s.truck_telemetry()['sensor_radius'],9)
        self.assertIn('radius 12',json.loads(s.payload()['thermal_detections'])['coverage'])

    def test_warning_frees_drone_while_people_keep_moving(self):
        s=Simulation();s.ignite();s.farmer_call()
        s.drone.update(x=float(s.farm[0]),y=float(s.farm[1]),mode='evacuate_farm',target=None)
        s.step()
        self.assertEqual(s.pending_decision_event,'evacuation_warning_delivered')
        self.assertEqual(s.drone['status'],'awaiting_assignment')
        self.assertEqual(s.last_result['status'],'warning_delivered')
        self.assertEqual(s.groups['farm']['status'],'evacuating')
        before=(s.groups['farm']['x'],s.groups['farm']['y'])
        s.apply(command('scout',60,38),'next',s.incident_id,s.tick)
        s.step()
        self.assertNotEqual((s.groups['farm']['x'],s.groups['farm']['y']),before)
        self.assertEqual(s.drone['mode'],'scout')
        self.assertEqual(sum('Loudspeaker warning' in e['message'] for e in s.history),1)

    def test_optimistic_astar_discovers_fire_and_replans(self):
        s=Simulation();s.drone.update(x=20.,y=20.,target=[50,20])
        s.cells[20][38]['heat']=1  # Initially outside the drone's sensors.
        s.move_safely(s.drone,3)
        self.assertIn([38,20],s.drone['route'])
        self.assertEqual(s.drone['route_plans'],1)
        s.move_safely(s.drone,3)
        self.assertEqual(s.drone['route_plans'],1)  # Reuse the clear route.
        s.move_safely(s.drone,3)
        self.assertEqual(s.drone['route_plans'],2)
        blocked=s.danger_zone([(38,20)])
        self.assertTrue(all(tuple(p) not in blocked for p in s.drone['route']))
        for _ in range(20):
            s.move_safely(s.drone,3)
            self.assertNotIn((s.drone['x'],s.drone['y']),blocked)
        self.assertEqual((s.drone['x'],s.drone['y']),(50,20))
        self.assertEqual(s.drone['route_plans'],2)

    def test_astar_remembers_fire_until_observed_clear(self):
        s=Simulation();s.drone.update(x=30.,y=20.)
        s.cells[20][35]['heat']=1;s.observe()
        s.drone.update(x=20.,y=20.,target=[50,20])
        s.move_safely(s.drone,3)
        self.assertNotIn([35,20],s.drone['route'])
        self.assertTrue(s.memory['35,20']['burning'])
        s.cells[20][35]['heat']=0;s.drone.update(x=30.,y=20.)
        s.observe()
        self.assertFalse(s.memory['35,20']['burning'])

    def test_diagonal_routes_preserve_distance_and_avoid_corner_cutting(self):
        s=Simulation()
        self.assertEqual(s.route((20,20),(23,23),set()),[[21,21],[22,22],[23,23]])
        s.roads=set()
        path,cost=s.truck_route((20,20),{(23,23)},set())
        self.assertEqual(path,[[21,21],[22,22],[23,23]])
        self.assertAlmostEqual(cost,3*math.sqrt(2)/1.6)
        blocked={(21,20)}
        self.assertNotIn((21,21),list(s.neighbors((20,20),blocked)))
        for path in [s.route((20,20),(23,23),blocked),s.truck_route((20,20),{(23,23)},blocked)[0]]:
            previous=(20,20)
            for point in path:
                self.assertIn(tuple(point),list(s.neighbors(previous,blocked)))
                previous=tuple(point)
        s.drone.update(x=20.,y=20.,target=[40,40])
        for _ in range(5):s.move_safely(s.drone,3)
        distance=math.dist((20,20),(s.drone['x'],s.drone['y']))
        self.assertLessEqual(distance,15)
        self.assertLess(15-distance,math.sqrt(2))

    def test_truck_offroad_speed_and_route_cost(self):
        s=Simulation();s.roads=set()
        s.truck.update(x=10.,y=20.,mobilized_at=0);s.crew_target=[60,20]
        for _ in range(5):s.tick+=1;s.update_truck()
        self.assertEqual((s.truck['x'],s.truck['y']),(18,20))
        self.assertAlmostEqual(s.truck_telemetry()['offroad_speed'],1.6)
        self.assertEqual(s.truck['terrain'],'offroad')
        path,cost=s.truck_route((10,20),{(18,20)},set())
        self.assertEqual(len(path),8);self.assertEqual(cost,5)
        s.roads={(x,20) for x in range(80)}
        path,cost=s.truck_route((10,20),{(18,20)},set())
        self.assertEqual(cost,4)
        s.truck.update(x=10.,y=20.,travel_credit=0)
        for _ in range(5):s.tick+=1;s.update_truck()
        self.assertEqual((s.truck['x'],s.truck['y']),(20,20))

    def test_truck_routes_around_fire_and_uses_offroad_shortcut(self):
        s=Simulation()
        path,cost=s.truck_route((12,44),{(20,35)},set())
        self.assertTrue(any(tuple(p) not in s.roads for p in path))
        blocked={(13,44),(13,43),(13,45)}
        path,cost=s.truck_route((12,44),{(20,44)},blocked)
        self.assertTrue(path)
        self.assertTrue(all(tuple(p) not in blocked for p in path))

    @patch("random.Random.random", return_value=0.0)
    def test_larger_suppression_ranges(self, _random):
        s=Simulation();s.drone.update(x=40.,y=20.,mode='contain')
        s.cells[20][48]['heat']=.1;s.cells[20][49]['heat']=.1
        s.step()
        self.assertFalse(s.burning(s.cells[20][48]))
        self.assertTrue(s.burning(s.cells[20][49]))
        s=Simulation();s.truck.update(x=40.,y=20.,mobilized_at=0)
        s.cells[20][50]['heat']=.1;s.crew_target=[50,20]
        s.update_truck()
        self.assertFalse(s.burning(s.cells[20][50]))
        self.assertEqual(s.truck_telemetry()['hose_range'],10)

    @patch("random.Random.random", return_value=0.0)
    def test_crew_five_jets_can_suppress_five_cells(self, _random):
        s=Simulation();s.truck.update(x=60.,y=42.,mobilized_at=0)
        for x,y in [(65,42),(65,43),(65,44),(66,42),(66,43),(66,44),(67,42)]:s.cells[y][x]['heat']=.1
        s.crew_target=[65,42];s.update_truck()
        self.assertEqual(s.crew_extinguished,5)

    def test_jet_probability_threshold_and_attempt_limit(self):
        s=Simulation();points=[(30+i,20) for i in range(6)]
        for x,y in points:s.cells[y][x]['heat']=1
        with patch.object(s.suppression_rng,'random',side_effect=[0.59,0.6,0.1,0.9,0.0]) as draw:
            attempts=s.suppress(points,5,0.6)
        self.assertEqual(draw.call_count,5)
        self.assertEqual([a['success'] for a in attempts],[True,False,True,False,True])
        self.assertTrue(s.burning(s.cells[20][35]))
        self.assertTrue(s.burning(s.cells[20][31]))
        with patch.object(s.suppression_rng,'random',return_value=0.0):
            self.assertTrue(s.suppress([(31,20)],1,0.4)[0]['success'])

    def test_drone_jet_probability_boundary(self):
        for value,expected in [(0.399,True),(0.4,False)]:
            s=Simulation();s.cells[20][30]['heat']=1
            with patch.object(s.suppression_rng,'random',return_value=value):
                attempt=s.suppress([(30,20)],s.rules['drone_jets'],s.rules['drone_suppression_success_probability'])
            self.assertEqual(attempt[0]['success'],expected)

    def test_jet_context_and_seeded_results(self):
        sims=[Simulation(seed=9),Simulation(seed=9)]
        outcomes=[]
        for s in sims:
            for x in range(30,36):s.cells[20][x]['heat']=1
            outcomes.append(s.suppress([(x,20) for x in range(30,36)],5,0.6))
        self.assertEqual(*outcomes)
        s=sims[0];w=json.loads(s.payload()['world_state'])
        self.assertEqual(w['rules']['truck_jets'],5)
        self.assertEqual(s.telemetry()['jets'],1)
        self.assertEqual(s.truck_telemetry()['suppression_success_probability'],0.6)
        self.assertEqual(s.telemetry()['expected_successful_jet_hits_per_step'],0.4)
        self.assertEqual(s.truck_telemetry()['expected_successful_jet_hits_per_step'],3.0)
        self.assertEqual(s.telemetry()['suppression_success_probability'],0.4)

    def test_vector_wind_strength_diagonal_and_validation(self):
        s=Simulation();s.set_wind(x=0,y=0)
        self.assertEqual(s.spread_interval(1,0),s.spread_interval(0,-1))
        s.set_wind(x=1,y=-1)
        self.assertEqual(s.spread_interval(1,0),4)
        self.assertEqual(s.spread_interval(0,-1),4)
        s.set_wind(x=3,y=-2)
        self.assertEqual(s.spread_interval(1,0),2)
        self.assertGreater(s.spread_interval(-1,0),s.spread_interval(1,0))
        self.assertEqual(json.loads(s.payload()['world_state'])['wind']['dy'],-2)
        for x,y in [(4,0),(float('nan'),0),(True,0),(1,None)]:
            with self.assertRaises(ValueError):s.set_wind(x=x,y=y)
        self.assertEqual(s.wind,(3,-2))

    @patch("random.Random.random", return_value=0.0)
    def test_wind_changes_spread(self, _random):
        s=Simulation();s.place_fire(65,43);s.ignite();s.set_wind('north');s.step(4)
        self.assertTrue(s.burning(s.cells[42][65]))
        self.assertFalse(s.burning(s.cells[43][67]))

    def test_agent_does_not_receive_global_fire_map_or_ignition_log(self):
        s=Simulation();s.ignite();p=s.payload()
        self.assertEqual(json.loads(p['thermal_detections'])['burning_cells'],[])
        w=json.loads(p['world_state'])
        self.assertNotIn('cells',w)
        self.assertFalse(any(e['source']=='simulation' for e in w['memory']))
        self.assertIsNone(w['farmer_report_location'])
        self.assertNotIn('battery',s.telemetry());self.assertNotIn('water',s.telemetry())

    def test_satellite_is_delayed_and_coarse(self):
        s=Simulation();s.ignite();s.step(23);self.assertIsNone(s.satellite)
        s.step();self.assertEqual(s.satellite['captured_at'],12)
        self.assertTrue(s.satellite['blocks'])
        self.assertTrue(all(x%8==0 and y%8==0 for x,y in s.satellite['blocks']))

    def test_travel_takes_time_and_evacuation_waits_for_drone(self):
        s=Simulation();s.apply(command('evacuate_farm',65,10),'a',s.incident_id,0)
        s.step();self.assertEqual(s.groups['farm']['status'],'unwarned')
        s.step(32);self.assertEqual(s.groups['farm']['status'],'evacuating')
        self.assertEqual(s.suppressed,0)
        s.step(40);self.assertEqual(s.groups['farm']['status'],'safe')

    def test_people_stop_at_burning_route(self):
        s=Simulation();g=s.groups['farm'];g['status']='evacuating'
        s.cells[s.farm[1]-1][s.farm[0]-1]['heat']=1;s.step()
        self.assertEqual(g['status'],'blocked');self.assertEqual(g['x'],s.farm[0])

    def test_invalid_commands_are_side_effect_free(self):
        s=Simulation();s.ignite()
        for c in [command('contain',65,43),command('scout',-1,0),command('scout',float('nan'),0),command('unknown')]:
            with self.assertRaises(ValueError):s.apply(c,'bad',s.incident_id,s.tick)
        self.assertEqual(s.seen_commands,set())

    def test_stale_duplicate_and_wrong_incident_rejected(self):
        s=Simulation();s.apply(command('hold'),'one',s.incident_id,0)
        for cid,incident,tick in [('one',s.incident_id,0),('two','old',0),('three',s.incident_id,1)]:
            with self.assertRaises(ValueError):s.apply(command('hold'),cid,incident,tick)

    def test_recorded_state_is_immutable(self):
        s=Simulation();s.ignite();frame=s.state();s.step(24)
        self.assertEqual(frame['tick'],0);self.assertEqual(frame['burning'],3)
        self.assertNotEqual(frame['cells'],s.cells)

    def test_replay_pauses_and_rejects_mutations(self):
        from simulator.server import Controller
        c=Controller()
        try:
            c.action('ignite',{});c.action('step',{});tick=c.sim.tick
            c.action('seek',{'index':0})
            self.assertEqual(c.state()['tick'],0)
            with self.assertRaises(ValueError):c.action('step',{})
            self.assertEqual(c.sim.tick,tick)
            c.action('live',{});self.assertEqual(c.state()['tick'],tick)
            self.assertFalse(c.running)
        finally:c.stop.set();c.robot.close()


class ControllerTests(unittest.TestCase):
    def test_reset_queues_during_decision_and_discards_reply_or_error(self):
        from simulator.server import Controller
        for fails in (False,True):
            c=Controller();entered=threading.Event();release=threading.Event()
            c.sim.ignite();c.sim.farmer_call();old=c.sim.incident_id
            def decide(payload):
                entered.set();release.wait(3)
                if fails:raise ValueError('Old reply invalid')
                return command('hold',*c.sim.base),'old evidence'
            try:
                with patch.object(c.robot,'decide',side_effect=decide) as call:
                    c.request_decision();self.assertTrue(entered.wait(2))
                    c.action('reset',{});c.action('reset',{})
                    self.assertTrue(c.state()['reset_pending'])
                    self.assertTrue(c.busy)
                    self.assertEqual(c.sim.incident_id,old)
                    release.set()
                    deadline=time.monotonic()+3
                    while c.state()['busy'] and time.monotonic()<deadline:time.sleep(.01)
                    self.assertFalse(c.busy)
                    self.assertFalse(c.reset_pending)
                    self.assertNotEqual(c.sim.incident_id,old)
                    self.assertEqual(c.sim.tick,0)
                    self.assertFalse(c.sim.ignited)
                    self.assertEqual(c.calls,0)
                    self.assertIsNone(c.error)
                    self.assertEqual(call.call_count,1)
            finally:release.set();c.stop.set();c.robot.close()


    def test_world_frozen_during_decision_and_corrective_retry(self):
        from simulator.server import Controller
        for invalid_first in [False,True]:
            with self.subTest(corrective_retry=invalid_first):
                c=Controller();c.sim.ignite();c.sim.farmer_call()
                entered=threading.Event();release=threading.Event();attempts=[]
                def slow_decision(payload):
                    attempts.append(payload['event_type'])
                    if invalid_first and len(attempts)==1:
                        return command('contain',65,43),'invalid target'
                    entered.set()
                    if not release.wait(3):raise RuntimeError('Test decision release timed out')
                    return command('hold',12,44),'valid output'
                try:
                    with patch.object(c.robot,'decide',side_effect=slow_decision):
                        c.speed=8;c.running=True
                        with c.lock:c.request_decision()
                        self.assertTrue(entered.wait(2))
                        before=c.sim.state()
                        self.assertTrue(c.busy)
                        with self.assertRaises(ValueError):c.action('step',{})
                        # Longer than the clock's initial 0.5-second wait, plus several 8x ticks.
                        time.sleep(.8)
                        after=c.sim.state()
                        for field in ['tick','cells','drone','truck','people','satellite']:
                            self.assertEqual(before[field],after[field],field)
                        c.action('pause',{})
                        release.set()
                        deadline=time.monotonic()+2
                        while c.state()['busy'] and time.monotonic()<deadline:time.sleep(.01)
                        self.assertFalse(c.busy)
                        self.assertEqual(c.sim.tick,before['tick'])
                        if invalid_first:self.assertEqual(attempts[-1],'command_rejected')
                finally:release.set();c.stop.set();c.robot.close()

    def test_run_recording_and_stop_preserve_frames(self):
        from simulator.server import Controller
        c=Controller()
        try:
            with patch.object(c,'request_decision') as decide:
                c.action('place_fire',dict(x=35,y=20))
                c.action('record_run',dict(x=.5,y=-1))
                decide.assert_called_once_with('farmer_call')
                c.running=False
                self.assertTrue(c.recording);self.assertTrue(c.sim.called)
                c.action('step',{})
                count=len(c.recorded_frames)
                c.action('stop_recording',{})
                c.action('step',{})
                self.assertEqual(len(c.recorded_frames),count)
                self.assertFalse(c.recording)
        finally:c.stop.set();c.robot.close()

    def test_invalid_target_gets_one_corrective_agent_request(self):
        from simulator.server import Controller
        c=Controller();c.sim.ignite();c.sim.farmer_call()
        try:
            payload=c.sim.payload()
            with patch.object(c.robot,'decide',return_value=(command('contain',65,43),'evidence')), patch.object(c,'request_decision') as retry:
                c._decide(payload,0)
                retry.assert_called_once_with('command_rejected')
                self.assertIsNone(c.error)
                self.assertEqual(c.sim.last_result['status'],'rejected')
                self.assertEqual(c.sim.drone['mode'],'hold')
                retry.reset_mock()
                c._decide(payload,0)
                retry.assert_not_called()
                self.assertIsNotNone(c.error)
                self.assertFalse(c.running)
        finally:c.stop.set();c.robot.close()


class ParserTests(unittest.TestCase):
    def test_completed_summary_fetches_actual_output_and_normalizes_coordinates(self):
        run = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
        output = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
        c = command('scout'); c.update(target_x='12', target_y='10')
        answers = [
            {'content': [{'text': f'Run ID: {run}\nStatus: completed'}]},
            {'content': [{'text': f'## Drone\nOutput ID: {output}\nStatus: succeeded\nTimestamp: 2026-09-19T12:00:00Z'}]},
            {'content': [{'text': 'Data: '+json.dumps({'response': c})}]}]
        h = HappyRobot()
        with TemporaryDirectory() as tmp, patch('simulator.happyrobot.ROOT', Path(tmp)), patch.object(h, 'tool', side_effect=answers) as call:
            decision, evidence = h.decide({'event_type': 'farmer_call'})
            self.assertEqual(decision['target_x'], 12)
            self.assertEqual(decision['target_y'], 10)
            self.assertEqual(call.call_count, 3)
            self.assertEqual(call.call_args.args[1]['output_id'], output)

    def test_latest_delegation_selected_independent_of_listing_order(self):
        old = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
        new = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
        blocks = [f'## Drone\n- Output ID: {old}\n- Status: succeeded\n- Timestamp: 2026-09-19T10:00:00Z',
                  f'## Drone\n- Output ID: {new}\n- Status: succeeded\n- Timestamp: 2026-09-19T10:00:01Z']
        for order in (blocks, blocks[::-1]):
            self.assertEqual(HappyRobot.latest_output('\n'.join(order)), new)

    def test_nested_json_in_mcp_text(self):
        c = command()
        result = {'content': [{'type': 'text', 'text': 'Result:\n```json\n'+json.dumps({'response': c})+'\n```'}]}
        self.assertEqual(HappyRobot.decisions(result), [c])

    def test_no_fabricated_fallback(self):
        self.assertEqual(HappyRobot.decisions({'content': [{'text': 'No result.'}]}), [])


if __name__ == '__main__':
    unittest.main()
