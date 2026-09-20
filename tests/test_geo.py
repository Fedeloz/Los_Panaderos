import unittest
from simulator.geo import cell_to_lonlat, lonlat_to_cell, PLACE, overlay


class GeoTests(unittest.TestCase):
    def test_round_trip_interior_cell(self):
        lon, lat = cell_to_lonlat(12, 44)
        self.assertTrue(PLACE['west'] < lon < PLACE['east'])
        self.assertTrue(PLACE['south'] < lat < PLACE['north'])
        x, y = lonlat_to_cell(lon, lat)
        self.assertEqual((x, y), (12, 44))

    def test_live_state_uses_brunete_geography(self):
        from simulator.engine import Simulation
        state = Simulation().state()
        self.assertNotIn('geo', state)
        self.assertEqual(state['geography']['id'], 'brunete-illustrated-v1')
        self.assertEqual(set(state['people']), {'town', 'town_north', 'town_south', 'town_rosales', 'farm'})

    def test_town_cell_round_trip(self):
        grid = next(p['grid'] for p in overlay()['places'] if p['id'] == 'town')
        self.assertEqual(lonlat_to_cell(*cell_to_lonlat(*grid)), tuple(grid))

    def test_controller_grid_ignition(self):
        from simulator.server import Controller
        c = Controller()
        try:
            c.action('place_fire', dict(x=65, y=43))
            self.assertEqual(c.sim.report, (65, 43))
        finally:
            c.stop.set(); c.robot.close()

    def test_controller_rejects_legacy_lonlat_ignition(self):
        from simulator.server import Controller
        c = Controller()
        try:
            before = c.sim.report
            with self.assertRaises(ValueError):
                c.action('place_fire', dict(lon=-6.6, lat=40.2))
            self.assertEqual(c.sim.report, before)
        finally:
            c.stop.set(); c.robot.close()

    def test_out_of_bbox_lonlat_clamps_to_rejected_edge(self):
        from simulator.server import Controller
        c = Controller()
        try:
            x, y = lonlat_to_cell(-7.5, 40.2)
            self.assertEqual(x, 0)
            with self.assertRaises(ValueError):
                c.action('place_fire', dict(x=x, y=y))
        finally:
            c.stop.set(); c.robot.close()

    def test_local_host(self):
        from simulator.server import local_host
        for host in ('127.0.0.1', '127.0.0.1:8765', 'localhost:8765'):
            self.assertTrue(local_host(host), host)
        for host in ('', None, '192.168.1.5:8765', 'evil.example'):
            self.assertFalse(local_host(host), host)
