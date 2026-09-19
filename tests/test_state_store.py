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
            s.apply_communications([dict(kind='zone_alert', district_id='farm', information='go north', status='sent')])
            state = build_state(s)
        self.assertEqual(state['incident_id'], s.incident_id)
        self.assertEqual({d['district_id'] for d in state['districts']}, set(s.groups))
        farm = next(d for d in state['districts'] if d['district_id'] == 'farm')
        self.assertEqual(farm['status'], 'evacuating'); self.assertIn(farm['auto_danger_level'], ('warning', 'critical'))
        self.assertIn('Aparcamiento', farm['auto_advice'])
        town = next(d for d in state['districts'] if d['district_id'] == 'town_rosales')
        self.assertEqual(town['auto_danger_level'], 'watch')  # downwind but ~77 cells away, unconfirmed report
        self.assertIn('fuera de peligro', town['auto_advice'].lower().replace('no hay peligro', 'fuera de peligro'))
        self.assertFalse(state['fire']['confirmed']); self.assertIn('Humo reportado', state['fire']['front'])
        carmen = next(p for p in state['contacts']['people'] if p['contact_name'] == 'Carmen Ortega')
        self.assertEqual(carmen['phone_number'], '+34611')
        self.assertEqual(len(state['communications_sent']), 1)
        json.dumps(state)  # serialisable


class FakeApi(BaseHTTPRequestHandler):
    store = {}
    calls = []

    def _send(self, code, body):
        data = json.dumps(body).encode(); self.send_response(code); self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data))); self.end_headers(); self.wfile.write(data)

    def do_PATCH(self):
        self.do_PUT()

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


class ControllerPublishTests(unittest.TestCase):
    def test_controller_publishes_after_decision(self):
        from simulator.server import Controller
        c = Controller(); c.stop.set()
        published = []
        c.store = StateStore('http://127.0.0.1:9', 'secret')
        with patch.object(c.store, 'publish', side_effect=lambda state, force=False, wait=False: published.append((state['sim_time'], force)) or True):
            c.sim.ignite(); c.sim.farmer_call()
            with patch.object(c.robot, 'decide', return_value=(None, 'ev')):
                c.busy = True; c._decide(c.sim.payload('farmer_call'), c.sim.tick)
        self.assertTrue(any(force for _, force in published))
        c.robot.close()


if __name__ == '__main__':
    unittest.main()


