const test = require('node:test');
const assert = require('node:assert');

const {
  evaluateRelayFault,
  STUCK_CONFIRM_MS,
  RELAY_FAULT_STATES,
  CLEAR_VOLTAGE_FLOOR_V,
} = require('../src/lib/relayFault');

const T0 = 1700000000000;

/** An outlet document carrying a previously-evaluated fault state. */
const previousWith = (relayFault) => ({ relayFault });

test('an outlet that is on is never a relay fault, however much it draws', () => {
  const result = evaluateRelayFault({
    previous: {},
    status: 'on',
    powerW: 480,
    nowMs: T0,
  });

  assert.equal(result.state, RELAY_FAULT_STATES.OK);
  assert.equal(result.justTripped, false);
});

test('an outlet switched off and drawing nothing is healthy', () => {
  const result = evaluateRelayFault({
    previous: {},
    status: 'off',
    powerW: 0,
    nowMs: T0,
  });

  assert.equal(result.state, RELAY_FAULT_STATES.OK);
});

test('current flowing through an off outlet is suspected, not yet confirmed', () => {
  const result = evaluateRelayFault({
    previous: {},
    status: 'off',
    powerW: 15.4,
    nowMs: T0,
  });

  assert.equal(result.state, RELAY_FAULT_STATES.SUSPECTED);
  assert.equal(result.firstSeenAtMs, T0);
  assert.equal(result.justTripped, false, 'a single sample must not trip the alarm');
});

test('it confirms once the draw has persisted past the confirm window', () => {
  const suspected = evaluateRelayFault({
    previous: {},
    status: 'off',
    powerW: 15.4,
    nowMs: T0,
  });

  const confirmed = evaluateRelayFault({
    previous: previousWith(suspected),
    status: 'off',
    powerW: 15.1,
    nowMs: T0 + STUCK_CONFIRM_MS,
  });

  assert.equal(confirmed.state, RELAY_FAULT_STATES.STUCK);
  assert.equal(confirmed.justTripped, true);
  assert.equal(confirmed.confirmedAtMs, T0 + STUCK_CONFIRM_MS);
});

test('it trips only once, not on every subsequent sample', () => {
  const confirmed = {
    state: RELAY_FAULT_STATES.STUCK,
    firstSeenAtMs: T0,
    observedW: 15.4,
    confirmedAtMs: T0 + STUCK_CONFIRM_MS,
  };

  const next = evaluateRelayFault({
    previous: previousWith(confirmed),
    status: 'off',
    powerW: 15.2,
    nowMs: T0 + STUCK_CONFIRM_MS + 1000,
  });

  assert.equal(next.state, RELAY_FAULT_STATES.STUCK);
  assert.equal(next.justTripped, false, 'one fault must not notify once a second');
  assert.equal(next.confirmedAtMs, T0 + STUCK_CONFIRM_MS, 'the original trip time is kept');
});

/*
 * The regression that matters most. A toggle is written to Firestore before the
 * ESP32 polls for it, and telemetry keeps arriving throughout that gap still
 * reporting the old relay position and the load that is genuinely still running.
 * Counting that as evidence would report a broken relay on every normal
 * switch-off, which is precisely how a real alarm gets trained out of a user.
 */
test('the pending window is not evidence of anything', () => {
  const result = evaluateRelayFault({
    previous: {},
    status: 'off',
    powerW: 52.6,
    pendingHonoured: true,
    nowMs: T0,
  });

  assert.equal(result.state, RELAY_FAULT_STATES.OK);
  assert.equal(result.firstSeenAtMs, 0, 'the clock must not start while a command is in flight');
});

test('a full ordinary switch-off never trips, even sampled every second', () => {
  // Command written at T0; device polls it 8 s later; load stops immediately.
  let previous = {};
  for (let elapsed = 0; elapsed <= 8000; elapsed += 1000) {
    const result = evaluateRelayFault({
      previous,
      status: 'off',
      powerW: 52.6,
      pendingHonoured: true,
      nowMs: T0 + elapsed,
    });
    assert.equal(result.state, RELAY_FAULT_STATES.OK, `tripped at ${elapsed} ms`);
    previous = previousWith(result);
  }

  const afterRelayOpened = evaluateRelayFault({
    previous,
    status: 'off',
    powerW: 0,
    nowMs: T0 + 9000,
  });

  assert.equal(afterRelayOpened.state, RELAY_FAULT_STATES.OK);
  assert.equal(afterRelayOpened.justTripped, false);
});

test('a confirmed fault clears when the relay finally opens', () => {
  const confirmed = {
    state: RELAY_FAULT_STATES.STUCK,
    firstSeenAtMs: T0,
    observedW: 15.4,
    confirmedAtMs: T0 + STUCK_CONFIRM_MS,
  };

  const cleared = evaluateRelayFault({
    previous: previousWith(confirmed),
    status: 'off',
    powerW: 0,
    // The load side is dead, which is what "the relay opened" actually means.
    voltageV: 0,
    nowMs: T0 + 120000,
  });

  assert.equal(cleared.state, RELAY_FAULT_STATES.OK);
  assert.equal(cleared.justCleared, true);
  assert.equal(cleared.firstSeenAtMs, 0);
});

/*
 * Unplugging the appliance is not the relay recovering.
 *
 * The PZEM sits on the load side of the contact, so 0 W at mains voltage and
 * 0 W at 0 V are different physical states and the meter can tell them apart.
 * Clearing on power alone conflated them: a real account was told "Outlet 2
 * responded to a switch-off and is now drawing no power" twice, by a relay that
 * had never released - the user had only pulled the laptop charger out.
 */

const CONFIRMED_STUCK = {
  state: RELAY_FAULT_STATES.STUCK,
  firstSeenAtMs: T0,
  observedW: 15.4,
  confirmedAtMs: T0 + STUCK_CONFIRM_MS,
};

test('unplugging the load does not clear a stuck relay', () => {
  const result = evaluateRelayFault({
    previous: previousWith(CONFIRMED_STUCK),
    status: 'off',
    powerW: 0,
    // Still energised: the contact is closed with nothing plugged into it.
    voltageV: 245.1,
    nowMs: T0 + 120000,
  });

  assert.equal(result.state, RELAY_FAULT_STATES.STUCK, 'the outlet is still live');
  assert.equal(result.justCleared, false, 'and the user must not be told it recovered');
});

test('plugging the load back in does not re-trip as though it were news', () => {
  // The alternation the account actually saw. It must read as one unbroken
  // fault, not as stuck / recovered / stuck.
  let previous = previousWith(CONFIRMED_STUCK);

  for (const [watts, volts] of [[0, 245.1], [7.4, 245.1], [0, 244.8], [9.1, 245.3]]) {
    const result = evaluateRelayFault({
      previous,
      status: 'off',
      powerW: watts,
      voltageV: volts,
      nowMs: T0 + 120000,
    });

    assert.equal(result.state, RELAY_FAULT_STATES.STUCK);
    assert.equal(result.justCleared, false);
    assert.equal(result.justTripped, false, 'no second alert for a fault already raised');
    previous = previousWith(result);
  }
});

test('a genuinely opened relay still clears, load or no load', () => {
  const result = evaluateRelayFault({
    previous: previousWith(CONFIRMED_STUCK),
    status: 'off',
    powerW: 0,
    voltageV: 0,
    nowMs: T0 + 120000,
  });

  assert.equal(result.state, RELAY_FAULT_STATES.OK);
  assert.equal(result.justCleared, true);
});

test('a build that reports no voltage falls back to clearing on power alone', () => {
  // Latching a fault that can never clear would be worse than the bug fixed.
  for (const voltageV of [undefined, null, NaN, 'n/a']) {
    const result = evaluateRelayFault({
      previous: previousWith(CONFIRMED_STUCK),
      status: 'off',
      powerW: 0,
      voltageV,
      nowMs: T0 + 120000,
    });

    assert.equal(result.state, RELAY_FAULT_STATES.OK);
    assert.equal(result.justCleared, true);
  }
});

test('a ghost reading on an open contact still counts as dead', () => {
  // An open contact can couple a few volts capacitively; that is not mains.
  const result = evaluateRelayFault({
    previous: previousWith(CONFIRMED_STUCK),
    status: 'off',
    powerW: 0,
    voltageV: CLEAR_VOLTAGE_FLOOR_V - 1,
    nowMs: T0 + 120000,
  });

  assert.equal(result.state, RELAY_FAULT_STATES.OK);
});

test('sensor noise on an open outlet does not trip it', () => {
  // The owner's PZEM reads ~0.02 A at 0.0 W on a switched-off outlet.
  let previous = {};
  for (let elapsed = 0; elapsed <= STUCK_CONFIRM_MS * 2; elapsed += 1000) {
    const result = evaluateRelayFault({
      previous,
      status: 'off',
      powerW: 0.4,
      nowMs: T0 + elapsed,
    });
    assert.equal(result.state, RELAY_FAULT_STATES.OK, `noise tripped at ${elapsed} ms`);
    previous = previousWith(result);
  }
});

test('a switch-on while the fault is latched clears it', () => {
  const confirmed = {
    state: RELAY_FAULT_STATES.STUCK,
    firstSeenAtMs: T0,
    observedW: 15.4,
    confirmedAtMs: T0 + STUCK_CONFIRM_MS,
  };

  const result = evaluateRelayFault({
    previous: previousWith(confirmed),
    status: 'on',
    powerW: 15.4,
    nowMs: T0 + 60000,
  });

  assert.equal(result.state, RELAY_FAULT_STATES.OK);
  assert.equal(result.justCleared, true);
});

test('malformed stored state does not throw or latch', () => {
  const result = evaluateRelayFault({
    previous: { relayFault: { state: 'nonsense', firstSeenAtMs: 'abc' } },
    status: 'off',
    powerW: 15.4,
    nowMs: T0,
  });

  assert.equal(result.state, RELAY_FAULT_STATES.SUSPECTED);
  assert.equal(result.firstSeenAtMs, T0);
});
