import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeState } from './index.js';

test('same session_id keeps seen, pending_command and last_dispatch', () => {
  const current = {
    session_id: 'new-session',
    loop_seen_generation: 0,
    pending_command: null,
    last_dispatch: null,
    public_message: 'reset',
  };
  const next = mergeState(current, {
    session_id: 'new-session',
    loop_seen_generation: 3,
    pending_command: { command_id: 'abc', command: 'contain' },
    last_dispatch: { decision: 'avisar' },
    public_message: 'ok',
  });
  assert.equal(next.loop_seen_generation, 3);
  assert.equal(next.pending_command.command_id, 'abc');
  assert.equal(next.last_dispatch.decision, 'avisar');
  assert.equal(next.session_id, 'new-session');
  assert.equal(next.public_message, 'ok');
});

test('mismatched session_id ignores seen, pending_command and last_dispatch', () => {
  const current = {
    session_id: 'new-session',
    loop_seen_generation: 0,
    pending_command: null,
    last_dispatch: null,
    public_message: '',
    communications_sent: [],
  };
  const next = mergeState(current, {
    session_id: 'stale-session',
    loop_seen_generation: 7,
    pending_command: { command_id: 'old', command: 'hold' },
    last_dispatch: { decision: 'vieja' },
    public_message: 'stale advice',
    communications_sent: [{ kind: 'zone_alert', status: 'sent' }],
  });
  assert.equal(next.session_id, 'new-session');
  assert.equal(next.loop_seen_generation, 0);
  assert.equal(next.pending_command, null);
  assert.equal(next.last_dispatch, null);
  assert.equal(next.public_message, 'stale advice');
  assert.equal(next.communications_sent.length, 1);
});

test('missing incoming session_id does not trip the guard', () => {
  const current = {
    session_id: 'new-session',
    loop_seen_generation: 0,
    pending_command: null,
  };
  const next = mergeState(current, {
    loop_seen_generation: 2,
    pending_command: { command_id: 'x' },
  });
  assert.equal(next.loop_seen_generation, 2);
  assert.equal(next.pending_command.command_id, 'x');
});
