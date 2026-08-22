const test = require('node:test');
const assert = require('node:assert/strict');

const { deriveOutletEnergy } = require('../src/lib/energyAccounting');

const MANILA_MORNING_MS = Date.UTC(2026, 7, 22, 1, 0, 0); // 09:00 Manila

// Outlet 2's meter goes dark when its relay opens: it reports 0 V and the
// firmware publishes a zero energy counter with it. Reproduces 22 Aug 2026.
test('a meter that goes dark does not drag its baseline to zero', () => {
  let state = deriveOutletEnergy({}, 1.394, MANILA_MORNING_MS, 12.7, 236.5);
  assert.equal(state.energyMeterKwh, 1.394);

  // Relay opens. Meter unpowered, publishes zeros.
  state = deriveOutletEnergy(
    { ...state, voltage: 236.5 },
    0,
    MANILA_MORNING_MS + 3000,
    0,
    0
  );

  assert.equal(state.deltaKwh, 0, 'a dark meter consumes nothing');
  assert.equal(
    state.energyMeterKwh,
    1.394,
    'the baseline is held, not moved down to the zero'
  );
});

test('switching the outlet back on does not book the lifetime total', () => {
  // The exact shape of the bug: baseline already sitting at zero from an
  // earlier dark sample, then the meter comes back reporting its real total.
  const previous = {
    energyMeterKwh: 0,
    energyTodayKwh: 0,
    energyDateKey: '2026-08-22',
    totalEnergy: 0,
    voltage: 0,
  };

  const state = deriveOutletEnergy(previous, 1.394, MANILA_MORNING_MS, 12.7, 236.5);

  assert.equal(state.deltaKwh, 0, '1.394 kWh must not appear from nothing');
  assert.equal(state.energyTodayKwh, 0);
  assert.equal(state.meterRebased, true, 'it is a new baseline, not consumption');
  assert.equal(state.energyMeterKwh, 1.394, 'and the baseline is now the real reading');
});

test('a live outlet still accumulates normally', () => {
  // The guard must not cost a working outlet its energy.
  let state = deriveOutletEnergy({}, 100, MANILA_MORNING_MS, 58, 238.5);
  state = deriveOutletEnergy(
    { ...state, voltage: 238.5 },
    100.25,
    MANILA_MORNING_MS + 60000,
    58,
    238.2
  );

  assert.equal(state.deltaKwh, 0.25);
  assert.equal(state.energyTodayKwh, 0.25);
});

test('an outlet whose meter stays powered while off is unaffected', () => {
  // Outlet 1 reads mains upstream of its relay, so it reports voltage even
  // switched off. Nothing about this path may change for it.
  let state = deriveOutletEnergy({}, 50, MANILA_MORNING_MS, 58, 238.5);
  state = deriveOutletEnergy(
    { ...state, voltage: 238.5 },
    50,
    MANILA_MORNING_MS + 3000,
    0,
    239.6
  );

  assert.equal(state.deltaKwh, 0);
  assert.equal(state.meterRebased, false);
  assert.equal(state.energyMeterKwh, 50, 'baseline tracks the live meter');
});

test('a whole-house outage loses no energy when power returns', () => {
  let state = deriveOutletEnergy({}, 200, MANILA_MORNING_MS, 58, 238.5);
  state = deriveOutletEnergy({ ...state, voltage: 238.5 }, 0, MANILA_MORNING_MS + 3000, 0, 0);
  state = deriveOutletEnergy({ ...state, voltage: 0 }, 200, MANILA_MORNING_MS + 60000, 58, 237.9);

  assert.equal(state.energyTodayKwh, 0, 'nothing was drawn while the mains were down');
  assert.equal(state.energyMeterKwh, 200);
});

test('callers that report no voltage keep the old behaviour exactly', () => {
  // 14 existing tests and any older caller pass four arguments. Zero volts is a
  // measurement; a missing argument is not, and must not freeze the baseline.
  let state = deriveOutletEnergy({}, 100, MANILA_MORNING_MS);
  state = deriveOutletEnergy(state, 102, MANILA_MORNING_MS + 1000);

  assert.equal(state.deltaKwh, 2);
  assert.equal(state.energyTodayKwh, 2);
});
