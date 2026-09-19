"""Local stdio MCP client. Reuses the user's configured OAuth proxy.

No tokens are read, copied, or served to the browser. No inbound tunnel needed.
"""
import json
import os
from pathlib import Path
import queue
import re
import subprocess
import threading
import time

ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = '01a0b8ea-d9af-71f3-9fb7-8a469f9ac25b'
EDGE_NODE = '01a0b96a-d5b4-771c-809c-850010ddbb67'
EDITOR = 'https://platform.eu.happyrobot.ai/hackspainteam9/workflows/mg9barxt86w3/editor/lsjwlrz7rw46'


class HappyRobot:
    def __init__(self):
        self.process = None
        self.messages = queue.Queue()
        self.lock = threading.Lock()
        self.sequence = 0
        self.connected = False
        self.tools = {}

    def close(self):
        if self.process:
            self.process.terminate()
            try:
                self.process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                self.process.kill()
            self.process = None
        self.connected = False

    def _read(self, process, messages):
        for line in process.stdout:
            try:
                messages.put(json.loads(line))
            except json.JSONDecodeError:
                pass
        messages.put({'transport_closed': True})

    def _send(self, value):
        self.process.stdin.write(json.dumps(value)+'\n')
        self.process.stdin.flush()

    def _request(self, method, params, timeout=60):
        self.sequence += 1
        request_id = self.sequence
        self._send(dict(jsonrpc='2.0', id=request_id, method=method, params=params))
        deadline = time.monotonic()+timeout
        while time.monotonic() < deadline:
            try:
                msg = self.messages.get(timeout=max(.01, deadline-time.monotonic()))
            except queue.Empty:
                break
            if msg.get('transport_closed'):
                self.connected = False
                raise RuntimeError('HappyRobot connection closed. Reconnect using your MCP OAuth configuration.')
            if msg.get('id') == request_id:
                if 'error' in msg:
                    raise RuntimeError('HappyRobot MCP rejected the request.')
                return msg['result']
            # Answer standard keepalive requests without exposing transport data.
            if msg.get('method') == 'ping' and 'id' in msg:
                self._send(dict(jsonrpc='2.0', id=msg['id'], result={}))
        raise RuntimeError('HappyRobot timed out; the simulator has paused. Retry explicitly.')

    def connect(self):
        with self.lock:
            if self.connected:
                return
            self.close()
            path = Path(os.environ.get('HAPPYROBOT_MCP_CONFIG', str(ROOT/'.cursor/mcp.json')))
            if not path.exists():
                raise RuntimeError('MCP config missing. Set HAPPYROBOT_MCP_CONFIG to your local MCP JSON configuration.')
            servers = json.loads(path.read_text()).get('mcpServers', {})
            name = os.environ.get('HAPPYROBOT_MCP_SERVER', 'happyrobot-mcp-eu-all')
            config = servers.get(name)
            if not config or not config.get('command'):
                raise RuntimeError('Configure a HappyRobot stdio MCP proxy and complete OAuth first.')
            self.messages = queue.Queue()
            self.process = subprocess.Popen([config['command'], *config.get('args', [])],
                stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                text=True, bufsize=1, cwd=ROOT, env={**os.environ, **config.get('env', {})})
            threading.Thread(target=self._read, args=(self.process, self.messages), daemon=True).start()
            try:
                self._request('initialize', dict(protocolVersion='2024-11-05', capabilities={},
                    clientInfo=dict(name='los-panaderos-simulator', version='0.1')), timeout=45)
                self._send(dict(jsonrpc='2.0', method='notifications/initialized'))
                listing = self._request('tools/list', {})
                self.tools = {t['name']: t for t in listing.get('tools', [])}
                self.connected = True
            except Exception:
                self.close()
                raise

    def tool(self, name, arguments, timeout=60):
        self.connect()
        with self.lock:
            result = self._request('tools/call', dict(name=name, arguments=arguments), timeout)
        if result.get('isError'):
            # These workflow errors contain no credentials; keep a bounded message.
            message = '\n'.join(c.get('text', '') for c in result.get('content', []))
            raise RuntimeError(message[:700])
        return result

    @staticmethod
    def text(result):
        return '\n'.join(c.get('text', '') for c in result.get('content', []))

    @staticmethod
    def decisions(value):
        """Extract structured edge output from MCP JSON/text wrappers, never guess."""
        found = []
        if isinstance(value, dict):
            if {'command', 'target_x', 'target_y', 'reason', 'mission'} <= value.keys():
                found.append(value)
            else:
                for v in value.values():
                    found.extend(HappyRobot.decisions(v))
        elif isinstance(value, list):
            for v in value:
                found.extend(HappyRobot.decisions(v))
        elif isinstance(value, str):
            decoder = json.JSONDecoder()
            pos = 0
            while pos < len(value):
                indexes = [i for i in (value.find('{', pos), value.find('[', pos)) if i >= 0]
                if not indexes:
                    break
                start = min(indexes)
                try:
                    parsed, end = decoder.raw_decode(value[start:])
                    found.extend(HappyRobot.decisions(parsed))
                    pos = start+end
                except json.JSONDecodeError:
                    pos = start+1
        return found

    def decide(self, payload):
        result = self.tool('trigger_run', dict(workflow_id=WORKFLOW, environment='development',
                          payload=json.dumps(payload), wait=True), timeout=330)
        text = self.text(result)
        run_match = re.search(r'Run ID:\s*([0-9a-f-]{36})', text)
        if not run_match or not re.search(r'Status:\s*completed\b', text):
            raise RuntimeError('HappyRobot run did not complete. No command applied.')
        run_id = run_match.group(1)
        # trigger_run returns a status summary. Fetch only the delegated policy's
        # output, then its full payload; never parse the farmer's echoed input.
        listing = self.tool('monitor_runs', dict(action='outputs', run_id=run_id, node_id=EDGE_NODE))
        output_id = self.latest_output(self.text(listing))
        output = self.tool('monitor_runs', dict(action='outputs', run_id=run_id, output_id=output_id))
        evidence = dict(run=result, edge=output)
        text += '\n\n'+self.text(output)
        # Keep the run evidence locally for the dashboard and reproducible checks.
        runtime = ROOT/'.runtime'
        runtime.mkdir(exist_ok=True)
        (runtime/'last-run.json').write_text(json.dumps(evidence, indent=2))
        choices = self.decisions(output)
        if not choices:
            raise RuntimeError('HappyRobot returned no structured drone command. Inspect .runtime/last-run.json and the workflow run.')
        unique = {json.dumps(c, sort_keys=True): c for c in choices}
        if len(unique) != 1:
            raise RuntimeError('HappyRobot returned conflicting commands; no action applied.')
        decision = dict(next(iter(unique.values())))
        # HappyRobot Extract's parameter builder can encode numbers as strings.
        # Accept canonical integers only, without rounding or coercing garbage.
        for field in ('target_x', 'target_y', 'truck_target_x', 'truck_target_y'):
            value = decision.get(field)
            if isinstance(value, str) and re.fullmatch(r'-?\d{1,4}', value):
                decision[field] = int(value)
        if not isinstance(decision['reason'], str) or not isinstance(decision['mission'], str):
            raise RuntimeError('HappyRobot returned an invalid mission or explanation.')
        return decision, text[:16000]

    @staticmethod
    def latest_output(listing):
        # Central may revise a delegation within a run. These are proposals:
        # execute only the final successful policy output after the run completes.
        outputs = []
        for block in listing.split('## '):
            oid = re.search(r'Output ID:\s*([0-9a-f-]{36})', block)
            ts = re.search(r'Timestamp:\s*(\S+)', block)
            if oid and ts:
                outputs.append((ts.group(1), oid.group(1), bool(re.search(r'Status:\s*succeeded\b', block))))
        if not outputs:
            raise RuntimeError('No delegated drone output was returned; no command applied.')
        latest = max(outputs)
        if not latest[2]:
            raise RuntimeError('The final drone decision failed; no command applied.')
        return latest[1]
