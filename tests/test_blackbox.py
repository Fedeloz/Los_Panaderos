import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from simulator.engine import Simulation
from simulator.blackbox import BlackBox


def decision():
    return dict(primary_command='hold', mission='m', drone_reason='r',
                extinguisher_orders=[dict(drone_id='drone-1', command='hold', target_x=12, target_y=32, district_id='', reason='r')],
                scout_orders=[], truck_orders=[dict(truck_id='engine-1', command='continue', reason='r')])


class BlackBoxTests(unittest.TestCase):
    def setUp(self):
        self.tmp = TemporaryDirectory()
        self.box = BlackBox(Path(self.tmp.name)/'bb.sqlite')
        self.sim = Simulation(fleet_counts=dict(scouts=0, extinguishers=1, trucks=1))
        self.sim.ignite(); self.sim.farmer_call()

    def tearDown(self):
        self.box.close(); self.tmp.cleanup()

    def test_record_restore_round_trip(self):
        payload = self.sim.payload('farmer_call')
        did = self.box.record_decision(self.sim, payload, 'run-1', 1.5, decision(), 'applied')
        restored = self.box.load_snapshot(did)
        self.assertEqual(restored.tick, self.sim.tick)
        self.assertEqual(restored.incident_id, self.sim.incident_id)
        self.assertEqual(restored.state()['cells'], self.sim.state()['cells'])
        row = self.box.decision(did)
        self.assertEqual(row['run_id'], 'run-1')
        self.assertEqual(row['status'], 'applied')
        self.assertEqual(json.loads(row['payload_json'])['event_type'], 'farmer_call')

    def test_outcome_deltas_after_steps(self):
        did = self.box.record_decision(self.sim, self.sim.payload(), 'run-1', 1.0, decision(), 'applied')
        self.sim.step(20)
        out = self.box.finish_outcome(did, self.sim)
        self.assertEqual(out['elapsed_steps'], 20)
        self.assertGreaterEqual(out['newly_burned_cells'], 1)
        self.assertIn('people', out)
        self.assertIn('farm', out['people'])

    def test_rejected_decision_keeps_reason(self):
        did = self.box.record_decision(self.sim, self.sim.payload(), 'run-2', 1.0, decision(), 'rejected', 'Target outside map.')
        self.assertEqual(self.box.decision(did)['reject_reason'], 'Target outside map.')

    def test_lessons_dedupe_and_cap(self):
        for i in range(7):
            self.box.add_lesson(f'Rule {i}', None)
        self.box.add_lesson('rule 6', None)  # case/whitespace duplicate
        lessons = self.box.active_lessons(5)
        self.assertEqual(len(lessons), 5)
        self.assertEqual(lessons[0], 'rule 6')
        self.assertNotIn('Rule 6', lessons)

    def test_list_decisions_by_incident(self):
        self.box.record_decision(self.sim, self.sim.payload(), 'run-1', 1.0, decision(), 'applied')
        other = Simulation(); other.ignite(); other.farmer_call()
        self.box.record_decision(other, other.payload(), 'run-9', 1.0, decision(), 'applied')
        rows = self.box.list_decisions(self.sim.incident_id)
        self.assertEqual([r['run_id'] for r in rows], ['run-1'])


if __name__ == '__main__':
    unittest.main()
