const test = require('node:test');
const assert = require('node:assert/strict');

const { revertStatusForFailedCommand } = require('../src/lib/outletStatus');

/**
 * A toggle sent to a Hub that is not listening used to leave the outlet showing
 * the position the app asked for, permanently.
 *
 * The reconciliation in resolveOutletStatus only runs on telemetry, and a
 * device that never polled for the command is not posting telemetry either. So
 * the optimistic status written at dispatch was never revisited: the command
 * timed out after 45 seconds, the user got a notification saying it failed, and
 * the outlet still read "on" until they switched it back by hand.
 *
 * Seen on 24 Aug 2026 with the ESP32 unplugged - outlet 1 toggled on at 3:18 PM,
 * reported timeout at 3:20 PM, and stayed on.
 *
 * The command carries the position the outlet held when it was issued, so the
 * revert is to a recorded value rather than a guess from the action.
 */

test('reverts to the status the outlet held when the command was issued', () => {
  assert.deepEqual(
    revertStatusForFailedCommand({ action: 'on', metadata: { statusBefore: 'off' } }),
    { status: 'off' }
  );
  assert.deepEqual(
    revertStatusForFailedCommand({ action: 'off', metadata: { statusBefore: 'on' } }),
    { status: 'on' }
  );
});

test('the action is not consulted - only what was recorded', () => {
  // An "off" command whose outlet was already off reverts to off, not to the
  // opposite of the action. Guessing from the action would invert this.
  assert.deepEqual(
    revertStatusForFailedCommand({ action: 'off', metadata: { statusBefore: 'off' } }),
    { status: 'off' }
  );
});

test('a command with nothing recorded leaves the outlet alone', () => {
  assert.equal(revertStatusForFailedCommand({ action: 'on' }), null);
  assert.equal(revertStatusForFailedCommand({ action: 'on', metadata: {} }), null);
  assert.equal(revertStatusForFailedCommand({}), null);
  assert.equal(revertStatusForFailedCommand(), null);
});

test('an unreadable recorded status is ignored rather than guessed at', () => {
  for (const bad of ['', '   ', 'ON_MAYBE', 'true', '1', null, undefined, 42, {}]) {
    assert.equal(
      revertStatusForFailedCommand({ metadata: { statusBefore: bad } }),
      null,
      `expected null for ${JSON.stringify(bad)}`
    );
  }
});

test('case and padding do not defeat the revert', () => {
  assert.deepEqual(
    revertStatusForFailedCommand({ metadata: { statusBefore: '  ON  ' } }),
    { status: 'on' }
  );
  assert.deepEqual(
    revertStatusForFailedCommand({ metadata: { statusBefore: 'Off' } }),
    { status: 'off' }
  );
});
