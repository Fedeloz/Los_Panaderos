import copy
import unittest

from simulator.engine import Simulation
from simulator import oracle


def mission(ext=None, truck=None, scout=None):
    return dict(primary_command=(ext or [{}])[0].get('command', 'hold'), mission='m', drone_reason='r',
                extinguisher_orders=ext or [], scout_orders=scout or [], truck_orders=truck or [])


def hold(sim):
    return mission([dict(drone_id='drone-1', command='hold', target_x=int(sim.drone['x']), target_y=int(sim.drone['y']), district_id='', reason='r')],
                   [dict(truck_id='engine-1', command='continue', reason='r')])


class OracleTests(unittest.TestCase):
    def setUp(self):
        self.sim = Simulation(fleet_counts=dict(scouts=0, extinguishers=1, trucks=1))
        self.sim.set_wind(x=0, y=-2.5)
        self.sim.ignite(); self.sim.farmer_call()

    def test_candidates_are_valid_and_include_evacuations(self):
        options = dict(oracle.vehicle_options(self.sim))
        self.assertTrue(any(o['command'] == 'evacuate_farm' for o in options['extinguisher_orders']))
        self.assertTrue(any(o['command'] == 'attack_sector' for o in options['truck_orders']))
        cands, _ = oracle.candidates(self.sim)
        self.assertGreaterEqual(len(cands), 2)
        for c in cands:
            s = copy.deepcopy(self.sim)
            s.apply(c, 'cmd', s.incident_id, s.tick)  # must not raise
        self.assertEqual(self.sim.tick, 0)  # candidate generation never mutates the snapshot

    def test_deterministic_cost(self):
        a = oracle.evaluate(self.sim, hold(self.sim), horizon=4, seeds=(9,))
        b = oracle.evaluate(self.sim, hold(self.sim), horizon=4, seeds=(9,))
        self.assertEqual(a['actual_cost'], b['actual_cost'])
        self.assertEqual(a['best_cost'], b['best_cost'])

    def test_evacuation_beats_hold_when_fire_nears_farm(self):
        fx, fy = self.sim.farm
        s = self.sim
        for x, y in [(fx-3, fy), (fx-2, fy), (fx-2, fy+1), (fx-1, fy)]:
            s.cells[y][x].update(heat=.9, age=0, fuel=1., terrain='field')
        s.observe()
        result = oracle.evaluate(s, hold(s), horizon=12, seeds=(9,))
        self.assertGreater(result['regret'], 0)
        best = result['best_decision']
        self.assertTrue(any(o['command'] == 'evacuate_farm' for o in best['extinguisher_orders']))
        self.assertGreaterEqual(result['actual_rank'], 2)

    def test_hidden_fire_is_reported(self):
        s = self.sim
        s.cells[23][30].update(heat=.5, age=0)  # far from every sensor: hidden
        result = oracle.evaluate(s, hold(s), horizon=4, seeds=(9,))
        self.assertIn([30, 23], result['hidden_fire_at_decision'])
        if result['regret'] is not None and result['regret'] > oracle.JUDGEMENT_THRESHOLD:
            self.assertEqual(result['gap_type'], 'information')

    def test_invalid_actual_is_execution_gap(self):
        bad = mission([dict(drone_id='drone-1', command='contain', target_x=5, target_y=5, district_id='', reason='r')],
                      [dict(truck_id='engine-1', command='continue', reason='r')])
        result = oracle.evaluate(self.sim, bad, horizon=2, seeds=(9,))
        self.assertFalse(result['actual_valid'])
        self.assertEqual(result['gap_type'], 'execution')
        self.assertIsNone(result['regret'])

    def test_loop_signal_is_execution_gap(self):
        result = oracle.evaluate(self.sim, hold(self.sim), signals=dict(loop_detected=True), horizon=2, seeds=(9,))
        self.assertEqual(result['gap_type'], 'execution')

    def test_time_budget_truncates(self):
        result = oracle.evaluate(self.sim, hold(self.sim), horizon=2, seeds=(9,), time_budget=0.0)
        self.assertTrue(result['truncated'])
        self.assertIn('actual_cost', result)


if __name__ == '__main__':
    unittest.main()
