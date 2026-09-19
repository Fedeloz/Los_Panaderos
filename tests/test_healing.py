import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import MagicMock, patch

from simulator.blackbox import BlackBox
from simulator.engine import Simulation
from simulator.healing import Healer, parse_nodes, latest_version, prompt_node_for

DIAG = dict(gap_type='execution', root_cause='Empty tool result read as failure', evidence_step_indexes=[1], prompt_section='ONE-SHOT TASK',
            proposed_rule='An empty tool result means the report was accepted; terminate.',
            proposed_prompt_patch='After report_scout_plan returns, terminate even if the result is empty.', confidence=0.9)

LISTING = ('# Workflow: Los Panaderos\n- ID: wf\n\n## Latest Version\n- ID: 01a0bbaf-85ee-7021-85d3-dd4e5b467d09\n- Published: true\n\n## Nodes (4 total)\n\n'
           '### Prompt (prompt)\n- Node ID: prompt-scout\n- Persistent ID: p1\n- Event ID: n/a\n- Parent ID: node-scout\n\n'
           '### Scout Agent (action)\n- Node ID: node-scout\n- Persistent ID: p2\n- Event ID: e\n- Parent ID: node-trigger\n\n'
           '### Prompt (prompt)\n- Node ID: prompt-drone\n- Persistent ID: p3\n- Event ID: n/a\n- Parent ID: node-drone\n\n'
           '### Drone Agent (action)\n- Node ID: node-drone\n- Persistent ID: p4\n- Event ID: e\n- Parent ID: node-scout\n')

MISSION = dict(primary_command='hold', mission='m', drone_reason='r',
               extinguisher_orders=[dict(drone_id='drone-1', command='hold', target_x=12, target_y=32, district_id='', reason='r')],
               scout_orders=[], truck_orders=[dict(truck_id='engine-1', command='continue', reason='r')])


class ParserTests(unittest.TestCase):
    def test_parse_listing(self):
        nodes = parse_nodes(LISTING)
        self.assertEqual(len(nodes), 4)
        self.assertEqual(latest_version(LISTING), '01a0bbaf-85ee-7021-85d3-dd4e5b467d09')
        self.assertEqual(prompt_node_for(nodes, 'Scout Agent')['node_id'], 'prompt-scout')
        self.assertEqual(prompt_node_for(nodes, 'Drone Agent')['node_id'], 'prompt-drone')
        self.assertIsNone(prompt_node_for(nodes, 'Nope'))


class HealingTests(unittest.TestCase):
    def setUp(self):
        self.tmp = TemporaryDirectory()
        root = Path(self.tmp.name)
        self.box = BlackBox(root/'bb.sqlite')
        self.robot = MagicMock()
        self.robot.text = lambda r: r['content'][0]['text']
        self.robot.tool.return_value = {'content': [{'text': ''}]}
        self.healer = Healer(self.box, self.robot, 'wf-uuid', root)
        self.sim = Simulation(fleet_counts=dict(scouts=0, extinguishers=1, trucks=1))
        self.sim.ignite(); self.sim.farmer_call()
        self.did = self.box.record_decision(self.sim, self.sim.payload(), 'run-1', 1.0, MISSION, 'applied')
        self.box.save_evaluation(self.did, dict(regret=250., actual_cost=250., best_cost=0., horizon=4, seeds=[9]))

    def tearDown(self):
        self.box.close(); self.tmp.cleanup()

    def test_tier1_stores_lesson_and_marks_run_critical(self):
        out = self.healer.tier1(self.did, 'run-1', DIAG, dict(regret=0, gap_type='execution'))
        self.assertEqual(self.box.active_lessons(), [DIAG['proposed_rule']])
        name, args = self.robot.tool.call_args.args
        self.assertEqual(name, 'monitor_runs')
        self.assertEqual(args['action'], 'mark')
        self.assertEqual(args['annotation'], 'critical')
        self.assertIn('Empty tool result', args['correction'])
        self.assertEqual(out['annotation'], 'critical')

    def test_tier1_marks_correct_when_no_gap_and_keeps_no_lesson(self):
        self.healer.tier1(self.did, 'run-1', dict(DIAG, gap_type='none', proposed_rule='Fine.'), dict(regret=0, gap_type='none'))
        args = self.robot.tool.call_args.args[1]
        self.assertEqual(args['annotation'], 'correct')
        self.assertNotIn('correction', args)
        self.assertEqual(self.box.active_lessons(), [])

    def test_tier1_information_gap_is_not_blamed(self):
        self.healer.tier1(self.did, 'run-1', dict(DIAG, gap_type='information'), dict(gap_type='information'))
        self.assertEqual(self.robot.tool.call_args.args[1]['annotation'], 'correct')
        self.assertEqual(self.box.active_lessons(), [])

    def test_tier2_needs_recurrence_then_creates_northstar_on_prompt_node(self):
        self.assertIsNone(self.healer.tier2(DIAG))
        self.box.save_reflection(self.did, 'r', 't', DIAG)
        did2 = self.box.record_decision(self.sim, self.sim.payload(), 'run-2', 1.0, {}, 'applied')
        self.box.save_reflection(did2, 'r2', 't', DIAG)
        self.robot.tool.side_effect = lambda name, args, **kw: {'content': [{'text': LISTING if name == 'get_workflow_details' else 'Northstar created'}]}
        out = self.healer.tier2(DIAG)
        call = next(c for c in self.robot.tool.call_args_list if c.args[0] == 'manage_northstars')
        self.assertEqual(call.args[1]['action'], 'create')
        self.assertEqual(call.args[1]['node_id'], 'prompt-scout')
        self.assertEqual(call.args[1]['version_id'], '01a0bbaf-85ee-7021-85d3-dd4e5b467d09')
        self.assertEqual(out['node_id'], 'prompt-scout')

    def test_tier3_forks_patches_publishes_staging_only_and_reports(self):
        forked = LISTING.replace('01a0bbaf-85ee-7021-85d3-dd4e5b467d09', '01a0bbaf-0000-7021-85d3-dd4e5b467d09')
        decision_text = 'Data: '+json.dumps(dict(response=MISSION))
        replies = {
            'manage_versions': 'Version forked\n- Version ID: 01a0bbaf-0000-7021-85d3-dd4e5b467d09\n- Published: false',
            'get_node_details': '# Node: Prompt (prompt)\n\n## Prompt (markdown)\n```\nONE-SHOT TASK. Call once.\n\nMORE TEXT\n```\n',
            'update_workflow_nodes': 'Node updated', 'fix_broken_vars': 'All nodes passed',
            'trigger_run': 'Run ID: cccccccc-cccc-cccc-cccc-cccccccccccc\nStatus: completed',
            'monitor_runs': '## Edge\n- Output ID: dddddddd-dddd-dddd-dddd-dddddddddddd\n- Status: succeeded\n- Timestamp: 2026-09-20T00:00:00Z\n'+decision_text}
        def tool(name, args, **kw):
            if name == 'get_workflow_details':
                return {'content': [{'text': forked if args.get('version_id') else LISTING}]}
            return {'content': [{'text': replies[name]}]}
        self.robot.tool.side_effect = tool
        with patch('simulator.healing.oracle.evaluate', return_value=dict(actual_cost=10., best_cost=0., regret=10., gap_type='none')):
            report = self.healer.tier3(self.did, DIAG, dict(regret=250., best_cost=0., actual_cost=250.))
        calls = self.robot.tool.call_args_list
        fork = next(c for c in calls if c.args[0] == 'manage_versions' and c.args[1]['action'] == 'fork')
        self.assertEqual(fork.args[1]['version_id'], '01a0bbaf-85ee-7021-85d3-dd4e5b467d09')
        update = next(c for c in calls if c.args[0] == 'update_workflow_nodes')
        self.assertEqual(update.args[1]['node_id'], 'prompt-scout')
        self.assertEqual(update.args[1]['version_id'], '01a0bbaf-0000-7021-85d3-dd4e5b467d09')
        self.assertIn('ONE-SHOT TASK. Call once.', json.loads(update.args[1]['updates'])['prompt_md'])
        self.assertIn(DIAG['proposed_prompt_patch'], json.loads(update.args[1]['updates'])['prompt_md'])
        publishes = [c.args[1] for c in calls if c.args[0] == 'manage_versions' and c.args[1]['action'] == 'publish']
        self.assertEqual([p['environment'] for p in publishes], ['staging'])
        trigger = next(c for c in calls if c.args[0] == 'trigger_run')
        self.assertEqual(trigger.args[1]['environment'], 'staging')
        self.assertEqual(json.loads(trigger.args[1]['payload'])['incident_id'], self.sim.incident_id)
        self.assertTrue(Path(report['report_path']).exists())
        self.assertEqual(report['ab']['regret_before'], 250.)
        self.assertEqual(report['ab']['regret_after'], 10.)
        self.assertFalse(report['promoted'])
        self.assertEqual(len(self.box.patches()), 1)

    def test_tier3_skipped_below_confidence_or_without_patch(self):
        self.assertIsNone(self.healer.tier3(self.did, dict(DIAG, confidence=0.5), dict(regret=250.)))
        self.assertIsNone(self.healer.tier3(self.did, dict(DIAG, proposed_prompt_patch=''), dict(regret=250.)))
        self.assertIsNone(self.healer.tier3(self.did, dict(DIAG, gap_type='information'), dict(regret=250.)))
        self.robot.tool.assert_not_called()

    def test_apply_isolates_tier_failures(self):
        self.robot.tool.side_effect = RuntimeError('platform down')
        report = self.healer.apply(self.did, 'run-1', DIAG, dict(gap_type='execution'))
        self.assertIn('error', report['tier1'])  # the mark call failed...
        self.assertEqual(self.box.active_lessons(), [DIAG['proposed_rule']])  # ...but the lesson was stored first
        self.assertIsNone(report['tier2'])  # no recurrence yet, nothing to call
        self.assertIn('error', report['tier3'])

    def test_payload_carries_lessons(self):
        self.sim.lessons = ['Lesson A']
        world = json.loads(self.sim.payload()['world_state'])
        self.assertEqual(world['lessons_learned'], ['Lesson A'])


if __name__ == '__main__':
    unittest.main()
