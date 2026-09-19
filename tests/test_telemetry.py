import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from simulator import telemetry
from simulator.happyrobot import HappyRobot

FIX = json.loads((Path(__file__).parent/'fixtures/scout_loop_run.json').read_text())


class TelemetryTests(unittest.TestCase):
    def test_parse_reference_run(self):
        steps = telemetry.parse_events('Scout Agent', FIX)
        self.assertEqual(len(steps), 13)
        self.assertEqual(steps[0]['action'], 'report_scout_plan')
        self.assertEqual(steps[-1]['action'], '_terminate')
        self.assertIsInstance(steps[0]['arguments'], dict)
        self.assertEqual(steps[0]['outcome'], {'steps': []})

    def test_signals_detect_loop(self):
        steps = telemetry.parse_events('Scout Agent', FIX)
        sig = telemetry.signals(steps, dict(world_state=json.dumps(dict(fleet=[], fire_trucks=[]))))
        # 12 report_scout_plan calls in a row = 11 consecutive repeats of the same tool.
        self.assertEqual(sig['repeated_tool_calls']['Scout Agent'], 11)
        self.assertTrue(sig['terminated_cleanly'])
        self.assertGreater(sig['agent_seconds']['Scout Agent'], 240)
        self.assertEqual(sig['empty_reasoning_steps'], 10)
        self.assertTrue(sig['loop_detected'])
        self.assertEqual(sig['steps_per_agent'], {'Scout Agent': 13})

    def test_contradiction_when_fleet_exists(self):
        steps = [dict(agent='Drone Agent', timestamp='t', reasoning='No authoritative extinguisher unit is supplied, so hold.',
                      action='report_to_central', arguments={}, outcome={})]
        payload = dict(world_state=json.dumps(dict(fleet=[dict(role='extinguisher', drone_id='drone-1')], fire_trucks=[])),
                       thermal_detections=json.dumps(dict(burning_cells=[])))
        self.assertIn('claims_no_extinguisher', telemetry.signals(steps, payload)['contradictions'])
        payload['world_state'] = json.dumps(dict(fleet=[], fire_trucks=[]))
        self.assertEqual(telemetry.signals(steps, payload)['contradictions'], [])

    def test_harvest_fetches_agent_outputs_only(self):
        listing = ('## Resultado de la mision\n- Output ID: 11111111-1111-1111-1111-111111111111\n- Status: succeeded\n'
                   '## Drone Agent\n- Output ID: 22222222-2222-2222-2222-222222222222\n- Status: succeeded\n'
                   '## Scout Agent\n- Output ID: 33333333-3333-3333-3333-333333333333\n- Status: succeeded\n')
        events = json.dumps([dict(timestamp='t', reasoning='r', action='report_to_central', arguments='{}', outcome='')])
        data = 'Data: '+json.dumps(dict(name='Drone Agent', steps=1, events=events))
        h = HappyRobot()
        with patch.object(h, 'tool', return_value={'content': [{'text': data}]}) as call:
            steps = telemetry.harvest(h, 'run', listing)
        # One fetch per agent block, none for the output node; agent names come from the listing.
        self.assertEqual(call.call_count, 2)
        self.assertEqual([s['agent'] for s in steps], ['Drone Agent', 'Scout Agent'])
        self.assertNotIn('11111111-1111-1111-1111-111111111111', str(call.call_args_list))

    def test_decide_exposes_run_id_and_listing(self):
        run = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
        output = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
        mission = dict(primary_command='hold', mission='m', drone_reason='r', extinguisher_orders=[], scout_orders=[], truck_orders=[])
        answers = [{'content': [{'text': f'Run ID: {run}\nStatus: completed'}]},
                   {'content': [{'text': f'## Edge\nOutput ID: {output}\nStatus: succeeded\nTimestamp: 2026-09-19T12:00:00Z'}]},
                   {'content': [{'text': 'Data: '+json.dumps({'response': mission})}]}]
        h = HappyRobot()
        with TemporaryDirectory() as tmp, patch('simulator.happyrobot.ROOT', Path(tmp)), patch.object(h, 'tool', side_effect=answers):
            h.decide({'event_type': 'farmer_call'})
        self.assertEqual(h.last_run_id, run)
        self.assertIn(output, h.last_listing)


if __name__ == '__main__':
    unittest.main()
