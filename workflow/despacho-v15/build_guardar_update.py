import json
from pathlib import Path

root = Path(r'C:\Users\guill\Desktop\HackSpain\_worktree-cursor\workflow\despacho-v15')
raw = (
    '{"districts":{{$var:01a0bbd7-d94f-7fae-a5ab-e0793a859e78.districts}},'
    '"public_message":"{{$var:01a0bbd7-d94f-7fae-a5ab-e0793a859e78.public_message}}",'
    '"advice_source":"despacho_code",'
    '"loop_seen_generation":{{$var:01a0bbd7-d94f-7fae-a5ab-e0793a859e78.loop_seen_generation}},'
    '"session_id":"{{$var:01a0bbd7-d94f-7fae-a5ab-e0793a859e78.session_id}}",'
    '"last_dispatch":{{$var:01a0bbd7-d94f-7fae-a5ab-e0793a859e78.last_dispatch}},'
    '"pending_command":{{$var:01a0bbd7-d94f-7fae-a5ab-e0793a859e78.pending_command}},'
    '"communications_sent":{{$var:01a0bbd7-d94f-7fae-a5ab-e0793a859e78.communications_sent}}}'
)
updates = {
    'configuration': {
        'url': [{
            'type': 'paragraph',
            'children': [
                {'text': 'https://los-panaderos-state.guillermovillarsanchez.workers.dev/state/'},
                {'type': 'variable', 'children': [{'text': ''}], 'group_id': '01a0bbd4-e1da-77fb-a284-ae01a43bb435', 'variable_id': 'incident_id'},
                {'text': ''},
            ],
        }],
        'body': {'raw': raw, 'contentType': 'application/json', 'schemaVersion': 2},
        'headers': [
            {'key': 'Authorization', 'value': [{
                'type': 'paragraph',
                'children': [
                    {'text': 'Bearer '},
                    {'type': 'variable', 'children': [{'text': ''}], 'group_id': 'use_case_variables', 'variable_id': 'STATE_API_TOKEN'},
                    {'text': ''},
                ],
            }]},
            {'key': 'Accept', 'value': [{'type': 'paragraph', 'children': [{'text': 'application/json'}]}]},
        ],
        'authType': 'none',
        'ignore5XX': True,
        'contentType': 'application/json',
        'webhookSchemaVersion': 2,
    }
}
(root / 'guardar-update.json').write_text(json.dumps(updates, ensure_ascii=False), encoding='utf-8')
print('ok', len(json.dumps(updates)))
