import copy
import json
import unittest
from simulator.engine import Simulation, GEOGRAPHY
from simulator.terrain import inside_polygon


class DistrictTests(unittest.TestCase):
    def test_population_allocation_and_single_farm(self):
        s=Simulation();town=[g for g in s.groups.values() if g['kind']=='town']
        self.assertEqual(len(town),4)
        self.assertEqual(sum(g['count'] for g in town),11261)
        self.assertEqual(len([g for g in s.groups.values() if g['kind']=='farm']),1)
        self.assertEqual(s.groups['farm']['count'],100)
        for zone in GEOGRAPHY['observation_zones']:
            self.assertTrue(inside_polygon(*zone['anchor'],zone['polygon']),zone['id'])
            self.assertEqual(s.groups[zone['id']]['count'],zone['population'])
        world=json.loads(s.payload()['world_state'])
        self.assertEqual(set(world['people']),set(s.groups))
        self.assertEqual({t['district_id'] for t in world['evacuation_targets']},set(s.groups))
        self.assertEqual(set(world['population_wind_alignment']),set(s.groups))
        self.assertIn('ONLY that district',world['rules']['evacuation'])
        self.assertEqual(world['geography']['population_source']['reference_year'],2025)

    def test_warning_affects_only_selected_district_and_freezes_recording(self):
        s=Simulation();g=s.groups['town_north'];x,y=g['home'];s.drone.update(x=x,y=y)
        before=s.state()
        result=s.apply(dict(command='evacuate_town',district_id='town_north',target_x=x,target_y=y),'n',s.incident_id,0)
        self.assertEqual(result['district_id'],'town_north')
        s.step()
        self.assertEqual(g['status'],'evacuating')
        self.assertEqual(s.groups['town']['status'],'unwarned')
        self.assertEqual(s.groups['town_south']['status'],'unwarned')
        self.assertEqual(s.groups['farm']['status'],'unwarned')
        self.assertEqual(before['people']['town_north']['status'],'unwarned')
        self.assertEqual(s.last_result['settlement'],'town_north')
        self.assertNotIn('town_north',{t['district_id'] for t in json.loads(s.payload()['world_state'])['evacuation_targets']})

    def test_all_districts_warn_independently(self):
        s=Simulation()
        for key in ('town_north','town','town_south','town_rosales','farm'):
            g=s.groups[key];x,y=g['home'];s.drone.update(x=x,y=y)
            decision=dict(command='evacuate_farm' if key=='farm' else 'evacuate_town',district_id=key,target_x=x,target_y=y)
            s.apply(decision,key,s.incident_id,s.tick);s.step()
            self.assertEqual(g['status'],'evacuating')
        s.step(50)
        self.assertTrue(all(g['status']=='safe' for g in s.groups.values()))
        self.assertEqual(sum(g['count'] for g in s.groups.values() if g['kind']=='town' and g['status']=='safe'),11261)
        with self.assertRaisesRegex(ValueError,'No unwarned'):
            s.apply(dict(command='evacuate_town',target_x=10,target_y=35),'again',s.incident_id,s.tick)

    def test_invalid_district_is_atomic_and_farm_does_not_warn_town(self):
        s=Simulation();before=copy.deepcopy(s.drone)
        with self.assertRaisesRegex(ValueError,'District must'):
            s.apply(dict(command='evacuate_town',district_id='farm',target_x=73,target_y=21),'bad',s.incident_id,0)
        self.assertEqual(s.drone,before)
        self.assertNotIn('bad',s.seen_commands)
        s.drone.update(x=s.farm[0],y=s.farm[1])
        s.apply(dict(command='evacuate_farm',district_id='farm',target_x=0,target_y=0),'farm',s.incident_id,0);s.step()
        self.assertEqual(s.groups['farm']['status'],'evacuating')
        self.assertTrue(all(g['status']=='unwarned' for g in s.groups.values() if g['kind']=='town'))

    def test_agent_must_select_explicit_id_not_nearest_coordinates(self):
        s=Simulation();x,y=s.groups['town_north']['home']
        for value in (None,'','unknown',{},'farm'):
            d=dict(command='evacuate_town',district_id=value,target_x=x,target_y=y)
            with self.assertRaises(ValueError):s.apply(d,'bad',s.incident_id,0)
        d=dict(command='evacuate_town',district_id='town_south',target_x=x,target_y=y)
        result=s.apply(d,'south',s.incident_id,0)
        self.assertEqual(result['district_id'],'town_south')
        self.assertEqual(result['target'],s.groups['town_south']['home'])
        world=json.loads(s.payload()['world_state'])
        self.assertEqual({d['district_id'] for d in world['districts']},set(s.groups))
        self.assertTrue(all(d['boundary'] and d['refuge'] for d in world['districts']))

    def test_exposure_counts_one_district_without_double_counting(self):
        s=Simulation();g=s.groups['town_south'];x,y=g['home']
        s.cells[y][x].update(heat=1.,fuel=1.)
        s.update_people_exposure();s.update_people_exposure()
        self.assertEqual(s.state()['burnt_people'],3378)
        self.assertEqual(s.groups['town_north']['status'],'unwarned')
        self.assertEqual(s.groups['town']['status'],'unwarned')

    def test_neighbourhood_boundaries_do_not_overlap(self):
        zones=[z for z in GEOGRAPHY['observation_zones'] if z['kind']=='town']
        for y in range(56):
            for x in range(80):
                matches=[z['id'] for z in zones if inside_polygon(x+.37,y+.41,z['polygon'])]
                self.assertLessEqual(len(matches),1,(x,y,matches))
        s=Simulation();g=s.groups['town_rosales'];x,y=g['home']
        result=s.apply(dict(command='evacuate_town',district_id='town_rosales',target_x=x,target_y=y),'rosales',s.incident_id,0)
        self.assertEqual(result['target'],[x,y])
        self.assertEqual(result['district_id'],'town_rosales')
