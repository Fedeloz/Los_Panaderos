"""Deterministic observation-bounded fleet policy."""
import math


class DeterministicFleetPolicy:
    def decide(self, sim):
        sim.observe()
        urgent = self._urgent_districts(sim)
        reserved = set()
        scout_orders = []
        for scout in sim.scouts:
            district = self._next_district(sim,urgent,reserved)
            if district:
                reserved.add(district)
                group = sim.groups[district]
                scout_orders.append(dict(drone_id=scout['drone_id'],command='evacuate_farm' if group['kind']=='farm' else 'evacuate_town',district_id=district,waypoints=[],reason=f"Warn {group['name']} because it is exposed downwind."))
            elif scout.get('mode','').startswith('evacuate_') and scout.get('evacuation_group') in sim.groups and sim.groups[scout['evacuation_group']]['status']=='unwarned':
                scout_orders.append(dict(drone_id=scout['drone_id'],command='continue',district_id='',waypoints=[],reason='Continue the current physical warning mission.'))
            else:
                points = self._scout_points(sim,scout)
                scout_orders.append(dict(drone_id=scout['drone_id'],command='patrol' if points else 'hold',district_id='',waypoints=points,reason='Inspect the reported sector from safe approaches.' if points else 'No useful safe patrol target is available.'))
        extinguisher_orders = []
        for drone in sim.extinguishers:
            district = self._next_district(sim,urgent,reserved)
            if district:
                reserved.add(district)
                group = sim.groups[district]
                extinguisher_orders.append(self._drone_order(drone,'evacuate_farm' if group['kind']=='farm' else 'evacuate_town',group['home'],f"Warn {group['name']} because no scout is available for this urgent district.",district))
                continue
            positions = sim.safe_drone_positions(drone)
            if sim.observation and positions:
                point = positions[len(extinguisher_orders)%len(positions)]
                extinguisher_orders.append(self._drone_order(drone,'contain',[point['x'],point['y']],'Contain confirmed fire from an engine-validated safe position.'))
                continue
            approaches = sim.smoke_scout_positions()
            if approaches:
                point = approaches[len(extinguisher_orders)%len(approaches)]
                extinguisher_orders.append(self._drone_order(drone,'scout',[point['x'],point['y']],'Approach unconfirmed smoke from safe stand-off without blind suppression.'))
            else:
                extinguisher_orders.append(self._drone_order(drone,'hold',[round(drone['x']),round(drone['y'])],'No safe effective target is currently available.'))
        truck_orders = []
        observed = [(cell['x'],cell['y']) for cell in sim.observation]
        for truck in sim.trucks:
            if observed:
                target = min(observed,key=lambda point:math.dist(point,(truck['x'],truck['y'])))
                truck_orders.append(dict(truck_id=truck['truck_id'],command='attack_sector',target_x=target[0],target_y=target[1],reason='Attack the nearest confirmed sector using shared observations.'))
            elif sim.called:
                truck_orders.append(dict(truck_id=truck['truck_id'],command='attack_sector',target_x=sim.report[0],target_y=sim.report[1],reason='Mobilize toward the reported smoke sector while drones verify it.'))
            else:
                truck_orders.append(dict(truck_id=truck['truck_id'],command='hold',target_x=round(truck['x']),target_y=round(truck['y']),reason='No incident report is active.'))
        return dict(mission=self._mission(urgent,sim),reason='Deterministic priorities: life safety, observation, then validated containment.',extinguisher_orders=extinguisher_orders,scout_orders=scout_orders,truck_orders=truck_orders)

    @staticmethod
    def _drone_order(drone,command,target,reason,district=''):
        return dict(drone_id=drone['drone_id'],command=command,target_x=int(target[0]),target_y=int(target[1]),district_id=district,reason=reason,mission=reason)

    @staticmethod
    def _urgent_districts(sim):
        if math.hypot(*sim.wind) <= 1.8:
            return []
        alignment = sim.population_wind_alignment()
        candidates = [key for key,group in sim.groups.items() if group['status']=='unwarned' and alignment[key]['downwind_sector']]
        return sorted(candidates,key=lambda key:min((m['distance'] for m in alignment[key]['measurements']),default=float('inf')))

    @staticmethod
    def _next_district(sim,urgent,reserved):
        return next((key for key in urgent if key not in reserved and sim.groups[key]['status']=='unwarned'),None)

    @staticmethod
    def _scout_points(sim,scout):
        points = sim.smoke_scout_positions()
        if points:
            return [[point['x'],point['y']] for point in points[:3]]
        if scout.get('target'):
            return [list(map(round,scout['target']))]
        return []

    @staticmethod
    def _mission(urgent,sim):
        if urgent:
            return 'Warn threatened districts, verify the incident and position suppression assets'
        if sim.observation:
            return 'Contain confirmed fire while maintaining shared observation'
        return 'Verify reported smoke and mobilize toward the reported sector'
