"""Acceptance test for the first self-healing reference case.

Run 58a5e3dc (development v25, 2026-09-19): the Scout Agent called
report_scout_plan twelve times over four minutes because the tool returned an
empty result that it read as failure. Offline, from the recorded telemetry, the
loop must classify as an execution gap and the healing tiers must produce a
lesson, a critical annotation and a staged patch proposal.
"""
import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import MagicMock, patch

from simulator import oracle, telemetry
from simulator.blackbox import BlackBox
from simulator.engine import Simulation
from simulator.healing import Healer

FIXTURES = Path(__file__).parent/'fixtures'
RUN = json.loads((FIXTURES/'scout_loop_run.json').read_text())
DIAGNOSIS = json.loads((FIXTURES/'reflection_reference_diagnosis.json').read_text())['diagnosis']


def scenario():
    sim = Simulation(fleet_counts=dict(scouts=1, extinguishers=0, trucks=1))
    sim.place_fire(44, 19); sim.set_wind(x=1, y=0); sim.ignite(); sim.farmer_call(); sim.step(5)
    return sim


ACTUAL = dict(primary_command='hold', mission='Confirm the farmer report from stand-off cells', drone_reason='r', extinguisher_orders=[],
              truck_orders=[dict(truck_id='engine-1', command='continue', reason='r')],
              scout_orders=[dict(drone_id='scout-1', command='patrol', waypoints=[[44, 22], [47, 21], [47, 18], [48, 19]], reason='Approach through validated stand-off cells')])


class ReferenceCaseTests(unittest.TestCase):
    def test_scout_loop_is_detected_and_graded_as_execution_gap(self):
        steps = telemetry.parse_events('Scout Agent', RUN)
        sim = scenario()
        signals = telemetry.signals(steps, sim.payload('farmer_call'))
        self.assertTrue(signals['loop_detected'])
        self.assertEqual(signals['repeated_tool_calls'], {'Scout Agent': 11})
        self.assertGreater(signals['agent_seconds']['Scout Agent'], 240)
        self.assertEqual(signals['contradictions'], [])
        result = oracle.evaluate(sim, ACTUAL, signals, horizon=8, seeds=(9,))
        self.assertTrue(result['actual_valid'])
        self.assertEqual(result['gap_type'], 'execution')
        self.assertIn([44, 19], result['hidden_fire_at_decision'])  # the fire the agent could not see

    def test_live_diagnosis_drives_the_healing_tiers(self):
        # The recorded live diagnosis (run 90242a22) names the tool response as root cause.
        self.assertEqual(DIAGNOSIS['gap_type'], 'execution')
        self.assertEqual(DIAGNOSIS['prompt_section'], 'ONE-SHOT TASK')
        self.assertIn('report_scout_plan', DIAGNOSIS['root_cause'])
        self.assertGreaterEqual(DIAGNOSIS['confidence'], 0.7)
        with TemporaryDirectory() as tmp:
            box = BlackBox(Path(tmp)/'bb.sqlite')
            sim = scenario()
            did = box.record_decision(sim, sim.payload('farmer_call'), '58a5e3dc-08ea-407f-9658-ba2025deedd7', 285.4, ACTUAL, 'applied')
            robot = MagicMock(); robot.text = lambda r: r['content'][0]['text']; robot.tool.return_value = {'content': [{'text': ''}]}
            healer = Healer(box, robot, 'wf', tmp)
            tier1 = healer.tier1(did, '58a5e3dc-08ea-407f-9658-ba2025deedd7', DIAGNOSIS, dict(gap_type='execution'))
            self.assertEqual(tier1['annotation'], 'critical')
            self.assertEqual(box.active_lessons(), [DIAGNOSIS['proposed_rule']])
            sim.lessons = box.active_lessons()
            self.assertIn('report_scout_plan', json.loads(sim.payload()['world_state'])['lessons_learned'][0])
            # Tier 3 is eligible (confidence 0.98 with a patch) but never touches development or production.
            with patch.object(healer, '_workflow', return_value=(None, [])):
                out = healer.tier3(did, DIAGNOSIS, dict(gap_type='execution'))
            self.assertEqual(out.get('skipped'), 'fork failed')
            self.assertFalse(any(c.args[1].get('action') == 'publish' for c in robot.tool.call_args_list if c.args[0] == 'manage_versions'))
            box.close()


if __name__ == '__main__':
    unittest.main()
