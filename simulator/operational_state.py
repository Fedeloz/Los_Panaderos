"""Build the public operational incident view from simulator state."""
import math
import time

try:
    from .contacts import directory as contact_directory
except ImportError:
    from contacts import directory as contact_directory

LEVELS=('none','watch','warning','critical')


def danger_level(group,measurements,confirmed,wind_strength):
    if group['status']=='burnt':return 'critical'
    if not measurements:return 'warning' if group['status']=='evacuating' else 'none'
    distance=min(item['distance'] for item in measurements);downwind=any(item['downwind_sector'] for item in measurements)
    level='none'
    if downwind or distance<=30:level='watch'
    if group['status']=='evacuating' or distance<=16 or (distance<=30 and downwind):level='warning'
    if distance<=8 or (distance<=16 and downwind):level='critical'
    if not confirmed and level=='critical' and not (wind_strength>=2 and downwind):level='warning'
    return level


def district_advice(name,level,point,route,safe_because='',rescue=''):
    extra=' '.join(value for value in (safe_because,rescue) if value)
    if level=='critical':return f'{name}: peligro inminente por el incendio. Salga ahora hacia {point or "el punto de encuentro indicado"}. {route or ""} {extra}'.strip()
    if level=='warning':return f'{name}: aviso de evacuacion preventiva. Prepare a su familia y dirijase a {point or "el punto de encuentro"}. {route or ""} {extra}'.strip()
    if level=='watch':return f'{name}: no hay peligro ahora mismo. Los equipos vigilan la evolucion del fuego; le avisaremos si cambia. Mantenga el telefono cerca.'
    return f'{name}: fuera de la zona afectada. Las autoridades estan trabajando para controlar la situacion; no necesita hacer nada y le contactaremos si algo cambia.'


def build_state(sim,dispatch=None,communications=None):
    alignment=sim.population_wind_alignment();confirmed=bool(sim.observation);strength=math.hypot(*sim.wind)
    contacts=contact_directory(sim.groups);channels={item['district_id']:item for item in contacts['districts']};districts=[]
    for key,group in sim.groups.items():
        level=danger_level(group,alignment.get(key,{}).get('measurements',[]),confirmed,strength);channel=channels.get(key,{})
        districts.append(dict(district_id=key,name=group['name'],kind=group['kind'],population=group['count'],burnt=group.get('burnt',0),
            status=group['status'],auto_danger_level=level,home=list(group['home']),refuge=list(group['refuge']),
            chat_id=channel.get('chat_id'),evacuation_point=channel.get('evacuation_point'),evacuation_route=channel.get('evacuation_route'),
            evacuation_point_is_safe_because=channel.get('evacuation_point_is_safe_because'),rescue_plan=channel.get('rescue_plan'),
            auto_advice=district_advice(group['name'],level,channel.get('evacuation_point'),channel.get('evacuation_route'),
                channel.get('evacuation_point_is_safe_because') or '',channel.get('rescue_plan') or '')))
    worst=max((item['auto_danger_level'] for item in districts),key=LEVELS.index,default='none')
    burning=[dict(x=cell['x'],y=cell['y']) for cell in sim.observation]
    front='Sin fuego confirmado por sensores' if not burning else f'{len(burning)} celdas ardiendo observadas; viento hacia ({sim.wind[0]}, {sim.wind[1]})'
    if not burning and sim.called:front=f'Humo reportado en {list(sim.report)} pendiente de confirmacion'
    vehicles={}
    for vehicle in sim.extinguishers+sim.scouts:
        vehicles[vehicle['drone_id']]=dict(role=vehicle.get('role','drone'),status=vehicle['status'],x=round(vehicle['x'],1),y=round(vehicle['y'],1),mode=vehicle.get('mode'),sim_time=sim.tick)
    for truck in sim.trucks:
        vehicles[truck['truck_id']]=dict(role='truck',status=truck['status'],x=round(truck['x'],1),y=round(truck['y'],1),sector=truck.get('crew_target'),sim_time=sim.tick)
    detections=[event for event in sim.event_log if event['kind']=='fire_detected']
    return dict(incident_id=sim.incident_id,sim_time=sim.tick,phase=sim.phase,updated_at=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),
        wind=dict(dx=sim.wind[0],dy=sim.wind[1],strength=round(strength,2)),
        fire=dict(confirmed=confirmed or bool(detections),burning_cells=len(burning),observed_cells=burning[:200],report=list(sim.report) if sim.called else None,front=front,
            detections=[dict(source=event['source'],x=event['x'],y=event['y'],sim_time=event['sim_time'],district_id=event.get('district_id')) for event in detections][-20:]),
        vehicles=vehicles,events=sim.event_log[-30:],incident_danger_level=worst,mission=sim.mission,districts=districts,
        contacts=dict(people=[{key:person.get(key) for key in ('contact_id','contact_name','role','district_id','known_location','phone_number','chat_id','mobility')} for person in contacts['people']],emergency=contacts['emergency']),
        communications_sent=[dict(item) for item in (communications if communications is not None else sim.communications)][-50:],
        last_dispatch=dispatch if dispatch is not None else sim.dispatch,
        auto_public_message=(f'Incendio en Brunete en seguimiento. Nivel general: {worst}. Distritos en aviso: '+(', '.join(item['name'] for item in districts if item['auto_danger_level'] in ('warning','critical')) or 'ninguno')+'.'),
        source='los-panaderos-simulator')
