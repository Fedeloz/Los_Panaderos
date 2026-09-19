import json
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest.mock import patch

from simulator.engine import Simulation
from simulator.state_store import StateStore, build_state, danger_level


class DangerHeuristicTests(unittest.TestCase):
    def measure(self, distance, downwind):
        return [dict(source=[0, 0], distance=distance, directional_cosine=0.9 if downwind else -0.5, downwind_sector=downwind)]

    def test_levels_by_distance_and_wind(self):
        g = dict(status='unwarned')
        self.assertEqual(danger_level(g, [], True, 1), 'none')
        self.assertEqual(danger_level(g, self.measure(60, False), True, 1), 'none')
        self.assertEqual(danger_level(g, self.measure(60, True), True, 1), 'watch')
        self.assertEqual(danger_level(g, self.measure(25, False), True, 1), 'watch')
        self.assertEqual(danger_level(g, self.measure(25, True), True, 1), 'warning')
        self.assertEqual(danger_level(g, self.measure(14, False), True, 1), 'warning')
        self.assertEqual(danger_level(g, self.measure(14, True), True, 1), 'critical')
        self.assertEqual(danger_level(g, self.measure(5, False), True, 1), 'critical')

    def test_unconfirmed_report_caps_at_warning_unless_strong_downwind(self):
        g = dict(status='unwarned')
        self.assertEqual(danger_level(g, self.measure(5, False), False, 1), 'warning')
        self.assertEqual(danger_level(g, self.measure(14, True), False, 1), 'warning')
        self.assertEqual(danger_level(g, self.measure(14, True), False, 2.5), 'critical')

    def test_status_overrides(self):
        self.assertEqual(danger_level(dict(status='burnt'), [], True, 0), 'critical')
        self.assertEqual(danger_level(dict(status='evacuating'), [], True, 0), 'warning')
        self.assertEqual(danger_level(dict(status='evacuating'), self.measure(60, False), True, 0), 'warning')


class BuildStateTests(unittest.TestCase):
    def test_state_document_shape(self):
        with patch.dict('os.environ', {'DEMO_TOWN_PHONE': '+34611'}), patch('simulator.contacts.load_env'):
            s = Simulation(); s.set_wind(x=-2.0, y=0.5); s.ignite(); s.farmer_call()
            s.apply_communications([dict(kind='zone_alert', district_id='farm', action='evacuate', information='go north', status='sent')])
            state = build_state(s)
        self.assertEqual(state['incident_id'], s.incident_id)
        self.assertEqual({d['district_id'] for d in state['districts']}, set(s.groups))
        farm = next(d for d in state['districts'] if d['district_id'] == 'farm')
        self.assertEqual(farm['status'], 'evacuating'); self.assertIn(farm['auto_danger_level'], ('warning', 'critical'))
        self.assertIn('Cruce de la Dehesa', farm['auto_advice'])
        self.assertIn('el fuego no puede llegar', farm['auto_advice'])
        self.assertIn('recogerá al pasar', farm['auto_advice'])
        self.assertTrue(farm['rescue_plan'])
        town = next(d for d in state['districts'] if d['district_id'] == 'town_rosales')
        self.assertEqual(town['auto_danger_level'], 'watch')  # downwind but ~77 cells away, unconfirmed report
        self.assertIn('fuera de peligro', town['auto_advice'].lower().replace('no hay peligro', 'fuera de peligro'))
        self.assertFalse(state['fire']['confirmed']); self.assertIn('Humo reportado', state['fire']['front'])
        carmen = next(p for p in state['contacts']['people'] if p['contact_name'] == 'Carmen Ortega')
        self.assertEqual(carmen['phone_number'], '+34611')
        self.assertEqual(len(state['communications_sent']), 1)
        json.dumps(state)  # serialisable


class FieldEventTests(unittest.TestCase):
    def run_until(self, sim, kinds, limit=60):
        seen = []
        for _ in range(limit):
            sim.step()
            seen += sim.drain_events()
            if kinds <= {e['kind'] for e in seen}:
                break
        return seen

    def test_scout_first_sighting_and_truck_deployment_emit_events_once(self):
        s = Simulation(fleet_counts=dict(scouts=1, extinguishers=1, trucks=1)); s.ignite(); s.farmer_call()
        s.scouts[0].update(mode='patrol', target=[73, 41], waypoints=[], status='en_route')
        events = self.run_until(s, {'fire_detected', 'deployed'}, limit=30)
        kinds = [e['kind'] for e in events]
        self.assertEqual(kinds.count('deployed'), 1); self.assertEqual(kinds.count('fire_detected'), 1)
        deployed = next(e for e in events if e['kind'] == 'deployed')
        self.assertEqual((deployed['vehicle_id'], deployed['status'], deployed['incident_id']), ('engine-1', 'en_route', s.incident_id))
        self.assertEqual(deployed['sim_time'], s.truck['mobilized_at'])
        fire = next(e for e in events if e['kind'] == 'fire_detected')
        self.assertEqual(fire['source'], 'scout-1'); self.assertEqual(fire['district_id'], 'farm')
        self.assertTrue(s.burning(s.cells[fire['y']][fire['x']]))
        self.assertEqual(s.pending_events, [])  # drained
        self.assertEqual([e['kind'] for e in s.state()['events']], kinds)
        # Later ticks never re-emit the first sighting for the same drone.
        more = self.run_until(s, {'never'}, limit=5)
        self.assertNotIn('fire_detected', [e['kind'] for e in more])

    def test_truck_arrival_and_containing_then_returning(self):
        s = Simulation(fleet_counts=dict(scouts=0, extinguishers=1, trucks=1)); s.ignite(); s.farmer_call()
        events = self.run_until(s, {'containing'}, limit=80)
        kinds = [e['kind'] for e in events]
        self.assertEqual([k for k in kinds if k in ('deployed', 'arrived', 'containing')], ['deployed', 'arrived', 'containing'])
        for row in s.cells:
            for c in row:
                c.update(heat=0, fuel=0)
        s.update_completion()
        kinds = [e['kind'] for e in s.drain_events()]
        self.assertIn('returning', kinds); self.assertIn('fire_out', kinds)

    def test_build_state_carries_vehicles_detections_and_events(self):
        s = Simulation(fleet_counts=dict(scouts=1, extinguishers=1, trucks=1)); s.ignite(); s.farmer_call()
        s.scouts[0].update(mode='patrol', target=[73, 41], waypoints=[], status='en_route')
        self.run_until(s, {'fire_detected', 'deployed'}, limit=30)
        state = build_state(s)
        self.assertTrue(state['fire']['confirmed']); self.assertEqual(state['fire']['detections'][0]['source'], 'scout-1')
        self.assertEqual(state['vehicles']['engine-1']['role'], 'truck'); self.assertIn(state['vehicles']['engine-1']['status'], ('en_route', 'on_scene', 'suppressing'))
        self.assertEqual({e['kind'] for e in state['events']}, {'fire_detected', 'deployed'})
        json.dumps(state)


class FakeApi(BaseHTTPRequestHandler):
    store = {}
    calls = []

    def _send(self, code, body):
        data = json.dumps(body).encode(); self.send_response(code); self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data))); self.end_headers(); self.wfile.write(data)

    def do_PATCH(self):
        self.do_PUT()

    def do_POST(self):
        FakeApi.calls.append(('POST', self.path, self.headers.get('Authorization')))
        body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        FakeApi.store.setdefault('events', []).extend(body.get('events', []))
        self._send(200, {'accepted': len(body.get('events', []))})

    def do_PUT(self):
        FakeApi.calls.append((self.command, self.path, self.headers.get('Authorization')))
        if self.headers.get('Authorization') != 'Bearer secret':
            return self._send(401, {'error': 'Unauthorized'})
        body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        FakeApi.store[self.path.rsplit('/', 1)[1]] = body
        self._send(200, body)

    def do_GET(self):
        FakeApi.calls.append(('GET', self.path, None))
        if self.path.startswith('/lookup'):
            return self._send(200, {'found': True, 'guidance': 'TRANQUILIZAR', 'query': self.path})
        self._send(200, FakeApi.store.get(self.path.rsplit('/', 1)[1], {}))

    def log_message(self, *_):
        pass


class StateStoreClientTests(unittest.TestCase):
    def setUp(self):
        FakeApi.store.clear(); FakeApi.calls.clear()
        self.server = ThreadingHTTPServer(('127.0.0.1', 0), FakeApi)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.url = f'http://127.0.0.1:{self.server.server_address[1]}'

    def tearDown(self):
        self.server.shutdown(); self.server.server_close()

    def test_disabled_without_config(self):
        with patch.dict('os.environ', {'STATE_API_URL': '', 'STATE_API_TOKEN': ''}), patch('simulator.state_store.load_env'):
            store = StateStore()
        self.assertFalse(store.enabled)
        self.assertFalse(store.publish({'incident_id': 'x', 'sim_time': 0}, wait=True))
        self.assertEqual(FakeApi.calls, [])

    def test_publish_dedups_and_lookup(self):
        store = StateStore(self.url, 'secret')
        state = {'incident_id': 'abc', 'sim_time': 1, 'districts': []}
        self.assertTrue(store.publish(state, wait=True))
        self.assertFalse(store.publish(dict(state, updated_at='later'), wait=True))
        self.assertEqual(FakeApi.store['abc']['sim_time'], 1)
        self.assertEqual(store.status()['published'], 1); self.assertIsNone(store.status()['error'])
        self.assertEqual(store.get('abc')['incident_id'], 'abc')
        self.assertEqual(store.lookup(phone='+34 611')['guidance'], 'TRANQUILIZAR')
        self.assertIn('phone=%2B34%20611', FakeApi.calls[-1][1])

    def test_coalesces_rapid_ticks(self):
        store = StateStore(self.url, 'secret', min_interval=0.3)
        for tick in range(1, 6):
            store.publish({'incident_id': 'abc', 'sim_time': tick})
        import time; time.sleep(0.8)
        self.assertEqual(FakeApi.store['abc']['sim_time'], 5)
        self.assertLessEqual(len([c for c in FakeApi.calls if c[0] in ('PUT','PATCH')]), 2)

    def test_auth_error_is_reported_not_raised(self):
        store = StateStore(self.url, 'wrong')
        store.publish({'incident_id': 'abc', 'sim_time': 1}, wait=True)
        self.assertIn('401', store.status()['error'])

    def test_events_batched_before_state_and_never_dropped_by_coalescing(self):
        store = StateStore(self.url, 'secret', min_interval=0.3)
        store.publish({'incident_id': 'abc', 'sim_time': 1}, wait=True)
        # Rapid ticks: same-looking state, but events queued in between must still be sent.
        store.publish({'incident_id': 'abc', 'sim_time': 2}, events=[dict(kind='fire_detected', source='scout-1', incident_id='abc', sim_time=2)])
        store.publish({'incident_id': 'abc', 'sim_time': 3}, events=[dict(kind='deployed', source='engine-1', incident_id='abc', sim_time=3)])
        import time; time.sleep(0.8)
        self.assertEqual([e['kind'] for e in FakeApi.store['events']], ['fire_detected', 'deployed'])
        writes = [c for c in FakeApi.calls if c[0] in ('POST', 'PATCH', 'PUT')]
        self.assertEqual([c[0] for c in writes][-2:], ['POST', 'PATCH'])  # events land before the state they belong to
        self.assertEqual(writes[-2][1], '/state/abc/events')
        self.assertEqual(store.status()['events_sent'], 2)

    def test_events_only_publish_when_state_unchanged(self):
        store = StateStore(self.url, 'secret')
        state = {'incident_id': 'abc', 'sim_time': 1}
        store.publish(state, wait=True)
        self.assertTrue(store.publish(state, wait=True, events=[dict(kind='arrived', source='engine-1', incident_id='abc')]))
        self.assertEqual(FakeApi.store['events'][0]['kind'], 'arrived')


class ControllerPublishTests(unittest.TestCase):
    def test_controller_publishes_after_decision(self):
        from simulator.server import Controller
        c = Controller(); c.stop.set()
        published = []
        c.store = StateStore('http://127.0.0.1:9', 'secret')
        with patch.object(c.store, 'publish', side_effect=lambda state, force=False, wait=False, events=None: published.append((state['sim_time'], force, events)) or True):
            c.sim.ignite(); c.sim.farmer_call()
            with patch.object(c.robot, 'decide', return_value=(None, 'ev')):
                c.busy = True; c._decide(c.sim.payload('farmer_call'), c.sim.tick)
        self.assertTrue(any(force for _, force, _e in published))
        self.assertTrue(all(isinstance(events, list) for _, _f, events in published))  # drained field events travel with each publish
        c.robot.close()


if __name__ == '__main__':
    unittest.main()


