import copy
import json
import unittest
from unittest.mock import patch
from tempfile import TemporaryDirectory
from pathlib import Path

from simulator.engine import Simulation
from simulator.happyrobot import HappyRobot


def command(action='contain', x=65, y=43):
    return dict(command=action, target_x=x, target_y=y, reason='Test decision', mission='Contain')


class PhysicsTests(unittest.TestCase):
    def test_fire_spreads_at_advertised_rate(self):
        s=Simulation();s.ignite();s.step(1)
        self.assertFalse(s.burning(s.cells[43][67]))
        s.step();self.assertTrue(s.burning(s.cells[43][67]))
        self.assertFalse(s.burning(s.cells[42][65]))

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

    def test_burning_targets_rejected_even_when_observed(self):
        s=Simulation();s.ignite();s.drone.update(x=61.,y=43.)
        for action in ['scout','contain']:
            with self.assertRaises(ValueError):s.apply(command(action,65,43),'a',s.incident_id,0)

    def test_truck_moves_on_roads_and_cannot_suppress_remotely(self):
        s=Simulation();s.ignite();s.farmer_call();s.step(7)
        self.assertEqual(s.truck['x'],12);self.assertEqual(s.crew_extinguished,0)
        previous=(s.truck['x'],s.truck['y'])
        for _ in range(80):
            s.step();now=(s.truck['x'],s.truck['y'])
            self.assertIn(now,s.roads)
            self.assertLessEqual(abs(now[0]-previous[0])+abs(now[1]-previous[1]),1)
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

    def test_wind_changes_spread(self):
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
