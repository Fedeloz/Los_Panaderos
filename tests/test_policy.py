import copy
import math
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
        waypoints=decision['scout_orders'][0]['waypoints']
        self.assertGreaterEqual(len(waypoints),3)
        self.assertTrue(any(math.dist(point,sim.report)>4 for point in waypoints))
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
        self.assertGreater(restored.decision_count,1)
        self.assertTrue(all(item['status']=='accepted' for item in restored.decision_log))

    def test_farmer_call_dispatches_and_moves_the_scout(self):
        session=SimulatorSession(now_ms=0);session.action('ignite',now_ms=0)
        start=(session.sim.scouts[0]['x'],session.sim.scouts[0]['y'])
        state=session.action('call',now_ms=0)
        scout_order=state['decisions'][-1]['orders']['scouts'][0]
        self.assertEqual(scout_order['command'],'patrol')
        self.assertEqual(session.sim.scouts[0]['mode'],'patrol')
        session.action('step',now_ms=0)
        self.assertNotEqual((session.sim.scouts[0]['x'],session.sim.scouts[0]['y']),start)
        self.assertEqual(session.sim.scouts[0]['status'],'en_route')

    def test_paused_session_does_no_background_work(self):
        session=SimulatorSession(now_ms=1000);session.action('ignite',now_ms=1000)
        self.assertEqual(session.catch_up(100000),0)
        self.assertEqual(session.sim.tick,0)

    def test_two_sessions_are_isolated(self):
        first=SimulatorSession(now_ms=0);second=SimulatorSession(now_ms=0)
        first.action('place_fire',dict(x=30,y=20),now_ms=0);first.action('ignite',now_ms=0)
        self.assertNotEqual(first.sim.incident_id,second.sim.incident_id)
        self.assertTrue(first.sim.ignited);self.assertFalse(second.sim.ignited)

    def test_rejected_order_is_persistable_and_pauses_the_session(self):
        class InvalidPolicy:
            def decide(self,sim):return dict(mission='Invalid',reason='test',extinguisher_orders=[],scout_orders=[],truck_orders=[])
        session=SimulatorSession(policy=InvalidPolicy(),now_ms=0)
        session.action('ignite',now_ms=0);state=session.action('call',now_ms=0)
        self.assertFalse(state['running']);self.assertFalse(state['auto'])
        self.assertTrue(state['error']);self.assertEqual(state['decisions'][-1]['status'],'rejected')
        self.assertEqual(state['decisions'][-1]['trigger'],'farmer_call')
        self.assertTrue(any(entry['source']=='policy' for entry in state['history']))
        restored=SimulatorSession.restore(session.checkpoint(),InvalidPolicy())
        self.assertEqual(restored.decision_log,session.decision_log)

    def test_unexpected_action_failure_rolls_back_all_mutations(self):
        class BrokenPolicy:
            def decide(self,sim):raise RuntimeError('policy crashed')
        session=SimulatorSession(policy=BrokenPolicy(),now_ms=0);session.action('ignite',now_ms=0)
        before=session.checkpoint()
        with self.assertRaisesRegex(RuntimeError,'policy crashed'):session.action('call',now_ms=0)
        self.assertEqual(session.checkpoint(),before)

    def test_step_failure_is_recorded_instead_of_escaping(self):
        class BrokenPolicy:
            def decide(self,sim):raise RuntimeError('step policy crashed')
        session=SimulatorSession(policy=BrokenPolicy(),now_ms=0);session.sim.ignite();session.sim.farmer_call()
        session.running=session.auto=True;session.next_decision=0
        session.step_once()
        self.assertFalse(session.running);self.assertEqual(session.decision_log[-1]['status'],'rejected')
        self.assertIn('step policy crashed',session.error)


if __name__ == '__main__':
    unittest.main()
