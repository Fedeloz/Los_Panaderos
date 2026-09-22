import copy
import unittest

from simulator.engine import Simulation
from simulator.policy import DeterministicFleetPolicy
from simulator.session import SimulatorSession


class DeterministicFleetPolicyTests(unittest.TestCase):
    def setUp(self):
        self.policy=DeterministicFleetPolicy()

    def incident(self, scouts=1, extinguishers=1, trucks=1):
        sim=Simulation(fleet_counts=dict(scouts=scouts,extinguishers=extinguishers,trucks=trucks))
        sim.ignite();sim.farmer_call()
        return sim

    def test_orders_cover_every_configured_vehicle_and_apply(self):
        sim=self.incident(scouts=2,extinguishers=2,trucks=2)
        decision=self.policy.decide(sim)
        self.assertEqual({o['drone_id'] for o in decision['scout_orders']},{d['drone_id'] for d in sim.scouts})
        self.assertEqual({o['drone_id'] for o in decision['extinguisher_orders']},{d['drone_id'] for d in sim.extinguishers})
        self.assertEqual({o['truck_id'] for o in decision['truck_orders']},{t['truck_id'] for t in sim.trucks})
        sim.apply(decision,'policy-1',sim.incident_id,sim.tick)

    def test_unconfirmed_smoke_uses_scouting_not_containment(self):
        sim=self.incident()
        decision=self.policy.decide(sim)
        self.assertEqual(decision['extinguisher_orders'][0]['command'],'scout')
        self.assertEqual(decision['scout_orders'][0]['command'],'patrol')
        self.assertEqual(decision['truck_orders'][0]['command'],'attack_sector')

    def test_confirmed_fire_uses_validated_containment_position(self):
        sim=self.incident();sim.drone.update(x=69.,y=43.);sim.observe()
        decision=self.policy.decide(sim);order=decision['extinguisher_orders'][0]
        self.assertEqual(order['command'],'contain')
        self.assertIn((order['target_x'],order['target_y']),{(p['x'],p['y']) for p in sim.safe_drone_positions(sim.drone)})
        sim.apply(decision,'policy-2',sim.incident_id,sim.tick)

    def test_strong_downwind_risk_assigns_physical_warning(self):
        sim=self.incident();sim.set_wind(x=-3,y=0)
        decision=self.policy.decide(sim)
        warnings=[o for o in decision['scout_orders']+decision['extinguisher_orders'] if o['command'].startswith('evacuate_')]
        self.assertTrue(warnings)
        self.assertEqual(len({o['district_id'] for o in warnings}),len(warnings))
        sim.apply(decision,'policy-3',sim.incident_id,sim.tick)

    def test_identical_state_produces_identical_decision(self):
        sim=self.incident(scouts=2,extinguishers=2,trucks=2)
        before=copy.deepcopy(sim.state())
        self.assertEqual(self.policy.decide(sim),self.policy.decide(sim))
        self.assertEqual(before,sim.state())


class CheckpointTests(unittest.TestCase):
    def test_json_round_trip_preserves_future_stochastic_behavior(self):
        sim=Simulation(fleet_counts=dict(scouts=1,extinguishers=2,trucks=2));sim.ignite();sim.farmer_call();sim.step(24)
        import json
        restored=Simulation.restore(json.loads(json.dumps(sim.checkpoint())))
        self.assertEqual(sim.state(),restored.state())
        sim.step(30);restored.step(30)
        self.assertEqual(sim.state(),restored.state())

    def test_invalid_or_incomplete_checkpoint_is_rejected(self):
        for value in ({'version':99,'state':{}},{'version':1,'state':{}}):
            with self.assertRaises(ValueError):Simulation.restore(value)


class SessionTests(unittest.TestCase):
    def test_session_round_trip_and_bounded_catch_up(self):
        import json
        session=SimulatorSession(now_ms=1000);session.action('ignite',now_ms=1000);session.action('call',now_ms=1000)
        restored=SimulatorSession.restore(json.loads(json.dumps(session.checkpoint())))
        self.assertEqual(restored.catch_up(100000),restored.max_catch_up_steps)
        self.assertEqual(restored.sim.tick,restored.max_catch_up_steps)
        self.assertGreater(restored.decisions,1)

    def test_paused_session_does_no_background_work(self):
        session=SimulatorSession(now_ms=1000);session.action('ignite',now_ms=1000)
        self.assertEqual(session.catch_up(100000),0)
        self.assertEqual(session.sim.tick,0)

    def test_two_sessions_are_isolated(self):
        first=SimulatorSession(now_ms=0);second=SimulatorSession(now_ms=0)
        first.action('place_fire',dict(x=30,y=20),now_ms=0);first.action('ignite',now_ms=0)
        self.assertNotEqual(first.sim.incident_id,second.sim.incident_id)
        self.assertTrue(first.sim.ignited);self.assertFalse(second.sim.ignited)


if __name__ == '__main__':
    unittest.main()
