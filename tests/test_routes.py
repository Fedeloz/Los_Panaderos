import io
import json
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from simulator import server


class PageRouteTests(unittest.TestCase):
    def setUp(self):
        self.controller = Mock()
        self.controller.state.return_value = {'tick': 0, 'busy': False}
        with patch.object(server, 'Controller', return_value=self.controller) as constructor, \
                patch.object(server, 'ThreadingHTTPServer') as http, patch('builtins.print'):
            server.serve()
        constructor.assert_called_once_with()
        self.handler_class = http.call_args.args[1]
        self.static = Path(server.__file__).parent / 'static'

    def handler(self, path, headers=None):
        handler = object.__new__(self.handler_class)
        handler.path = path
        handler.headers = headers or {'Host': '127.0.0.1:8765'}
        handler.reply = Mock()
        return handler

    def test_page_aliases_serve_the_correct_documents(self):
        pages = {'/': 'situacion.html', '/situacion': 'situacion.html',
                 '/incidente': 'incidente.html', '/incidente/brunete': 'incidente.html',
                 '/medios': 'medios.html', '/archivo': 'archivo.html'}
        for route, filename in pages.items():
            with self.subTest(route=route):
                handler = self.handler(route)
                handler.do_GET()
                status, body, mime = handler.reply.call_args.args
                self.assertEqual(status, 200)
                self.assertEqual(mime, 'text/html; charset=utf-8')
                self.assertTrue(body == (self.static / filename).read_bytes())
        self.assertNotEqual((self.static / 'situacion.html').read_bytes(), (self.static / 'index.html').read_bytes())

    def test_scripts_and_existing_assets_keep_their_mime_types(self):
        paths = {'chrome.js': 'text/javascript', 'situacion.js': 'text/javascript',
                 'medios.js': 'text/javascript', 'archivo.js': 'text/javascript',
                 'mapa.js': 'text/javascript', 'mapa.css': 'text/css',
                 'app.js': 'text/javascript',
                 'observation-map.js': 'text/javascript', 'vendor/bootstrap-icons.js': 'text/javascript',
                 'style.css': 'text/css', 'favicon.png': 'image/png',
                 'cursors/flamethrower-hover.svg': 'image/svg+xml',
                 'cursors/flamethrower-active.svg': 'image/svg+xml',
                 'maps/brunete.jpg': 'image/jpeg', 'maps/brunete-illustrated.png': 'image/png'}
        for path, expected in paths.items():
            with self.subTest(path=path):
                handler = self.handler('/' + path)
                handler.do_GET()
                status, body, mime = handler.reply.call_args.args
                self.assertEqual(status, 200)
                self.assertEqual(mime, expected)
                self.assertTrue(body == (self.static / path).read_bytes())
        handler = self.handler('/favicon.ico')
        handler.do_GET()
        self.assertEqual(handler.reply.call_args.args[0], 200)
        self.assertEqual(handler.reply.call_args.args[2], 'image/png')
        self.assertTrue(handler.reply.call_args.args[1] == (self.static / 'favicon.png').read_bytes())

    def test_unknown_paths_cannot_escape_the_allowlist(self):
        for path in ('/unknown', '/.env', '/../.env', '/maps/../../.env', '/simulator/server.py'):
            with self.subTest(path=path):
                handler = self.handler(path)
                handler.do_GET()
                self.assertEqual(handler.reply.call_args.args[0], 404)

    def test_query_string_does_not_change_incident_routing(self):
        handler = self.handler('/incidente/brunete?view=archive')
        handler.do_GET()
        self.assertEqual(handler.reply.call_args.args[0], 200)
        self.assertTrue(handler.reply.call_args.args[1] == (self.static / 'incidente.html').read_bytes())

    def test_state_api_serves_the_cached_body_from_the_existing_controller(self):
        # /api/state serves a pre-serialised body with an ETag, so the browser poll costs
        # nothing while nothing changes; it no longer re-serialises state() per request.
        self.controller.state_bytes.return_value = ('"abc"', b'{"tick": 0}')
        handler = self.handler('/api/state')
        handler.send_response = Mock()
        handler.send_header = Mock()
        handler.end_headers = Mock()
        handler.wfile = Mock()
        handler.do_GET()
        self.controller.state_bytes.assert_called_once_with()
        handler.send_response.assert_called_once_with(200)
        handler.wfile.write.assert_called_once_with(b'{"tick": 0}')
        self.assertIn(('ETag', '"abc"'), [c.args for c in handler.send_header.call_args_list])

    def test_state_api_answers_304_when_the_browser_already_has_it(self):
        self.controller.state_bytes.return_value = ('"abc"', b'{"tick": 0}')
        handler = self.handler('/api/state', {'Host': '127.0.0.1:8765', 'If-None-Match': '"abc"'})
        handler.send_response = Mock()
        handler.send_header = Mock()
        handler.end_headers = Mock()
        handler.wfile = Mock()
        handler.do_GET()
        handler.send_response.assert_called_once_with(304)
        handler.wfile.write.assert_not_called()

    def test_nonlocal_config_request_is_rejected(self):
        handler=self.handler('/api/config',{'Host':'evil.example'});handler.do_GET()
        self.assertEqual(handler.reply.call_args.args[0],403)

    def test_post_origin_is_host_based_not_page_based(self):
        body = json.dumps({'action': 'fleet', 'counts': {'trucks': 2, 'scouts': 0, 'extinguishers': 1}}).encode()
        cases = [
            ('http://127.0.0.1:8765', '127.0.0.1:8765', 200),
            ('http://localhost:8765', '127.0.0.1:8765', 200),
            ('https://demo.trycloudflare.com', 'demo.trycloudflare.com', 200),
            ('http://127.0.0.1:8765/incidente', '127.0.0.1:8765', 403),
            ('http://evil.example', '127.0.0.1:8765', 403),
            ('https://evil.example', 'demo.trycloudflare.com', 403),
        ]
        for origin, host, expected in cases:
            with self.subTest(origin=origin, host=host):
                handler = self.handler('/api/action', {
                    'Origin': origin, 'Host': host, 'X-Simulator-Request': '1',
                    'Content-Length': str(len(body)), 'Content-Type': 'application/json',
                })
                handler.rfile = io.BytesIO(body)
                handler.do_POST()
                self.assertEqual(handler.reply.call_args.args[0], expected)
        self.assertEqual(self.controller.action.call_count, 3)
        self.controller.action.assert_called_with('fleet', json.loads(body))

    def test_post_requires_json_content_type(self):
        body=json.dumps({'action':'play'}).encode()
        handler=self.handler('/api/action',{'Origin':'http://127.0.0.1:8765','Host':'127.0.0.1:8765',
            'X-Simulator-Request':'1','Content-Length':str(len(body)),'Content-Type':'text/plain'})
        handler.rfile=io.BytesIO(body);handler.do_POST()
        self.assertEqual(handler.reply.call_args.args[0],415)
        self.controller.action.assert_not_called()

    def test_public_origin_env_allows_configured_tunnel_host(self):
        body = json.dumps({'action': 'play'}).encode()
        with patch.dict(server.os.environ, {'PUBLIC_ORIGIN': 'https://panaderos.example.com'}):
            handler = self.handler('/api/action', {
                'Origin': 'https://panaderos.example.com', 'Host': '127.0.0.1:8765',
                'X-Simulator-Request': '1', 'Content-Length': str(len(body)), 'Content-Type': 'application/json',
            })
            handler.rfile = io.BytesIO(body)
            handler.do_POST()
        self.assertEqual(handler.reply.call_args.args[0], 200)
        self.controller.action.assert_called_with('play', json.loads(body))


class SharedStateRouteTests(unittest.TestCase):
    """/api/shared exists so the page never needs the state API token."""

    def test_trim_drops_the_cell_payload_the_screen_never_draws(self):
        from simulator.server import Controller
        doc = {
            'incident_id': 'brunete-demo', 'sim_time': 12, 'updated_at': '2026-09-20T01:00:00Z',
            'fire': {'confirmed': True, 'burning_cells': 9, 'observed_cells': [{'x': i, 'y': i} for i in range(200)],
                     'detections': [{'source': f'd{i}'} for i in range(20)]},
            'districts': [{'district_id': 'town', 'name': 'Casco', 'auto_danger_level': 'watch', 'chat_id': 'secreto'}],
            'communications_sent': [{'kind': 'zone_alert', 'tick': i} for i in range(40)],
            'events': [{'kind': 'deployed', 'sim_time': i} for i in range(40)],
            'vehicles': {'engine-1': {'status': 'en_route'}},
        }
        trimmed = Controller.trim_shared(doc)
        self.assertNotIn('observed_cells', trimmed['fire'])
        self.assertEqual(len(trimmed['fire']['detections']), 8)
        self.assertEqual(len(trimmed['communications_sent']), 20)
        self.assertEqual(len(trimmed['events']), 12)
        self.assertEqual(trimmed['sim_time'], 12)
        self.assertEqual(trimmed['districts'][0]['auto_danger_level'], 'watch')
        # The Telegram chat ids are not part of what the screen needs.
        self.assertNotIn('chat_id', trimmed['districts'][0])

    def test_trim_survives_an_empty_document(self):
        from simulator.server import Controller
        self.assertIsNone(Controller.trim_shared(None))
        self.assertEqual(Controller.trim_shared({})['districts'], [])
