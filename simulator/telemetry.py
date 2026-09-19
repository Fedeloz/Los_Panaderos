"""Harvest HappyRobot run telemetry and derive signals.

Each agent node in a run exposes an ``events`` list with the model's reasoning,
the tool it called, the arguments and the tool's outcome. That is the "why"
behind a decision; the black box keeps it next to the frozen world state.
"""
import json
import re
from datetime import datetime


def _loads(value):
    if isinstance(value, (dict, list)):
        return value
    if value is None or value == '':
        return {}
    try:
        return json.loads(value)
    except (TypeError, ValueError):
        return value


def parse_events(agent, data):
    events = _loads(data.get('events', [])) if isinstance(data, dict) else []
    if not isinstance(events, list):
        return []
    return [dict(agent=agent, timestamp=e.get('timestamp', ''), reasoning=e.get('reasoning') or '',
                 action=e.get('action') or '', arguments=_loads(e.get('arguments')), outcome=_loads(e.get('outcome')))
            for e in events if isinstance(e, dict)]


def agent_outputs(listing_text):
    """(agent name, output id) for every '## <name> Agent' block of an outputs listing."""
    found = []
    for block in listing_text.split('## ')[1:]:
        name = block.split('\n', 1)[0].strip()
        oid = re.search(r'Output ID:\s*([0-9a-f-]{36})', block)
        if name.endswith('Agent') and oid:
            found.append((name, oid.group(1)))
    return found


def _data(text):
    match = re.search(r'Data:\s*(\{.*)', text, re.S)
    if not match:
        return None
    try:
        return json.JSONDecoder().raw_decode(match.group(1))[0]
    except ValueError:
        return None


def harvest(robot, run_id, listing_text=None):
    """Fetch the reasoning steps of every agent node in a run.

    ``listing_text`` may be the node-filtered listing ``decide`` already fetched;
    if it holds no agent blocks the full listing is fetched once.
    """
    outputs = agent_outputs(listing_text or '')
    if not outputs:
        listing_text = robot.text(robot.tool('monitor_runs', dict(action='outputs', run_id=run_id)))
        outputs = agent_outputs(listing_text)
    steps = []
    for name, oid in outputs:
        data = _data(robot.text(robot.tool('monitor_runs', dict(action='outputs', run_id=run_id, output_id=oid))))
        if isinstance(data, dict):
            steps.extend(parse_events(name, data))
    return steps


def _seconds(a, b):
    try:
        start = datetime.fromisoformat(a.replace('Z', '+00:00'))
        end = datetime.fromisoformat(b.replace('Z', '+00:00'))
        return (end-start).total_seconds()
    except (ValueError, AttributeError):
        return 0.0


def signals(steps, payload):
    per, repeated, seconds = {}, {}, {}
    for s in steps:
        per.setdefault(s['agent'], []).append(s)
    for agent, items in per.items():
        actions = [s['action'] for s in items if s['action'] != '_terminate']
        repeated[agent] = sum(1 for a, b in zip(actions, actions[1:]) if a == b)
        seconds[agent] = round(_seconds(items[0]['timestamp'], items[-1]['timestamp']), 1)
    world = _loads(payload.get('world_state', '{}')) or {}
    thermal = _loads(payload.get('thermal_detections', '{}')) or {}
    if not isinstance(world, dict):
        world = {}
    if not isinstance(thermal, dict):
        thermal = {}
    text = ' '.join(s['reasoning'].lower() for s in steps)
    contradictions = []
    fleet = world.get('fleet') or []
    if any(isinstance(v, dict) and v.get('role') == 'extinguisher' for v in fleet) and re.search(r'no (authoritative )?extinguisher', text):
        contradictions.append('claims_no_extinguisher')
    if world.get('fire_trucks') and re.search(r'no (authoritative )?(fire_trucks|fire truck|truck)', text):
        contradictions.append('claims_no_truck')
    if not thermal.get('burning_cells') and re.search(r'(?<!no )(?<!not )(?<!un)(confirmed fire|fire is confirmed)', text):
        contradictions.append('claims_confirmed_fire')
    return dict(steps_per_agent={a: len(v) for a, v in per.items()},
                repeated_tool_calls=repeated,
                empty_reasoning_steps=sum(1 for s in steps if not s['reasoning'].strip() and s['action'] != '_terminate'),
                agent_seconds=seconds,
                contradictions=contradictions,
                terminated_cleanly=bool(steps) and steps[-1]['action'] == '_terminate',
                loop_detected=any(n >= 2 for n in repeated.values()))
