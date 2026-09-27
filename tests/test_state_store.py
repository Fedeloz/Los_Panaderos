import json
import unittest
from unittest.mock import patch

from simulator.engine import Simulation
from simulator.operational_state import build_state, danger_level


class DangerHeuristicTests(unittest.TestCase):
    @staticmethod
    def measure(distance,downwind):
        return [dict(source=[0,0],distance=distance,directional_cosine=0.9 if downwind else -0.5,downwind_sector=downwind)]

    def test_levels_by_distance_and_wind(self):
        group=dict(status='unwarned')
        self.assertEqual(danger_level(group,[],True,1),'none')
        self.assertEqual(danger_level(group,self.measure(25,False),True,1),'watch')
        self.assertEqual(danger_level(group,self.measure(25,True),True,1),'warning')
        self.assertEqual(danger_level(group,self.measure(14,True),True,1),'critical')

    def test_unconfirmed_report_caps_critical_risk(self):
        group=dict(status='unwarned')
        self.assertEqual(danger_level(group,self.measure(5,False),False,1),'warning')
        self.assertEqual(danger_level(group,self.measure(14,True),False,2.5),'critical')

    def test_population_status_overrides_distance(self):
        self.assertEqual(danger_level(dict(status='burnt'),[],True,0),'critical')
        self.assertEqual(danger_level(dict(status='evacuating'),[],True,0),'warning')


class BuildStateTests(unittest.TestCase):
    def test_state_document_is_serializable_and_contains_operational_data(self):
        with patch.dict('os.environ',{'DEMO_TOWN_PHONE':'+34611'}),patch('simulator.contacts.load_env'):
            sim=Simulation();sim.set_wind(x=-2.0,y=0.5);sim.ignite();sim.farmer_call()
            state=build_state(sim)
        self.assertEqual(state['incident_id'],sim.incident_id)
        self.assertEqual({item['district_id'] for item in state['districts']},set(sim.groups))
        self.assertIn('fire',state);self.assertIn('vehicles',state);self.assertIn('contacts',state)
        json.dumps(state)

    def test_field_events_flow_into_the_operational_view(self):
        sim=Simulation(fleet_counts=dict(scouts=1,extinguishers=1,trucks=1));sim.ignite();sim.farmer_call()
        sim.scouts[0].update(mode='patrol',target=[73,41],waypoints=[],status='en_route')
        for _ in range(30):
            sim.step()
            if {'fire_detected','deployed'}<={event['kind'] for event in sim.event_log}:break
        state=build_state(sim)
        self.assertTrue(state['fire']['confirmed'])
        self.assertEqual(state['vehicles']['engine-1']['role'],'truck')
        self.assertTrue({'fire_detected','deployed'}<={event['kind'] for event in state['events']})


class ControllerAdapterTests(unittest.TestCase):
    def test_controller_delegates_to_the_shared_session_core(self):
        from simulator.server import Controller
        from simulator.session import SimulatorSession
        controller=Controller();controller.stop.set()
        try:
            self.assertIsInstance(controller.session,SimulatorSession)
            controller.action('ignite',{'action':'ignite'})
            state=controller.action('call',{'action':'call'})
            self.assertEqual(state['decisions'][-1]['status'],'accepted')
            self.assertEqual(controller.sim.dispatch['decision'],'deterministic_fleet_policy')
            self.assertTrue(controller.shared_snapshot()['document'])
        finally:controller.stop.set()


if __name__=='__main__':
    unittest.main()
