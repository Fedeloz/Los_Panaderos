"""Prove the example pending_command against Simulation.apply (demo fleet 1/1/1)."""
import json
import sys
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from simulator.engine import Simulation
from simulator.happyrobot import HappyRobot

root = Path(__file__).resolve().parent
pending = json.loads((root / 'pending_command.json').read_text(encoding='utf-8'))
decision = HappyRobot.normalize(pending)
assert decision is not None, 'normalize rejected pending_command'

s = Simulation(fleet_counts=dict(scouts=1, extinguishers=1, trucks=1), incident_id='brunete-demo')
s.ignite()
s.farmer_call()
s.apply(decision, pending['command_id'], s.incident_id, s.tick)
print('apply accepted', pending['command_id'], 'tick', s.tick)

bad = json.loads(json.dumps(pending))
bad['command_id'] = uuid.uuid4().hex
bad['scout_orders'][0]['command'] = 'scout'
try:
    s.apply(HappyRobot.normalize(bad), bad['command_id'], s.incident_id, s.tick)
except ValueError as exc:
    print('scout-on-scout rejected as expected:', exc)
else:
    raise SystemExit('expected rejection for scout_orders command=scout')

info = {'kind': 'zone_alert', 'district_id': 'town', 'status': 'sent',
        'criticality': 'informativa', 'information': 'Casco en seguimiento, no evacuen.'}
applied = s.apply_communications([info])
print('omitted action + informativa:', applied[0]['action'], applied[0]['action_source'], applied[0]['effect'])
assert applied[0]['action'] == 'inform'
assert applied[0]['effect'] != 'district_warned'
