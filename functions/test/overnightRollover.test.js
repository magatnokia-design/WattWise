const test = require('node:test');
const assert = require('node:assert/strict');

const { deriveOutletEnergy } = require('../src/lib/energyAccounting');

// 22 Aug 2026, Manila. Midnight Manila is 16:00 UTC the previous day.
const EVENING_22 = Date.UTC(2026, 7, 22, 14, 0, 0); // 22:00 Manila, 22 Aug
const AFTER_MIDNIGHT = Date.UTC(2026, 7, 22, 17, 0, 0); // 01:00 Manila, 23 Aug
const MORNING_23 = Date.UTC(2026, 7, 23, 1, 0, 0); // 09:00 Manila, 23 Aug

// The exact sequence the hub will walk tonight: outlet 2 left off overnight,
// its meter dark, the Manila day rolling over underneath it, then switched on
// in the morning. This is the run that must not invent kWh for 23 August.
test('an outlet left off overnight starts tomorrow at zero', () => {
  // Evening of the 22nd, outlet 2 on and metering.
  let state = deriveOutletEnergy({}, 0.702, EVENING_22, 14.0, 240.7);
  assert.equal(state.energyTodayKwh, 0);
  assert.equal(state.energyDateKey, '2026-08-22');

  // Switched off. Meter goes dark: 0 V, and the firmware publishes 0 kWh.
  state = deriveOutletEnergy(
    { ...state, voltage: 240.7 }, 0, EVENING_22 + 60000, 0, 0
  );
  assert.equal(state.energyMeterKwh, 0.702, 'the dark sample must not move the baseline');

  // Still dark when the Manila day rolls over.
  state = deriveOutletEnergy(
    { ...state, voltage: 0 }, 0, AFTER_MIDNIGHT, 0, 0
  );
  assert.equal(state.energyDateKey, '2026-08-23', 'the day rolled over');
  assert.equal(state.energyTodayKwh, 0, '23 Aug starts empty');
  assert.equal(state.energyPreviousDateKey, '2026-08-22', '22 Aug was closed out');

  // Morning of the 23rd: switched on, meter wakes reporting its real total.
  state = deriveOutletEnergy(
    { ...state, voltage: 0 }, 0.702, MORNING_23, 14.0, 239.8
  );

  assert.equal(state.deltaKwh, 0, 'no phantom kWh on the first live sample');
  assert.equal(state.energyTodayKwh, 0, '23 Aug still empty - nothing was drawn yet');
  assert.equal(state.energyMeterKwh, 0.702, 'baseline adopted, not differenced');

  // And it accumulates correctly from there.
  state = deriveOutletEnergy(
    { ...state, voltage: 239.8 }, 0.716, MORNING_23 + (3600 * 1000), 14.0, 239.9
  );
  assert.equal(state.energyTodayKwh, 0.014, 'one hour of a 14 W lamp');
});

test('the corrected 0.307 survives the rollover as 22 August', () => {
  // What the hand-corrected document does tonight: the figure carries into the
  // previous-day slot rather than being lost or re-counted.
  const corrected = {
    energyMeterKwh: 0.702,
    energyTodayKwh: 0.307,
    energyDateKey: '2026-08-22',
    voltage: 240.7,
    totalEnergy: 0.307,
  };

  const state = deriveOutletEnergy(corrected, 0.702, AFTER_MIDNIGHT, 14.0, 240.5);

  assert.equal(state.energyPreviousDayKwh, 0.307, '22 Aug keeps the corrected figure');
  assert.equal(state.energyPreviousDateKey, '2026-08-22');
  assert.equal(state.energyTodayKwh, 0, 'and 23 Aug starts clean');
});

test('a hub reboot overnight cannot manufacture energy either', () => {
  // A reboot clears the firmware's lastGoodEnergy, so it publishes 0 kWh until
  // the first successful read. That zero must not become a baseline.
  let state = deriveOutletEnergy({}, 0.702, EVENING_22, 14.0, 240.7);
  state = deriveOutletEnergy({ ...state, voltage: 240.7 }, 0, EVENING_22 + 5000, 0, 0);
  state = deriveOutletEnergy({ ...state, voltage: 0 }, 0.702, EVENING_22 + 10000, 14.0, 240.6);

  assert.equal(state.deltaKwh, 0);
  assert.equal(state.energyTodayKwh, 0);
});
