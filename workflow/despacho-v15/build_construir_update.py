import json
from pathlib import Path

root = Path(r'C:\Users\guill\Desktop\HackSpain\_worktree-cursor\workflow\despacho-v15')
code = (root / 'construir_estado_publico.py').read_text(encoding='utf-8')
refs = [
    ('world_state', '01a0bbd4-e1da-77fb-a284-ae01a43bb435', 'world_state'),
    ('contacts', '01a0bbd4-e1da-77fb-a284-ae01a43bb435', 'contacts'),
    ('incident_id', '01a0bbd4-e1da-77fb-a284-ae01a43bb435', 'incident_id'),
    ('event_id', '01a0bbd4-e1da-77fb-a284-ae01a43bb435', 'event_id'),
    ('generation', '01a0bbd4-e1da-77fb-a284-ae01a43bb435', 'generation'),
    ('session_id', '01a0bbd4-e1ab-7bd5-80d5-73d7cd7a9583', 'session_id'),
    ('thermal', '01a0bbd4-e1da-77fb-a284-ae01a43bb435', 'thermal_detections'),
    ('decision', '01a0bbd6-ef9b-749f-9263-793e99247690', 'response.decision'),
    ('criticidad', '01a0bbd6-ef9b-749f-9263-793e99247690', 'response.criticidad'),
    ('destinatarios', '01a0bbd6-ef9b-749f-9263-793e99247690', 'response.destinatarios'),
    ('justificacion', '01a0bbd6-ef9b-749f-9263-793e99247690', 'response.justificacion'),
    ('alert_zone', '01a0bbd6-8761-7f66-96c6-e9bc4527f01f', 'affected_zone'),
    ('zone_information', '01a0bbd6-8761-7f66-96c6-e9bc4527f01f', 'information'),
    ('zone_criticality', '01a0bbd6-8761-7f66-96c6-e9bc4527f01f', 'criticality'),
    ('zone_action', '01a0bbd6-8761-7f66-96c6-e9bc4527f01f', 'action'),
    ('zone_chat', '01a0bbd6-8761-7f66-96c6-e9bc4527f01f', 'chat_id'),
    ('call_list', '01a0bbd6-8771-79a9-8dfa-dee04baefe0c', 'priority_list'),
    ('personal_name', '01a0bbd6-874f-7a45-976f-eba792cf1d82', 'contact_name'),
    ('personal_chat', '01a0bbd6-874f-7a45-976f-eba792cf1d82', 'chat_id'),
    ('personal_information', '01a0bbd6-874f-7a45-976f-eba792cf1d82', 'information'),
    ('personal_criticality', '01a0bbd6-874f-7a45-976f-eba792cf1d82', 'criticality'),
    ('personal_zone', '01a0bbd6-874f-7a45-976f-eba792cf1d82', 'affected_zone'),
    ('drone_mission', '01a0bbe3-38e6-7a83-9808-7ec1dc5454da', 'mission'),
    ('drone_command', '01a0bbe3-38e6-7a83-9808-7ec1dc5454da', 'primary_command'),
    ('drone_reason', '01a0bbe3-38e6-7a83-9808-7ec1dc5454da', 'drone_reason'),
    ('extinguisher_orders', '01a0bbe3-38e6-7a83-9808-7ec1dc5454da', 'extinguisher_orders'),
    ('scout_orders', '01a0bbe3-38e6-7a83-9808-7ec1dc5454da', 'scout_orders'),
    ('truck_orders', '01a0bbe3-38e6-7a83-9808-7ec1dc5454da', 'truck_orders'),
    ('run_id', 'current', 'run_id'),
]
input_data = [{'key': k, 'value': '{{%s.%s}}' % (gid, vid)} for k, gid, vid in refs]
updates = {
    'configuration': {
        'code': code,
        'input_data': input_data,
        'execution_profile': 'standard',
    }
}
(root / 'construir-update.json').write_text(json.dumps(updates, ensure_ascii=False), encoding='utf-8')
print((root / 'construir-update.json').stat().st_size)
