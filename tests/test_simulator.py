import copy
import json
import unittest
import threading
import time
from unittest.mock import patch
from tempfile import TemporaryDirectory
from pathlib import Path

from simulator.engine import Simulation
from simulator.happyrobot import HappyRobot


def command(action='contain', x=65, y=43):
    return dict(command=action, target_x=x, target_y=y, reason='Test decision', mission='Contain')


class PhysicsTests(unittest.TestCase):
    def test_selected_fire_location_updates_report_and_payload(self):
        s=Simulation();s.place_fire(35,20);s.ignite();s.farmer_call()
        self.assertTrue(s.burning(s.cells[20][35]))
        self.assertFalse(s.burning(s.cells[43][65]))
        self.assertIn('(35, 20)',s.call_text)
        self.assertEqual(json.loads(s.payload()['world_state'])['farmer_report_location'],dict(x=35,y=20))
        with self.assertRaises(ValueError):s.place_fire(20,20)

    @patch("random.Random.random", return_value=0.0)
    def test_fire_attempts_at_advertised_interval(self, _random):
        s=Simulation();s.ignite();s.step(1)
        self.assertFalse(s.burning(s.cells[43][67]))
        s.step();self.assertTrue(s.burning(s.cells[43][67]))
        self.assertFalse(s.burning(s.cells[42][65]))

    def test_failed_ignition_retries_and_threshold_is_fifty_percent(self):
        s=Simulation();s.cells[20][20]['heat']=1
        with patch.object(s.rng,'random',return_value=0.5):
            s.step(2)
        self.assertFalse(s.burning(s.cells[20][21]))
        with patch.object(s.rng,'random',return_value=0.499):
            s.step(2)
        self.assertTrue(s.burning(s.cells[20][21]))

    def test_multiple_neighbors_give_only_one_chance_per_cell(self):
        s=Simulation();s.set_wind('calm')
        s.cells[20][19]['heat']=s.cells[20][21]['heat']=1
        with patch.object(s.rng,'random',return_value=0.9) as draw:
            s.step(10)
        self.assertEqual(draw.call_count,7)
        self.assertFalse(s.burning(s.cells[20][20]))

    def test_seed_reproduces_uneven_front(self):
        sims=[Simulation(seed=seed) for seed in (9,9,10)]
        for s in sims:s.ignite();s.step(30)
        self.assertEqual(sims[0].cells,sims[1].cells)
        self.assertNotEqual(sims[0].cells,sims[2].cells)

    def test_containment_extinguishes_one_cell_per_step(self):
        s=Simulation();s.ignite();s.drone.update(x=61.,y=43.)
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
            s.cells[10][65]['heat']=1
            s.step()
            self.assertEqual((g['burnt'],g['status']),(6,'burnt'))
            frame=s.state()
            s.step(3)
            self.assertEqual((g['x'],g['y']),(65,10))
            self.assertEqual(s.state()['burnt_people'],6)
            self.assertEqual(frame['people']['farm']['burnt'],6)
            self.assertEqual(sum('people burnt' in e['message'] for e in s.history),1)
        fresh=Simulation()
        self.assertEqual(fresh.state()['burnt_people'],0)

    def test_population_alignment_uses_known_source_and_full_wind_vector(self):
        s=Simulation();s.ignite();s.set_wind('west')
        self.assertFalse(any(g['measurements'] for g in s.population_wind_alignment().values()))
        s.farmer_call()
        for wind,expected in [((-3,0),'town'),((0,-3),'farm'),((3,0),None),((0,0),None)]:
            s.set_wind(x=wind[0],y=wind[1])
            alignment=s.population_wind_alignment()
            self.assertEqual([name for name,g in alignment.items() if g['downwind_sector']],
                             [expected] if expected else [])

    def test_containment_options_cover_downwind_front_safely(self):
        for wind,pos in [((1,0),(69,43)),((-1,0),(61,43)),((0,-1),(65,39)),((0,1),(65,48)),((1,-1),(69,39))]:
            s=Simulation();s.ignite();s.set_wind(x=wind[0],y=wind[1])
            s.drone.update(x=pos[0],y=pos[1]);s.observe()
            options=s.safe_drone_positions()
            self.assertTrue(options)
            self.assertGreater(options[0]['downwind_front_reachable'],0)
            self.assertGreaterEqual(options[0]['downwind_offset'],0)
            for p in options:self.assertNotIn((p['x'],p['y']),s.danger_zone(s.fire_points()))
        s.set_wind('calm');s.observe()
        self.assertTrue(all(p['downwind_offset']==0 for p in s.safe_drone_positions()))

    def test_burning_targets_rejected_even_when_observed(self):
        s=Simulation();s.ignite();s.drone.update(x=61.,y=43.)
        for action in ['scout','contain']:
            with self.assertRaises(ValueError):s.apply(command(action,65,43),'a',s.incident_id,0)

    def test_truck_moves_on_roads_and_cannot_suppress_remotely(self):
        s=Simulation();s.ignite();s.farmer_call();s.step(7)
        self.assertEqual(s.truck['x'],12);self.assertEqual(s.crew_extinguished,0)
        s.step();self.assertEqual((s.truck['x'],s.truck['y']),(12,42))
        self.assertEqual(s.truck_telemetry()['speed'],2)
        previous=(s.truck['x'],s.truck['y'])
        for _ in range(80):
            s.step();now=(s.truck['x'],s.truck['y'])
            self.assertIn(now,s.roads)
            self.assertLessEqual(abs(now[0]-previous[0])+abs(now[1]-previous[1]),2)
            previous=now
        self.assertGreater(s.crew_extinguished,0)
        world=json.loads(s.payload()['world_state'])
        self.assertEqual(world['fire_truck']['x'],s.truck['x'])
        self.assertIn('route',world['fire_truck'])

    def test_crew_suppresses_six_cells_from_hose_range(self):
        s=Simulation();s.truck.update(x=60.,y=42.,mobilized_at=0)
        for x,y in [(65,42),(65,43),(65,44),(66,42),(66,43),(66,44),(67,42)]:s.cells[y][x]['heat']=1
        s.crew_target=[65,42];s.update_truck()
        self.assertEqual(s.crew_extinguished,6)

    def test_vector_wind_strength_diagonal_and_validation(self):
        s=Simulation();s.set_wind(x=0,y=0)
        self.assertEqual(s.spread_interval(1,0),s.spread_interval(0,-1))
        s.set_wind(x=1,y=-1)
        self.assertEqual(s.spread_interval(1,0),2)
        self.assertEqual(s.spread_interval(0,-1),2)
        s.set_wind(x=3,y=-2)
        self.assertEqual(s.spread_interval(1,0),1)
        self.assertGreater(s.spread_interval(-1,0),s.spread_interval(1,0))
        self.assertEqual(json.loads(s.payload()['world_state'])['wind']['dy'],-2)
        for x,y in [(4,0),(float('nan'),0),(True,0),(1,None)]:
            with self.assertRaises(ValueError):s.set_wind(x=x,y=y)
        self.assertEqual(s.wind,(3,-2))

    @patch("random.Random.random", return_value=0.0)
    def test_wind_changes_spread(self, _random):
        s=Simulation();s.ignite();s.set_wind('north');s.step(4)
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
        s.cells[10][64]['heat']=1;s.step()
        self.assertEqual(g['status'],'blocked');self.assertEqual(g['x'],65)

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
                        while c.busy and time.monotonic()<deadline:time.sleep(.01)
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
