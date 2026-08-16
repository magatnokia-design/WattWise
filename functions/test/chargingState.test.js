const test = require('node:test');
const assert = require('node:assert/strict');

const {
  updateChargingState,
  SETTLED_HOLD_MS,
  MIN_RUN_MS,
} = require('../src/lib/chargingState');

const AT = 1786800000000;
const MINUTE = 60 * 1000;

// Feeds a sequence of [minutesFromStart, watts] through the state machine.
const run = (points, { status = 'on', start = null } = {}) => {
  let state = start;
  const settledAt = [];

  points.forEach(([minute, watts]) => {
    state = updateChargingState(state, {
      status,
      powerW: watts,
      timestampMs: AT + (minute * MINUTE),
    });
    if (state.justSettled) settledAt.push(minute);
  });

  return { state, settledAt };
};

test('a phone charge tapering to standby is reported once', () => {
  // The CC-CV curve: hard while filling, tapering, then resting.
  const { state, settledAt } = run([
    [0, 28], [2, 27], [4, 25], [6, 20], [8, 14],
    [10, 8], [12, 3], [14, 0.4], [16, 0.3], [20, 0.3], [25, 0.3],
  ]);

  assert.equal(state.state, 'settled');
  assert.equal(settledAt.length, 1, 'exactly one notification for one charge');
  assert.ok(settledAt[0] >= 14 + (SETTLED_HOLD_MS / MINUTE), 'not before the hold elapsed');
});

test('the taper alone does not fire - the level has to hold', () => {
  // Passes through settled values on the way down and stops there. Without the
  // hold this would fire mid-charge, which is the whole failure mode.
  const { state, settledAt } = run([
    [0, 30], [1, 20], [2, 10], [3, 4], [4, 3],
  ]);

  assert.equal(settledAt.length, 0);
  assert.equal(state.state, 'charging');
});

test('a fan dropped to a lower speed never qualifies', () => {
  // 56 W to 35 W is 62% of peak and nowhere near the absolute ceiling, so it
  // cannot settle however long it runs. This is the false positive the
  // absolute limit exists to stop.
  const { state, settledAt } = run([
    [0, 56], [5, 56], [10, 35], [20, 35], [40, 35], [90, 35],
  ]);

  assert.equal(settledAt.length, 0);
  assert.equal(state.state, 'charging');
});

test('a load too small to be a charge is ignored', () => {
  // An LED lamp at 4 W switched off: never reached the minimum peak, so there
  // was no charge to finish.
  const { state, settledAt } = run([
    [0, 4], [5, 4], [10, 4], [20, 0.3], [30, 0.3], [40, 0.3],
  ]);

  assert.equal(settledAt.length, 0);
  assert.notEqual(state.state, 'settled');
});

test('a brief blip is not a charge', () => {
  // High then low inside the minimum run length - a plug being wiggled.
  const { state, settledAt } = run([
    [0, 30], [0.5, 0.3], [1, 0.3], [2, 0.3],
  ]);

  assert.equal(settledAt.length, 0);
  assert.ok(MIN_RUN_MS > 2 * MINUTE, 'the guard is what rejects this');
  assert.equal(state.state, 'charging');
});

test('a charge that picks back up clears the settle timer', () => {
  // A laptop resting, then waking and drawing again. The timer must restart,
  // or the next dip fires immediately on a stale clock.
  const { state, settledAt } = run([
    [0, 40], [5, 40], [10, 2], [12, 2],
    [14, 35], [20, 35],
    [25, 2], [27, 2],
  ]);

  assert.equal(settledAt.length, 0, 'the second rest has not held long enough yet');
  assert.equal(state.state, 'charging');
  assert.equal(state.settledSinceMs, AT + (25 * MINUTE), 'timer restarted at the second rest');
});

test('a draw under the meter resolution ends the run silently', () => {
  // Cannot be told apart from unplugging, so nothing is claimed. Missing a
  // notification is the acceptable failure; announcing a finished charge to
  // someone who pulled the plug is not.
  const { state, settledAt } = run([
    [0, 25], [5, 25], [10, 0.0], [15, 0.0], [30, 0.0],
  ]);

  assert.equal(settledAt.length, 0);
  assert.equal(state.state, 'idle');
  assert.equal(state.peakW, 0, 'the run was discarded, not held open');
});

test('switching the outlet off ends the run without reporting', () => {
  const charged = run([[0, 25], [5, 25], [10, 0.3], [16, 0.3], [20, 0.3]]);
  assert.equal(charged.state.state, 'settled');

  const off = updateChargingState(charged.state, {
    status: 'off',
    powerW: 0,
    timestampMs: AT + (25 * MINUTE),
  });

  assert.equal(off.state, 'idle');
  assert.equal(off.justSettled, false);
});

test('a second charge on the same outlet reports again', () => {
  // notifiedAtMs is per run, and the run ends when the load goes. Plugging in
  // a second device must not be silenced by the first one's notification.
  const first = run([[0, 25], [5, 25], [10, 0.3], [16, 0.3], [20, 0.3]]);
  assert.equal(first.state.state, 'settled');

  const unplugged = updateChargingState(first.state, {
    status: 'on',
    powerW: 0,
    timestampMs: AT + (25 * MINUTE),
  });
  assert.equal(unplugged.state, 'idle');

  const second = run([
    [30, 25], [35, 25], [40, 0.3], [46, 0.3], [50, 0.3],
  ], { start: unplugged });

  assert.equal(second.settledAt.length, 1, 'the new charge is reported on its own merits');
});

test('the notification does not repeat while the charger stays plugged in', () => {
  const { settledAt } = run([
    [0, 25], [5, 25], [10, 0.3], [16, 0.3],
    [20, 0.3], [30, 0.3], [60, 0.3], [120, 0.3],
  ]);

  assert.equal(settledAt.length, 1);
});
