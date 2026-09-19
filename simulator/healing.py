"""Three-tier healing driven by post-mortem diagnoses.

Tier 1 (automatic): store the proposed rule as a lesson for the next payload and
annotate the audited run on the platform.
Tier 2 (automatic): when the same gap recurs, create a northstar on the affected
agent prompt so platform audits grade every future run for it.
Tier 3 (gated): fork the live version, apply the proposed prompt patch, publish the
fork to STAGING only, replay the recorded payload there and grade the new decision
with the oracle. The simulator keeps running the development version; promoting the
patch is a human decision.
"""
import json
import re
import time
from pathlib import Path

from . import oracle
from .happyrobot import HappyRobot

ANNOTATION = dict(execution='critical', judgement='incorrect', information='correct', none='correct', unknown='correct')
PATCH_CONFIDENCE = 0.7
RECURRENCE = 2
AB_ENVIRONMENT = 'staging'


def parse_nodes(text):
    """Parse the node blocks of a get_workflow_details listing."""
    nodes = []
    for block in text.split('### ')[1:]:
        head, _, body = block.partition('\n')
        match = re.match(r'(.*) \((\w[\w-]*)\)\s*$', head.strip())
        if not match:
            continue
        def field(label):
            found = re.search(rf'- {label}:\s*([^\n]+)', body)
            return found.group(1).strip() if found else None
        nodes.append(dict(name=match.group(1).strip(), type=match.group(2), node_id=field('Node ID'),
                          persistent_id=field('Persistent ID'), parent_id=field('Parent ID')))
    return nodes


def latest_version(text):
    found = re.search(r'## (?:Latest|Live) Version\n- ID:\s*([0-9a-f-]{36})', text)
    return found.group(1) if found else None


def prompt_node_for(nodes, agent_name):
    agent = next((n for n in nodes if n['name'] == agent_name), None)
    if not agent:
        return None
    return next((n for n in nodes if n['type'] == 'prompt' and n['parent_id'] == agent['node_id']), None)


def target_agent(diagnosis, steps=None):
    section = (diagnosis.get('prompt_section') or '').lower()
    if 'scout' in section or 'one-shot' in section:
        return 'Scout Agent'
    if 'drone' in section or 'report_to_central' in section:
        return 'Drone Agent'
    agents = [s.get('agent') for s in (steps or []) if s.get('agent')]
    return agents[-1] if agents else 'Drone Agent'


class Healer:
    def __init__(self, box, robot, workflow_id, root):
        self.box, self.robot, self.workflow_id, self.root = box, robot, workflow_id, Path(root)

    def apply(self, decision_id, run_id, diagnosis, evaluation, steps=None):
        report = {}
        for name, fn in (('tier1', lambda: self.tier1(decision_id, run_id, diagnosis, evaluation)),
                         ('tier2', lambda: self.tier2(diagnosis, steps)),
                         ('tier3', lambda: self.tier3(decision_id, diagnosis, evaluation, steps))):
            try:
                report[name] = fn()
            except Exception as exc:
                report[name] = dict(error=str(exc)[:300])
        return report

    # Tier 1 --------------------------------------------------------------
    def tier1(self, decision_id, run_id, diagnosis, evaluation):
        gap = diagnosis.get('gap_type') or evaluation.get('gap_type') or 'unknown'
        rule = (diagnosis.get('proposed_rule') or '').strip()
        if rule and gap in ('execution', 'judgement'):
            self.box.add_lesson(rule, decision_id)
        annotation = ANNOTATION.get(gap, 'correct')
        if run_id:
            args = dict(action='mark', run_id=run_id, annotation=annotation)
            if annotation != 'correct':
                args['correction'] = f"[{gap}] {diagnosis.get('root_cause', '')}"[:1000]
            self.robot.tool('monitor_runs', args)
        return dict(annotation=annotation, lesson=rule or None)

    # Tier 2 --------------------------------------------------------------
    @staticmethod
    def _key(diagnosis):
        return (diagnosis.get('gap_type'), (diagnosis.get('prompt_section') or '').strip().lower())

    def recurrences(self, diagnosis):
        key = self._key(diagnosis)
        return sum(1 for d in self.box.diagnoses() if self._key(d) == key)

    def _workflow(self, version_id=None):
        args = dict(workflow_id=self.workflow_id, include_nodes=True)
        if version_id:
            args['version_id'] = version_id
        text = self.robot.text(self.robot.tool('get_workflow_details', args))
        return latest_version(text), parse_nodes(text)

    def tier2(self, diagnosis, steps=None):
        if diagnosis.get('gap_type') not in ('execution', 'judgement') or self.recurrences(diagnosis) < RECURRENCE:
            return None
        version_id, nodes = self._workflow()
        prompt = prompt_node_for(nodes, target_agent(diagnosis, steps))
        if not prompt or not version_id:
            return dict(skipped='prompt node not found')
        name = f"Post-mortem: {diagnosis.get('prompt_section') or diagnosis.get('gap_type')}"[:120]
        description = f"{diagnosis.get('root_cause', '')} Regla: {diagnosis.get('proposed_rule', '')}"[:1500]
        result = self.robot.tool('manage_northstars', dict(action='create', node_id=prompt['node_id'], version_id=version_id, name=name,
                                                          description=description, category='tool' if diagnosis.get('gap_type') == 'execution' else 'notes',
                                                          priority='high'))
        return dict(name=name, node_id=prompt['node_id'], result=self.robot.text(result)[:500])

    # Tier 3 --------------------------------------------------------------
    def tier3(self, decision_id, diagnosis, evaluation, steps=None):
        patch = (diagnosis.get('proposed_prompt_patch') or '').strip()
        if not patch or diagnosis.get('gap_type') not in ('execution', 'judgement') or float(diagnosis.get('confidence') or 0) < PATCH_CONFIDENCE:
            return None
        live_version, _ = self._workflow()
        fork = self.robot.text(self.robot.tool('manage_versions', dict(action='fork', version_id=live_version)))
        found = re.search(r'Version ID:\s*([0-9a-f-]{36})', fork) or re.search(r'ID:\s*([0-9a-f-]{36})', fork)
        version_id = found.group(1) if found else None
        if not version_id:
            return dict(skipped='fork failed', detail=fork[:300])
        _, nodes = self._workflow(version_id)
        prompt = prompt_node_for(nodes, target_agent(diagnosis, steps))
        if not prompt:
            return dict(skipped='prompt node not found', version_id=version_id)
        current = self.robot.text(self.robot.tool('get_node_details', dict(version_id=version_id, node_id=prompt['node_id'])))
        body = re.search(r'## Prompt \(markdown\)\n```\n(.*?)\n```', current, re.S)
        prompt_md = body.group(1) if body else ''
        section = (diagnosis.get('prompt_section') or 'POST-MORTEM').strip()
        patched = prompt_md.rstrip()+f"\n\nPOST-MORTEM CORRECTION ({section}): {patch}\n"
        self.robot.tool('update_workflow_nodes', dict(version_id=version_id, action='update', node_id=prompt['node_id'], updates=json.dumps(dict(prompt_md=patched))))
        self.robot.tool('fix_broken_vars', dict(workflow_id=self.workflow_id, version_id=version_id))
        self.robot.tool('manage_versions', dict(action='publish', version_id=version_id, environment=AB_ENVIRONMENT, force=True))
        ab = self._ab_test(decision_id)
        path = self.root/'.runtime'/'patches'/f"{time.strftime('%Y%m%d-%H%M%S')}-decision{decision_id}.md"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(self._report(diagnosis, evaluation, version_id, ab, patch, prompt['name']))
        self.box.save_patch(decision_id, version_id, path)
        return dict(version_id=version_id, report_path=str(path), ab=ab, environment=AB_ENVIRONMENT, promoted=False)

    def _ab_test(self, decision_id):
        row = self.box.decision(decision_id)
        snapshot = self.box.load_snapshot(decision_id)
        if row is None or snapshot is None:
            return dict(skipped='no snapshot')
        payload = json.loads(row['payload_json'])
        text = self.robot.text(self.robot.tool('trigger_run', dict(workflow_id=self.workflow_id, environment=AB_ENVIRONMENT,
                                                                   payload=json.dumps(payload), wait=True), timeout=330))
        run = re.search(r'Run ID:\s*([0-9a-f-]{36})', text)
        if not run or not re.search(r'Status:\s*completed\b', text):
            return dict(skipped='patched run did not complete')
        listing = self.robot.text(self.robot.tool('monitor_runs', dict(action='outputs', run_id=run.group(1))))
        output_id = HappyRobot.latest_output(listing)
        out = self.robot.tool('monitor_runs', dict(action='outputs', run_id=run.group(1), output_id=output_id))
        choices = HappyRobot.decisions(out)
        if not choices:
            return dict(run_id=run.group(1), skipped='no decision in patched run')
        new = HappyRobot.normalize(choices[-1])
        before = self.box.evaluation(decision_id) or {}
        after = oracle.evaluate(snapshot, new, horizon=before.get('horizon', 16), seeds=tuple(before.get('seeds', [9])))
        return dict(run_id=run.group(1), regret_before=before.get('regret'), regret_after=after.get('regret'),
                    cost_before=before.get('actual_cost'), cost_after=after.get('actual_cost'), new_decision=new)

    @staticmethod
    def _report(diagnosis, evaluation, version_id, ab, patch, prompt_name):
        return (f"# Propuesta de parche (no promovida)\n\n"
                f"Versión bifurcada: `{version_id}` publicada solo en **{AB_ENVIRONMENT}**. El simulador sigue usando development.\n\n"
                f"## Diagnóstico\n- Brecha: {diagnosis.get('gap_type')}\n- Causa raíz: {diagnosis.get('root_cause')}\n"
                f"- Sección: {diagnosis.get('prompt_section')}\n- Nodo: {prompt_name}\n- Confianza: {diagnosis.get('confidence')}\n\n"
                f"## Parche propuesto\n\n```\n{patch}\n```\n\n"
                f"## A/B sobre la decisión grabada\n- Coste antes: {evaluation.get('actual_cost')} · regret antes: {evaluation.get('regret')}\n"
                f"- Coste después: {ab.get('cost_after')} · regret después: {ab.get('regret_after')}\n- Run parcheada: {ab.get('run_id')}\n"
                f"- Nota: {ab.get('skipped', 'ok')}\n\n"
                f"Promover a development/producción es una decisión humana. Revisa la versión en el editor antes de hacerlo.\n")
