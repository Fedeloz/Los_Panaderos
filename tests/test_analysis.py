import json
import time
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import MagicMock, patch

from simulator.analysis import Analyst
from simulator.blackbox import BlackBox
from simulator.engine import Simulation


def hold(sim):
    return dict(primary_command='hold', mission='m', drone_reason='r',
                extinguisher_orders=[dict(drone_id=d['drone_id'], command='hold', target_x=int(d['x']), target_y=int(d['y']), district_id='', reason='r') for d in sim.extinguishers],
                scout_orders=[dict(drone_id=s['drone_id'], command='hold', waypoints=[], reason='r') for s in sim.scouts],
                truck_orders=[dict(truck_id=t['truck_id'], command='continue', reason='r') for t in sim.trucks])


STEPS = [dict(agent='Drone Agent', timestamp='2026-09-20T00:00:00Z', reasoning='r', action='report_to_central', arguments={}, outcome={}),
         dict(agent='Drone Agent', timestamp='2026-09-20T00:00:05Z', reasoning='DONE', action='_terminate', arguments={}, outcome='')]
DIAG = dict(gap_type='judgement', root_cause='x', evidence_step_indexes=[0], prompt_section='s',
            proposed_rule='Prefer evacuation under strong wind.', proposed_prompt_patch='', confidence=0.8)


class AnalystTests(unittest.TestCase):
    def test_analyse_runs_pipeline_and_stores_everything(self):
        with TemporaryDirectory() as tmp:
            box = BlackBox(Path(tmp)/'bb.sqlite')
            sim = Simulation(fleet_counts=dict(scouts=0, extinguishers=1, trucks=1)); sim.ignite(); sim.farmer_call()
            payload = sim.payload('farmer_call')
            did = box.record_decision(sim, payload, 'run-1', 1.0, hold(sim), 'applied')
            lessons, logs = [], []
            analyst = Analyst(box, MagicMock(), lambda l: lessons.extend(l), lambda *a, **k: logs.append((a, k)))
            with patch('simulator.analysis.telemetry.harvest', return_value=STEPS), \
                 patch('simulator.analysis.reflection.reflect', return_value=('texto', DIAG, 'run-r')), \
                 patch('simulator.analysis.oracle.evaluate', return_value=dict(regret=150., gap_type='judgement', actual_cost=1., best_cost=0.)), \
                 patch('simulator.analysis.Healer.apply', return_value=dict(tier1=dict(annotation='incorrect'))) as heal:
                out = analyst.analyse(did, payload, 'run-1', '## Drone Agent\n- Output ID: 11111111-1111-1111-1111-111111111111\n- Status: succeeded')
            row = box.list_decisions(sim.incident_id)[0]
            self.assertEqual(json.loads(row['result_json'])['regret'], 150.)
            self.assertEqual(row['reflection'], 'texto')
            self.assertEqual(json.loads(row['signals_json'])['terminated_cleanly'], True)
            self.assertEqual(out['diagnosis']['gap_type'], 'judgement')
            self.assertEqual(heal.call_args.args[0], did)
            self.assertTrue(any(a[0] == 'post-mortem' for a, _ in logs))
            self.assertEqual(lessons, box.active_lessons(5))
            box.close()

    def test_failures_are_logged_not_raised(self):
        with TemporaryDirectory() as tmp:
            box = BlackBox(Path(tmp)/'bb.sqlite')
            sim = Simulation(); sim.ignite(); sim.farmer_call()
            did = box.record_decision(sim, sim.payload(), 'run-1', 1.0, hold(sim), 'applied')
            logs = []
            analyst = Analyst(box, MagicMock(), lambda l: None, lambda *a, **k: logs.append(a))
            with patch('simulator.analysis.telemetry.harvest', side_effect=RuntimeError('boom')), \
                 patch('simulator.analysis.oracle.evaluate', return_value=dict(regret=0., gap_type='none')), \
                 patch('simulator.analysis.reflection.reflect', side_effect=RuntimeError('no platform')):
                out = analyst.analyse(did, sim.payload(), 'run-1', '')
            self.assertIn('telemetry_error', out)
            self.assertIn('reflection_error', out)
            self.assertIn('evaluation', out)
            self.assertNotIn('healing', out)
            self.assertEqual(sum(1 for a in logs if a[0] == 'system'), 2)
            box.close()

    def test_rejected_decision_is_execution_gap(self):
        with TemporaryDirectory() as tmp:
            box = BlackBox(Path(tmp)/'bb.sqlite')
            sim = Simulation(); sim.ignite(); sim.farmer_call()
            did = box.record_decision(sim, sim.payload(), 'run-1', 1.0, hold(sim), 'rejected', 'Target outside map.')
            analyst = Analyst(box, MagicMock(), lambda l: None, lambda *a, **k: None)
            with patch('simulator.analysis.telemetry.harvest', return_value=[]), \
                 patch('simulator.analysis.oracle.evaluate', return_value=dict(regret=0., gap_type='none')), \
                 patch('simulator.analysis.reflection.reflect', side_effect=RuntimeError('skip')):
                out = analyst.analyse(did, sim.payload(), 'run-1', '')
            self.assertEqual(out['evaluation']['gap_type'], 'execution')
            box.close()


class ControllerHookTests(unittest.TestCase):
    def _controller(self, tmp):
        from simulator.server import Controller
        with patch('simulator.server.RUNTIME', Path(tmp)):
            c = Controller()
        c.stop.set()
        c.sim.ignite(); c.sim.farmer_call()
        return c

    def test_decide_records_and_schedules_analysis(self):
        with TemporaryDirectory() as tmp:
            c = self._controller(tmp)
            try:
                c.robot.last_run_id = 'run-x'; c.robot.last_listing = 'listing'
                with patch.object(c.robot, 'decide', return_value=(hold(c.sim), 'evidence')), patch.object(c.analyst, 'analyse', return_value={}) as an:
                    c._decide(c.sim.payload('farmer_call'), c.sim.tick)
                    deadline = time.monotonic()+3
                    while not an.called and time.monotonic() < deadline:
                        time.sleep(.01)
                rows = c.box.list_decisions(c.sim.incident_id)
                self.assertEqual(len(rows), 1)
                self.assertEqual(rows[0]['status'], 'applied')
                self.assertEqual(rows[0]['run_id'], 'run-x')
                self.assertTrue(an.called)
                self.assertEqual(an.call_args.args[2], 'run-x')
                pm = c.postmortem()
                self.assertEqual(pm['incident_id'], c.sim.incident_id)
                self.assertEqual(len(pm['decisions']), 1)
                self.assertEqual(pm['decisions'][0]['decision']['primary_command'], 'hold')
            finally:
                c.robot.close(); c.box.close()

    def test_rejected_decision_recorded_as_rejected(self):
        with TemporaryDirectory() as tmp:
            c = self._controller(tmp)
            try:
                bad = hold(c.sim); bad['extinguisher_orders'][0].update(command='contain', target_x=65, target_y=43)
                with patch.object(c.robot, 'decide', return_value=(bad, 'e')), patch.object(c, 'request_decision'), patch.object(c.analyst, 'analyse', return_value={}):
                    c._decide(c.sim.payload(), c.sim.tick)
                row = c.box.list_decisions(c.sim.incident_id)[0]
                self.assertEqual(row['status'], 'rejected')
                self.assertTrue(row['reject_reason'])
            finally:
                c.robot.close(); c.box.close()

    def test_reset_keeps_lessons_and_finishes_outcome(self):
        with TemporaryDirectory() as tmp:
            c = self._controller(tmp)
            try:
                c.box.add_lesson('Keep three cells from fire.', None)
                c.robot.last_run_id = 'run-x'
                with patch.object(c.robot, 'decide', return_value=(hold(c.sim), 'e')), patch.object(c.analyst, 'analyse', return_value={}):
                    c._decide(c.sim.payload(), c.sim.tick)
                did = c.last_decision_id
                c.action('reset', {})
                self.assertIsNone(c.last_decision_id)
                self.assertEqual(c.sim.lessons, ['Keep three cells from fire.'])
                self.assertIsNotNone(c.box.decision(did)['outcome_json'])
            finally:
                c.robot.close(); c.box.close()


if __name__ == '__main__':
    unittest.main()
