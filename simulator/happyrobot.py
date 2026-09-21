"""Local stdio MCP client. Reuses the user's configured OAuth proxy.

OAuth tokens stay in the local MCP cache; expired sessions are refreshed there.
Credentials are never logged or served to the browser. No inbound tunnel needed.

Workflow and node ids come from .env (see .env.example); the literals below are the
last known good values. HappyRobot regenerates node ids on every workflow edit.

Targets (HAPPYROBOT_TARGET):
  dispatch (default)  Despacho Central: decides who to call/alert (phone + Telegram)
                      and delegates the drone mission to the Los Panaderos sub-workflow.
  drone               Los Panaderos directly: drone/scout/truck orders only, no comms.
"""
import json
import os
from pathlib import Path
import re
import subprocess
import threading
import time

from .contacts import directory as contact_directory, load_env

ROOT = Path(__file__).resolve().parents[1]

# HappyRobot rewrites every node id whenever the workflow is edited, so all of them are
# overridable from .env and the values below are only the last known good defaults.
# load_env() has to run BEFORE the os.environ reads underneath: without it a .env entry
# is read after the fact and silently ignored.
load_env()

TARGETS = dict(
    dispatch=dict(
        workflow='01a0baad-da0f-7939-aafa-7d587f577741',
        editor='https://platform.eu.happyrobot.ai/hackspainteam9/workflows/zqtnabjy5loj/editor/w5808pkx8wb4',
        # Persistent node IDs inside Despacho Central v21 (one event per run).
        drone_node='01a0bde1-1c8d-7806-bb72-27af172e818a',      # Ejecutar mision de dron
        dispatch_node='01a0bde1-1cd3-7228-af08-82db533a0c92',   # Decision de Despacho
        comm_nodes={'01a0bde1-1cc9-7b27-9ff8-6def362c103b': 'call',            # Llamar a esta persona
                    '01a0bde1-1c9a-7dd3-a0af-b84a82d001c2': 'zone_alert',      # Enviar alerta de zona
                    '01a0bde1-1ca6-738c-87f5-4537fb7a11ca': 'personal_message'}),  # Enviar informacion personal
    drone=dict(
        workflow='01a0b8ea-d9af-71f3-9fb7-8a469f9ac25b',
        editor='https://platform.eu.happyrobot.ai/hackspainteam9/workflows/mg9barxt86w3/editor/lq3pyryjou20',
        drone_node='01a0bad1-9191-7f3d-8200-f4e2e34ba5a1',      # Resultado de la mision
        dispatch_node=None, comm_nodes={}),
)
TARGET = TARGETS.get(os.environ.get('HAPPYROBOT_TARGET', 'dispatch'), TARGETS['dispatch'])
WORKFLOW = os.environ.get('HAPPYROBOT_WORKFLOW_ID', TARGET['workflow'])
EDGE_NODE = os.environ.get('HAPPYROBOT_DRONE_NODE', TARGET['drone_node'])
DISPATCH_NODE = os.environ.get('HAPPYROBOT_DISPATCH_NODE', TARGET['dispatch_node'])
# Older mission node, tried when the current one produced no output. A workflow edit that
# moves the mission node then degrades to the previous one instead of failing the demo.
LEGACY_EDGE_NODE = os.environ.get('HAPPYROBOT_LEGACY_DRONE_NODE', '01a0b96a-d5b4-771c-809c-850010ddbb67')
COMM_NODE_ENV = dict(call='HAPPYROBOT_CALL_NODE',
                     zone_alert='HAPPYROBOT_ZONE_ALERT_NODE',
                     personal_message='HAPPYROBOT_PERSONAL_MESSAGE_NODE')


def comm_nodes(defaults):
    """node id -> kind. A kind set in .env replaces its default id; the rest stay."""
    chosen = {kind: os.environ.get(key, '').strip() for kind, key in COMM_NODE_ENV.items()}
    nodes = {node: kind for node, kind in defaults.items() if not chosen.get(kind)}
    nodes.update({node: kind for kind, node in chosen.items() if node})
    return nodes


COMM_NODES = comm_nodes(TARGET['comm_nodes'])
EDITOR = os.environ.get('HAPPYROBOT_EDITOR', TARGET['editor'])

STATE_RESULT_NODE = os.environ.get('HAPPYROBOT_STATE_RESULT_NODE', '01a0bde1-1cdb-77cf-b9ec-e9749375100e')

DECISION_KEYS = {'command', 'target_x', 'target_y', 'reason', 'mission'}
ORDER_KEYS = {'extinguisher_orders', 'scout_orders', 'truck_orders'}


class HappyRobot:
    def __init__(self):
        self.process = None
        self.lock = threading.Lock()        # connect/close
        self.send_lock = threading.Lock()   # stdin writes are atomic per JSON line
        self.pending_lock = threading.Lock()
        self.pending = {}                   # request id -> dict(event, message)
        self.closed = threading.Event()
        self.sequence = 0
        self.connected = False
        self.tools = {}
        self.last_dispatch = None
        self.last_communications = []
        self.last_timings = {}

    def close(self):
        if self.process:
            self.process.terminate()
            try:
                self.process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                self.process.kill()
            self.process = None
        self.connected = False

    def _read(self, process, pending, closed):
        """Reader thread: route each JSON-RPC response to its waiting request so several
        requests can be in flight at once on the single stdio transport."""
        for line in process.stdout:
            try:
                msg = json.loads(line)
            except json.JSONDecodeError:
                continue
            # Answer standard keepalive requests without exposing transport data.
            if msg.get('method') == 'ping' and 'id' in msg:
                try:
                    self._send(dict(jsonrpc='2.0', id=msg['id'], result={}))
                except OSError:
                    pass
                continue
            if 'id' in msg:
                with self.pending_lock:
                    slot = pending.get(msg['id'])
                if slot is not None:
                    slot['message'] = msg
                    slot['event'].set()
        closed.set()
        with self.pending_lock:
            for slot in pending.values():
                slot['event'].set()

    def _send(self, value):
        with self.send_lock:
            self.process.stdin.write(json.dumps(value)+'\n')
            self.process.stdin.flush()

    def _request(self, method, params, timeout=60):
        deadline = getattr(self, '_decision_deadline', None)
        if deadline is not None:
            timeout = min(timeout, deadline-time.monotonic())
            if timeout <= 0:
                raise RuntimeError('HappyRobot exceeded the 120-second decision limit. No command applied.')
        with self.pending_lock:
            self.sequence += 1
            request_id = self.sequence
            slot = dict(event=threading.Event(), message=None)
            self.pending[request_id] = slot
        try:
            self._send(dict(jsonrpc='2.0', id=request_id, method=method, params=params))
            finished = slot['event'].wait(timeout)
        finally:
            with self.pending_lock:
                self.pending.pop(request_id, None)
        if self.closed.is_set() and slot['message'] is None:
            self.connected = False
            raise RuntimeError('HappyRobot connection closed. Reconnect using your MCP OAuth configuration.')
        if not finished or slot['message'] is None:
            if deadline is not None and time.monotonic() >= deadline:
                raise RuntimeError('HappyRobot exceeded the 120-second decision limit. No command applied.')
            label = params.get('name', method)
            args = params.get('arguments', {})
            stage = '/'.join(str(v) for v in (label, args.get('action'), args.get('output_id')) if v)
            raise RuntimeError(f'HappyRobot transport timed out during {stage}; run {args.get("run_id", "not yet acknowledged")}. No command applied.')
        msg = slot['message']
        if 'error' in msg:
            raise RuntimeError('HappyRobot MCP rejected the request.')
        return msg['result']

    @staticmethod
    def refresh_expired_session(config):
        """Refresh the configured EU MCP login before its expired token causes HTTP 500."""
        import hashlib
        import urllib.parse
        import urllib.request
        url = next((a for a in config.get('args', []) if a.startswith('https://mcp.platform.eu.happyrobot.ai/')), None)
        if not url:
            return
        key = hashlib.md5(url.encode()).hexdigest()
        files = list((Path.home()/'.mcp-auth').glob(f'*/{key}_tokens.json'))
        if not files:
            return  # Normal MCP OAuth login handles new installations.
        cache = max(files, key=lambda p: p.stat().st_mtime)
        import fcntl
        # All local ports share one OAuth cache; serialize refresh-token rotation.
        with cache.with_suffix('.lock').open('a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            tokens = json.loads(cache.read_text())
            lifetime = float(tokens.get('expires_in') or 0)
            if lifetime <= 0 or time.time() < cache.stat().st_mtime + lifetime - 120:
                return
            client = json.loads(cache.with_name(key+'_client_info.json').read_text())
            body = urllib.parse.urlencode(dict(grant_type='refresh_token',
                refresh_token=tokens['refresh_token'], client_id=client['client_id'])).encode()
            req = urllib.request.Request('https://platform.eu.happyrobot.ai/api/mcp/token', data=body,
                headers={'Content-Type': 'application/x-www-form-urlencoded'})
            try:
                with urllib.request.urlopen(req, timeout=10) as response:
                    fresh = json.load(response)
                if not fresh.get('access_token'):
                    raise ValueError('Missing token')
            except Exception:
                raise RuntimeError('HappyRobot OAuth session expired and refresh failed. Reconnect the HappyRobot MCP login.') from None
            temp = cache.with_suffix('.tmp')
            # Create with owner-only permissions before writing credentials.
            fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
            with os.fdopen(fd, 'w') as output:
                json.dump({**tokens, **fresh}, output)
            temp.replace(cache)

    def connect(self):
        with self.lock:
            if self.connected:
                return
            self.close()
            path = Path(os.environ.get('HAPPYROBOT_MCP_CONFIG', str(ROOT/'.cursor/mcp.json')))
            if not path.exists():
                raise RuntimeError('MCP config missing. Set HAPPYROBOT_MCP_CONFIG to your local MCP JSON configuration.')
            servers = json.loads(path.read_text(encoding='utf-8')).get('mcpServers', {})
            name = os.environ.get('HAPPYROBOT_MCP_SERVER', 'happyrobot-mcp-eu-all')
            config = servers.get(name)
            if not config or not config.get('command'):
                raise RuntimeError('Configure a HappyRobot stdio MCP proxy and complete OAuth first.')
            self.refresh_expired_session(config)
            self.pending = {}
            self.closed = threading.Event()
            self.process = subprocess.Popen([config['command'], *config.get('args', [])],
                stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                text=True, bufsize=1, cwd=ROOT, env={**os.environ, **config.get('env', {})})
            threading.Thread(target=self._read, args=(self.process, self.pending, self.closed), daemon=True).start()
            try:
                self._request('initialize', dict(protocolVersion='2024-11-05', capabilities={},
                    clientInfo=dict(name='los-panaderos-simulator', version='0.2')), timeout=45)
                self._send(dict(jsonrpc='2.0', method='notifications/initialized'))
                listing = self._request('tools/list', {})
                self.tools = {t['name']: t for t in listing.get('tools', [])}
                self.connected = True
            except Exception:
                self.close()
                raise

    def trigger_http(self, arguments, timeout):
        """Trigger through the provider API using the same authorized local OAuth session."""
        import hashlib
        import urllib.parse
        import urllib.request
        import urllib.error
        path = Path(os.environ.get('HAPPYROBOT_MCP_CONFIG', str(ROOT/'.cursor/mcp.json')))
        config = json.loads(path.read_text())['mcpServers'][os.environ.get('HAPPYROBOT_MCP_SERVER', 'happyrobot-mcp-eu-all')]
        self.refresh_expired_session(config)
        url = next(a for a in config['args'] if a.startswith('https://mcp.platform.eu.happyrobot.ai/'))
        key = hashlib.md5(url.encode()).hexdigest()
        files = list((Path.home()/'.mcp-auth').glob(f'*/{key}_tokens.json'))
        if not files:
            raise RuntimeError('HappyRobot OAuth login missing; connect MCP first.')
        token = json.loads(max(files, key=lambda p:p.stat().st_mtime).read_text())['access_token']
        payload = arguments.get('payload', {})
        if isinstance(payload, str):payload=json.loads(payload)
        body = json.dumps(dict(payload=payload, environment=arguments.get('environment', 'development'))).encode()
        endpoint = 'https://api.platform.eu.happyrobot.ai/workflows/'+urllib.parse.quote(arguments['workflow_id'], safe='')+'/runs'
        req = urllib.request.Request(endpoint, data=body, headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
        deadline=getattr(self, '_decision_deadline', None)
        if deadline is not None:
            timeout=min(timeout, deadline-time.monotonic())
            if timeout<=0:raise RuntimeError('HappyRobot exceeded the 120-second decision limit. No command applied.')
        try:
            with urllib.request.urlopen(req, timeout=timeout) as response:result=json.load(response)
        except urllib.error.HTTPError as exc:
            raise RuntimeError(f'HappyRobot HTTP trigger failed ({exc.code}). No automatic retrigger.') from None
        except (TimeoutError, urllib.error.URLError):
            raise RuntimeError('HappyRobot HTTP trigger timed out; acknowledgement uncertain.') from None
        run_id=result.get('run_id')
        if not run_id:
            raise RuntimeError('HappyRobot HTTP trigger returned no run ID; acknowledgement uncertain.')
        return {'content':[{'text':f'Run ID: {run_id}\nStatus: {result.get("status", "running")}'}]}

    def tool(self, name, arguments, timeout=60):
        if name == 'trigger_run' and os.environ.get('HAPPYROBOT_TRIGGER_TRANSPORT') == 'http':
            return self.trigger_http(arguments, timeout)
        # Refresh authentication before each new decision, including after idle periods.
        # A fresh transport does not create a duplicate workflow run.
        if name == 'trigger_run':
            self.close()
        self.connect()
        readonly = name == 'monitor_runs' and arguments.get('action') in {'get', 'outputs'}
        try:
            result = self._request('tools/call', dict(name=name, arguments=arguments), min(timeout, 20) if readonly else timeout)
        except RuntimeError as exc:
            if not readonly or not any(word in str(exc).lower() for word in ('timed out', 'connection closed')):
                raise
            # Reopen the stalled OAuth bridge and retry ONLY this read. The workflow
            # itself is never retriggered, so calls/messages cannot be duplicated.
            self.close()
            self.connect()
            result = self._request('tools/call', dict(name=name, arguments=arguments), min(timeout, 20))
        if result.get('isError'):
            # These workflow errors contain no credentials; keep a bounded message.
            message = '\n'.join(c.get('text', '') for c in result.get('content', []))
            raise RuntimeError(message[:700])
        return result

    @staticmethod
    def text(result):
        return '\n'.join(c.get('text', '') for c in result.get('content', []))

    # ---- payload parsing -------------------------------------------------

    @staticmethod
    def json_values(value):
        """Yield every JSON object/array found in MCP wrappers, including JSON embedded in text."""
        if isinstance(value, dict):
            yield value
            for v in value.values():
                yield from HappyRobot.json_values(v)
        elif isinstance(value, list):
            yield value
            for v in value:
                yield from HappyRobot.json_values(v)
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
                    yield from HappyRobot.json_values(parsed)
                    pos = start+end
                except json.JSONDecodeError:
                    pos = start+1

    @staticmethod
    def normalize(value):
        """Map Resultado-de-la-mision shape onto the legacy edge command shape. Returns None if not a mission."""
        if not isinstance(value, dict):
            return None
        d = dict(value)
        if 'primary_command' in d and 'command' not in d:
            d['command'] = d.pop('primary_command')
        if 'drone_reason' in d and 'reason' not in d:
            d['reason'] = d.pop('drone_reason')
        if 'primary_district_id' in d and 'district_id' not in d:
            d['district_id'] = d.pop('primary_district_id')
        has_orders = any(k in d for k in ORDER_KEYS)
        if not (('command' in d and 'reason' in d and 'mission' in d) and (has_orders or {'target_x', 'target_y'} <= d.keys())):
            return None
        if has_orders and ('target_x' not in d or 'target_y' not in d):
            orders = d.get('extinguisher_orders')
            if isinstance(orders, str):
                try:
                    orders = json.loads(orders)
                except ValueError:
                    orders = []
            first = next((o for o in orders or [] if isinstance(o, dict)), {})
            d.setdefault('target_x', first.get('target_x', 0))
            d.setdefault('target_y', first.get('target_y', 0))
        if 'truck_command' not in d and 'truck_orders' in d:
            # Legacy single-truck mirror, kept so Simulation.apply still has a fallback when
            # a run returns truck_orders only.
            orders = d.get('truck_orders')
            if isinstance(orders, str):
                try:
                    orders = json.loads(orders)
                except ValueError:
                    orders = []
            truck = next((o for o in orders or [] if isinstance(o, dict)), {})
            d['truck_command'] = truck.get('command', 'continue')
            d.setdefault('truck_target_x', truck.get('target_x', 0))
            d.setdefault('truck_target_y', truck.get('target_y', 0))
        return d

    @staticmethod
    def decisions(value):
        """Extract structured drone missions from MCP JSON/text wrappers, never guess."""
        found, seen = [], set()
        for item in HappyRobot.json_values(value):
            if not isinstance(item, dict):
                continue
            if DECISION_KEYS <= item.keys():
                candidate = dict(item)
            else:
                candidate = HappyRobot.normalize(item)
            if candidate is None:
                continue
            key = json.dumps(candidate, sort_keys=True, default=str)
            if key not in seen:
                seen.add(key)
                found.append(candidate)
        return found

    @staticmethod
    def dispatch_summary(value):
        for item in HappyRobot.json_values(value):
            if isinstance(item, dict) and 'decision' in item and 'justificacion' in item:
                return {k: item.get(k) for k in ('incident_id', 'decision', 'justificacion', 'criticidad', 'avisos_lanzados', 'destinatarios', 'datos_faltantes')}
        return None

    @staticmethod
    def communication(kind, value, contacts, run_id=None):
        """Turn a call/Telegram node payload into a simulator communication record."""
        # Call/Telegram nodes are sub-workflow calls: their output is the child's response
        # (status, audience_label, message_sent, summary...) and may or may not echo the inputs.
        text_keys = ('information', 'message_sent', 'summary')
        who_keys = ('contact_name', 'audience_label', 'chat_id', 'phone_number', 'action', 'alert_type')
        payload = {}
        for item in HappyRobot.json_values(value):
            if isinstance(item, dict) and (any(k in item for k in text_keys) or any(k in item for k in who_keys)):
                for k, v in item.items():
                    if k not in payload and v not in (None, ''):
                        payload[k] = v
        if not any(k in payload for k in text_keys + who_keys):
            return None
        if 'call_workflow_data' in payload and str(payload['call_workflow_data'].get('status', '')) == 'failed':
            payload.setdefault('status', 'failed')
        chat_id = str(payload.get('chat_id') or '')
        name = str(payload.get('contact_name') or payload.get('audience_label') or '')
        phone = str(payload.get('phone_number') or '')
        information = next((str(payload[k]) for k in text_keys if payload.get(k)), '')
        district = None
        for d in contacts['districts']:
            if (chat_id and d.get('chat_id') == chat_id) or (name and d.get('name') and d['name'].lower() in name.lower()):
                district = d['district_id']
        for p in contacts['people']:
            if (phone and p.get('phone_number') == phone) or (chat_id and p.get('chat_id') == chat_id) or (name and p['contact_name'].lower() in name.lower()):
                district = district or p['district_id']
                name = p['contact_name']
        status = 'sent'
        for item in HappyRobot.json_values(value):
            if not isinstance(item, dict):
                continue
            for key in ('call_status', 'delivery_status', 'send_status', 'outcome', 'status'):
                found = item.get(key)
                if isinstance(found, str) and found and found not in {'succeeded', 'completed'}:
                    status = found[:40]
                    break
        if payload.get('status') == 'no_recipients' or payload.get('recipients_delivered') == 0 and payload.get('recipients_attempted'):
            status = str(payload.get('status') or 'failed')
        return dict(kind=kind, district_id=district, contact_name=name, criticality=payload.get('criticality'),
                    # `action` tells the simulator whether a zone alert ORDERS an evacuation or just
                    # informs. Absent, Simulation.alert_action falls back to criticality and flags it.
                    action=payload.get('action') or payload.get('alert_type'),
                    information=information, status=status, run_id=run_id)

    # ---- run orchestration -----------------------------------------------

    def decide(self, payload):
        self._decision_deadline = time.monotonic() + 120
        self._active_run_id = None
        try:
            return self._decide_once(payload)
        except Exception:
            if self._active_run_id:
                run_id = self._active_run_id
                self._active_run_id = None
                # Cancellation is a separate bounded request, outside the expired budget.
                self._decision_deadline = None
                def cancel():
                    try:
                        self.tool('monitor_runs', dict(action='cancel', run_id=run_id), timeout=5)
                    except Exception:
                        pass
                threading.Thread(target=cancel, daemon=True).start()
            raise
        finally:
            self._decision_deadline = None

    def recover_trigger(self, payload):
        if not payload.get('event_id') or not payload.get('incident_id'):
            return None
        self.close()
        listing = self.text(self.tool('monitor_runs', dict(action='list', workflow_id=WORKFLOW, page_size=5)))
        runs = re.findall(r'\[(?:COMPLETED|RUNNING|FAILED|SCHEDULED|CANCELED)\]\s+([0-9a-f-]{36})', listing)
        trigger_node = os.environ.get('HAPPYROBOT_TRIGGER_NODE', '01a0be09-4655-7e6a-baa8-915989a7e818')
        for run_id in runs:
            entries = self.text(self.tool('monitor_runs', dict(action='outputs', run_id=run_id, node_id=trigger_node)))
            for oid in self.outputs_by_node(entries).get(trigger_node, []):
                output = self.tool('monitor_runs', dict(action='outputs', run_id=run_id, output_id=oid))
                if any(isinstance(v, dict) and v.get('event_id') == payload['event_id']
                       and v.get('incident_id') == payload['incident_id'] for v in self.json_values(output)):
                    self._active_run_id = run_id
                    status = self.tool('monitor_runs', dict(action='get', run_id=run_id))
                    return {'content': [{'text': self.text(status)+'\nRun ID: '+run_id}]}
        return None

    def _decide_once(self, payload):
        self.last_dispatch, self.last_communications = None, []
        timings = {}
        started = time.monotonic()
        try:
            result = self.tool('trigger_run', dict(workflow_id=WORKFLOW, environment='development',
                              payload=json.dumps(payload), wait=False), timeout=30)
        except RuntimeError as exc:
            if 'timed out' not in str(exc).lower():
                raise
            # An uncertain trigger may already have side effects. Recover by exact
            # event identity, never by newest run or by triggering again.
            result = self.recover_trigger(payload)
            if result is None:
                raise RuntimeError('HappyRobot trigger acknowledgement was lost; no matching run found. Paused without retriggering.') from exc
        text = self.text(result)
        match = re.search(r'Run ID:\s*([0-9a-f-]{36})', text)
        if not match:
            raise RuntimeError('HappyRobot did not return a run ID. '+text[-700:])
        self._active_run_id = match.group(1)
        while not re.search(r'Status:\s*(completed|failed|canceled)\b', text):
            remaining = self._decision_deadline-time.monotonic()
            if remaining <= 0:
                raise RuntimeError('HappyRobot exceeded the 120-second decision limit. No command applied.')
            time.sleep(min(2, remaining))
            try:
                result = self.tool('monitor_runs', dict(action='get', run_id=self._active_run_id), timeout=min(30, remaining))
            except RuntimeError as exc:
                # A stalled read is not a failed run. Recheck this same run within
                # the overall deadline, never trigger a duplicate mission.
                if 'timed out' in str(exc).lower():
                    continue
                raise
            text = self.text(result)
            # Run-details responses use ID instead of Run ID.
            if 'Run ID:' not in text:
                text += '\nRun ID: '+self._active_run_id
        timings['run'] = round(time.monotonic()-started, 1)
        run_match = re.search(r'Run ID:\s*([0-9a-f-]{36})', text)
        if not run_match or not re.search(r'Status:\s*completed\b', text):
            raise RuntimeError('HappyRobot run did not complete. No command applied. '+text[-1200:])
        run_id = run_match.group(1)
        self._active_run_id = None
        # trigger_run returns a status summary. Fetch the run's node outputs, then only the
        # payloads we act on: the delegated drone mission, the dispatch summary and every
        # call/Telegram action that actually ran. Never parse the echoed input.
        step = time.monotonic()
        if 'Node Persistent ID' in text and 'Output ID' in text:
            listing = text  # wait=True already returned the node listing; skip a round-trip.
        else:
            listing = self.text(self.tool('monitor_runs', dict(action='outputs', run_id=run_id)))
        outputs = self.outputs_by_node(listing)
        evidence = dict(run=result, outputs={})
        contacts = contact_directory()
        mission_node = EDGE_NODE if outputs.get(EDGE_NODE) else (LEGACY_EDGE_NODE if outputs.get(LEGACY_EDGE_NODE) else EDGE_NODE)
        if mission_node != EDGE_NODE:
            text += f'\n\nMission read from the legacy node {mission_node}; the configured node produced no output.'
        drone_outputs = outputs.get(mission_node, [])
        state_output_id = self.latest_output(listing, STATE_RESULT_NODE) if outputs.get(STATE_RESULT_NODE) else None
        wanted = list(outputs.get(DISPATCH_NODE, []) if DISPATCH_NODE else [])
        wanted += [oid for node in COMM_NODES for oid in outputs.get(node, [])]
        drone_output_id = self.latest_output(listing, mission_node) if drone_outputs else None
        if drone_output_id:
            wanted.append(drone_output_id)
        if state_output_id:
            wanted.append(state_output_id)
        # Serialize reads so a stalled bridge can reconnect without interrupting other requests.
        fetched = self.fetch_outputs(run_id, wanted)
        evidence['outputs'].update(fetched)
        timings['fetch'] = round(time.monotonic()-step, 1)
        timings['fetched'] = len(wanted)
        for oid in outputs.get(DISPATCH_NODE, []) if DISPATCH_NODE else []:
            self.last_dispatch = self.dispatch_summary(fetched[oid]) or self.last_dispatch
        for node, kind in COMM_NODES.items():
            for oid in outputs.get(node, []):
                record = self.communication(kind, fetched[oid], contacts, run_id)
                if record:
                    self.last_communications.append(record)
        # Event-driven Despacho persists these same records in Cloudflare.
        # Read its final payload rather than reconstructing effects from child outputs.
        if state_output_id:
            for item in self.json_values(fetched[state_output_id]):
                if isinstance(item, dict) and 'pending_command' in item and 'communications_sent' in item:
                    self.last_dispatch = item.get('last_dispatch') or self.last_dispatch
                    self.last_communications = item.get('communications_sent') or []
                    break
        decision = None
        if drone_output_id:
            output = fetched[drone_output_id]
            text += '\n\n'+self.text(output)
            choices = self.decisions(output)
            if not choices:
                raise RuntimeError('HappyRobot returned no structured drone command. Inspect .runtime/last-run.json and the workflow run.')
            unique = {json.dumps(c, sort_keys=True, default=str): c for c in choices}
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
        elif not self.last_dispatch and not self.last_communications:
            raise RuntimeError('HappyRobot completed without a drone mission, dispatch decision or communication. Inspect .runtime/last-run.json.')
        if self.last_dispatch:
            text += '\n\nDispatch: '+json.dumps(self.last_dispatch, ensure_ascii=False)
        if self.last_communications:
            text += '\n\nCommunications: '+json.dumps(self.last_communications, ensure_ascii=False)
        timings['total'] = round(time.monotonic()-started, 1)
        self.last_timings = timings
        text = f"Timing: run {timings['run']}s · outputs {timings['fetch']}s ({timings['fetched']} fetched in parallel) · total {timings['total']}s\n\n"+text
        # Keep the run evidence locally for the dashboard and reproducible checks.
        runtime = ROOT/'.runtime'
        runtime.mkdir(exist_ok=True)
        evidence['timings'] = timings
        (runtime/'last-run.json').write_text(json.dumps(evidence, indent=2, ensure_ascii=False), encoding='utf-8')
        return decision, text[:16000]

    def fetch_outputs(self, run_id, output_ids):
        """Read each unique output once; serialized to allow safe bridge recovery."""
        return {oid: self.tool('monitor_runs', dict(action='outputs', run_id=run_id, output_id=oid))
                for oid in dict.fromkeys(output_ids)}

    @staticmethod
    def outputs_by_node(listing):
        """Map node persistent ID -> [output IDs] from a monitor_runs outputs listing."""
        outputs = {}
        for block in listing.split('## '):
            oid = re.search(r'Output ID:\s*([0-9a-f-]{36})', block)
            node = re.search(r'Node Persistent ID:\s*([0-9a-f-]{36})', block)
            ok = bool(re.search(r'Status:\s*succeeded\b', block))
            if oid and node and ok:
                outputs.setdefault(node.group(1), []).append(oid.group(1))
        return outputs

    @staticmethod
    def latest_output(listing, node=None):
        # Central may revise a delegation within a run. These are proposals:
        # execute only the final successful policy output after the run completes.
        outputs = []
        for block in listing.split('## '):
            oid = re.search(r'Output ID:\s*([0-9a-f-]{36})', block)
            ts = re.search(r'Timestamp:\s*(\S+)', block)
            pid = re.search(r'Node Persistent ID:\s*([0-9a-f-]{36})', block)
            if node and pid and pid.group(1) != node:
                continue
            if oid and ts:
                outputs.append((ts.group(1), oid.group(1), bool(re.search(r'Status:\s*succeeded\b', block))))
        if not outputs:
            raise RuntimeError('No delegated drone output was returned; no command applied.')
        latest = max(outputs)
        if not latest[2]:
            raise RuntimeError('The final drone decision failed; no command applied.')
        return latest[1]
