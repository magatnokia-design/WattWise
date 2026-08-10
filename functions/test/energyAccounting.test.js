const test = require('node:test');
const assert = require('node:assert/strict');

const { deriveOutletEnergy, resolveEnergyForDate } = require('../src/lib/energyAccounting');

// 2026-03-10 08:00 Manila == 2026-03-10T00:00:00Z
const MANILA_MORNING_MS = Date.UTC(2026, 2, 10, 0, 0, 0);
const HOUR_MS = 60 * 60 * 1000;

test('first reading establishes a baseline without recording usage', () => {
  const result = deriveOutletEnergy({}, 128.5, MANILA_MORNING_MS);

  // The meter already reads 128.5 kWh of lifetime usage; none of it is today's.
  assert.equal(result.energyTodayKwh, 0);
  assert.equal(result.energyMeterKwh, 128.5);
  assert.equal(result.energyDateKey, '2026-03-10');
});

test('subsequent readings accumulate only the delta', () => {
  let state = deriveOutletEnergy({}, 128.5, MANILA_MORNING_MS);
  state = deriveOutletEnergy(state, 128.7, MANILA_MORNING_MS + 1000);
  state = deriveOutletEnergy(state, 129.0, MANILA_MORNING_MS + 2000);

  assert.equal(state.energyTodayKwh, 0.5);
  assert.equal(state.totalEnergy, 0.5);
  assert.equal(state.energyMeterKwh, 129);
});

test('the Manila day rollover closes out the finished day', () => {
  let state = deriveOutletEnergy({}, 100, MANILA_MORNING_MS);
  state = deriveOutletEnergy(state, 102, MANILA_MORNING_MS + 1000);
  assert.equal(state.energyTodayKwh, 2);

  // 16:00 UTC is midnight Manila - the next calendar day.
  const nextDayMs = MANILA_MORNING_MS + (17 * HOUR_MS);
  state = deriveOutletEnergy(state, 102.3, nextDayMs);

  assert.equal(state.energyDateKey, '2026-03-11');
  assert.equal(state.energyTodayKwh, 0.3, 'new day starts from the rollover');
  assert.equal(state.energyPreviousDateKey, '2026-03-10');
  assert.equal(state.energyPreviousDayKwh, 2, 'finished day is preserved for the rollup');
});

test('a meter reset re-baselines instead of recording negative usage', () => {
  let state = deriveOutletEnergy({}, 500, MANILA_MORNING_MS);
  state = deriveOutletEnergy(state, 502, MANILA_MORNING_MS + 1000);
  assert.equal(state.energyTodayKwh, 2);

  // PZEM cleared or swapped: the counter restarts near zero.
  state = deriveOutletEnergy(state, 0.4, MANILA_MORNING_MS + 2000);

  assert.equal(state.meterRebased, true);
  assert.equal(state.energyTodayKwh, 2, 'the day keeps what it already measured');
  assert.equal(state.energyMeterKwh, 0.4, 'and re-baselines to the new counter');

  state = deriveOutletEnergy(state, 0.9, MANILA_MORNING_MS + 3000);
  assert.equal(state.energyTodayKwh, 2.5);
});

test('an implausible jump is rejected rather than billed', () => {
  let state = deriveOutletEnergy({}, 10, MANILA_MORNING_MS);
  state = deriveOutletEnergy(state, 900, MANILA_MORNING_MS + 1000);

  assert.equal(state.meterRebased, true);
  assert.equal(state.energyTodayKwh, 0);
});

test('resolveEnergyForDate finds the day in either slot', () => {
  const outlet = {
    energyDateKey: '2026-03-11',
    energyTodayKwh: 0.8,
    energyPreviousDateKey: '2026-03-10',
    energyPreviousDayKwh: 2.4,
  };

  // The rollup runs after telemetry has already rolled the day over.
  assert.equal(resolveEnergyForDate(outlet, '2026-03-10'), 2.4);
  assert.equal(resolveEnergyForDate(outlet, '2026-03-11'), 0.8);
  assert.equal(resolveEnergyForDate(outlet, '2026-03-09'), 0);

  // The rollup runs before any post-midnight sample arrives, so the day being
  // rolled up is still the live accumulator.
  const notYetRolled = { energyDateKey: '2026-03-10', energyTodayKwh: 2.4 };
  assert.equal(resolveEnergyForDate(notYetRolled, '2026-03-10'), 2.4);
});

test('a device that never reports leaves the day at zero', () => {
  assert.equal(resolveEnergyForDate({}, '2026-03-10'), 0);
  assert.equal(resolveEnergyForDate({ energyDateKey: '2026-03-10' }, '2026-03-10'), 0);
});
