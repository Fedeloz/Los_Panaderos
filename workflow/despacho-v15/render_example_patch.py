import json
import uuid
from pathlib import Path

root = Path(r'C:\Users\guill\Desktop\HackSpain\_worktree-cursor\workflow\despacho-v15')
code = (root / 'construir_estado_publico.py').read_text(encoding='utf-8')
input_data = {
    'world_state': json.dumps({
        'districts': [
            {'district_id': 'town_north', 'name': 'Prado Alto', 'status': 'unwarned', 'auto_danger_level': 'warning',
             'evacuation_point': 'patio del Colegio Público Ágora', 'evacuation_route': 'Calle Murillo'},
            {'district_id': 'farm', 'name': 'Granja El Álamo', 'status': 'unwarned', 'auto_danger_level': 'watch',
             'evacuation_point': 'Cruce de la Dehesa', 'evacuation_route': 'pista a la M-600'},
            {'district_id': 'town', 'name': 'Casco Histórico', 'status': 'unwarned', 'auto_danger_level': 'none'},
        ]
    }, ensure_ascii=False),
    'contacts': json.dumps({
        'districts': [
            {'district_id': 'town_north', 'name': 'Prado Alto', 'chat_id': '-100north'},
            {'district_id': 'farm', 'name': 'Granja El Álamo', 'chat_id': '-100farm'},
        ]
    }, ensure_ascii=False),
    'incident_id': 'brunete-demo',
    'event_id': 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    'generation': '7',
    'session_id': 'cafebabedeadbeefcafebabedeadbeef',
    'thermal': '{}',
    'decision': 'avisar',
    'criticidad': 'alta',
    'destinatarios': 'Prado Alto, Paco Herranz',
    'justificacion': 'Frente a sotavento de Prado Alto; aviso preventivo a la granja.',
    'alert_zone': 'Prado Alto',
    'zone_information': 'Prado Alto: aviso de evacuacion. Dirijase al patio del Colegio Publico Agora.',
    'zone_criticality': 'alta',
    'zone_action': 'evacuate',
    'zone_chat': '-100north',
    'call_list': json.dumps([
        {'phone_number': '+34600000000', 'contact_name': 'Paco Herranz', 'district_id': 'farm',
         'known_location': 'Granja El Álamo', 'information': 'Reuna al grupo en el Cruce de la Dehesa.',
         'criticality': 'alta'}
    ], ensure_ascii=False),
    'personal_name': '',
    'personal_chat': '',
    'personal_information': '',
    'personal_criticality': '',
    'personal_zone': '',
    'drone_mission': 'Scout-1 patrulla el flanco este; Squirtle investiga el humo; el camion espera sector.',
    'drone_command': 'scout',
    'drone_reason': 'Fuego no confirmado; verificar el reporte del granjero.',
    'extinguisher_orders': json.dumps([
        {'drone_id': 'drone-1', 'command': 'scout', 'target_x': 60, 'target_y': 30, 'district_id': '',
         'reason': 'Investigar el humo reportado desde una posicion segura.'}
    ]),
    'scout_orders': json.dumps([
        {'drone_id': 'scout-1', 'command': 'patrol', 'waypoints': [[16, 32], [20, 28]], 'district_id': '',
         'reason': 'Patrulla hacia el este, lejos del foco reportado.'}
    ]),
    'truck_orders': json.dumps([
        {'truck_id': 'engine-1', 'command': 'continue', 'target_x': 0, 'target_y': 0,
         'reason': 'Sin sector de ataque hasta confirmar el frente.'}
    ]),
    'run_id': '11111111-2222-3333-4444-555555555555',
}
ns = {'input_data': input_data, 'json': json, 'uuid': uuid}
exec(code, ns, ns)
patch = {
    'districts': ns['output']['districts'],
    'public_message': ns['output']['public_message'],
    'advice_source': ns['output']['advice_source'],
    'loop_seen_generation': ns['output']['loop_seen_generation'],
    'session_id': ns['output']['session_id'],
    'last_dispatch': ns['output']['last_dispatch'],
    'pending_command': ns['output']['pending_command'],
    'communications_sent': ns['output']['communications_sent'],
}
# Omit action with a NON-evacuatory criticality so inferred_from_criticality cannot
# put people on the road. The live prompt still requires action on every alert.
input_data2 = dict(input_data)
input_data2.update(
    alert_zone='Casco Histórico',
    zone_information='Casco en seguimiento, no evacuen.',
    zone_criticality='informativa',
    zone_action='',
    zone_chat='',
    call_list='[]',
    drone_mission='',
    drone_command='',
)
ns2 = {'input_data': input_data2, 'json': json, 'uuid': uuid}
exec(code, ns2, ns2)
(root / 'example-patch.json').write_text(json.dumps({
    'with_explicit_action': patch,
    'without_action_informativa_omits_action_key': ns2['output']['communications_sent'],
}, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(patch, ensure_ascii=False, indent=2))
print('--- omitted action, informativa ---')
print(json.dumps(ns2['output']['communications_sent'], ensure_ascii=False, indent=2))
