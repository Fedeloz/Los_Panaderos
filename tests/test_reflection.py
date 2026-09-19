import json
import unittest
from unittest.mock import patch

from simulator import reflection
from simulator.happyrobot import HappyRobot

RUN = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
OUT = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'


def answers(data_text):
    return [{'content': [{'text': f'Run ID: {RUN}\nStatus: completed'}]},
            {'content': [{'text': f'## Diagnostico\n- Output ID: {OUT}\n- Status: succeeded\n- Timestamp: 2026-09-20T00:00:00Z'}]},
            {'content': [{'text': data_text}]}]


class ReflectionTests(unittest.TestCase):
    def test_payload_is_strings_and_bounded(self):
        steps = [dict(agent='Scout Agent', timestamp='t', reasoning='x'*5000, action='report_scout_plan', arguments={}, outcome={})]*20
        record = dict(id=1, tick=5, event_type='farmer_call', decision_json='{}', status='applied', reject_reason='', latency_s=280.0, run_id='r')
        p = reflection.build_payload(record, steps, dict(loop_detected=True), dict(regret=0, gap_type='execution', weights={}), 'ONE-SHOT TASK...')
        self.assertEqual(set(p), {'decision_record', 'telemetry_steps', 'signals', 'oracle_result', 'prompt_excerpt'})
        for v in p.values():
            self.assertIsInstance(v, str)
        self.assertLess(len(p['telemetry_steps']), 30000)
        self.assertNotIn('weights', json.loads(p['oracle_result']))

    def test_reflect_parses_diagnosis(self):
        diag = dict(reflection='El agente repitió la llamada.', gap_type='execution', root_cause='tool response empty',
                    evidence_step_indexes=[1, 2], prompt_section='ONE-SHOT TASK', proposed_rule='Treat an empty tool result as success.',
                    proposed_prompt_patch='', confidence=0.9)
        h = HappyRobot()
        with patch.object(h, 'tool', side_effect=answers('Data: '+json.dumps(diag))) as call:
            text, diagnosis, rid = reflection.reflect(h, dict(decision_record='{}'))
        self.assertEqual(rid, RUN)
        self.assertEqual(diagnosis['gap_type'], 'execution')
        self.assertEqual(diagnosis['confidence'], 0.9)
        self.assertIn('repitió', text)
        trigger = call.call_args_list[0].args[1]
        self.assertEqual(trigger['workflow_id'], reflection.REFLECTION_WORKFLOW)
        self.assertEqual(call.call_args_list[1].args[1]['node_id'], reflection.DIAGNOSIS_NODE)

    def test_malformed_diagnosis_raises(self):
        h = HappyRobot()
        with patch.object(h, 'tool', side_effect=answers('Data: {"hello": 1}')), self.assertRaises(RuntimeError):
            reflection.reflect(h, {})

    def test_incomplete_run_raises(self):
        h = HappyRobot()
        with patch.object(h, 'tool', return_value={'content': [{'text': f'Run ID: {RUN}\nStatus: failed'}]}), self.assertRaises(RuntimeError):
            reflection.reflect(h, {})


if __name__ == '__main__':
    unittest.main()
