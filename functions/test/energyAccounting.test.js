const test = require('node:test');
const assert = require('node:assert/strict');

const {
  deriveOutletEnergy,
  resolveEnergyForDate,
  resolvePeakForDate,
} = require('../src/lib/energyAccounting');

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

/**
 * The day's peak used to be reconstructed by the nightly rollup from
 * `history_logs`, which only exist when something happened. A fan left running
 * at 57 W all evening peaked at 0 W unless someone happened to switch it off
 * while it was still drawing.
 */

test('the peak is the highest sample of the day, not the latest', () => {
  let state = deriveOutletEnergy({}, 100, MANILA_MORNING_MS, 14);
  state = deriveOutletEnergy(state, 100.02, MANILA_MORNING_MS + 1000, 56.4);
  state = deriveOutletEnergy(state, 100.04, MANILA_MORNING_MS + 2000, 13.9);

  assert.equal(state.peakPowerTodayW, 56.4);
});

test('an outlet switched off at 0 W keeps the peak it reached', () => {
  // The case the old event-log scan got wrong: the only logged event is the
  // switch-off, by which point the draw has already collapsed.
  let state = deriveOutletEnergy({}, 100, MANILA_MORNING_MS, 57.9);
  state = deriveOutletEnergy(state, 100.5, MANILA_MORNING_MS + HOUR_MS, 0);

  assert.equal(state.peakPowerTodayW, 57.9);
});

test('the peak timestamp stays on the first sample to reach it', () => {
  // A flat load must not keep pushing its own peak hour forward, or the daily
  // receipt reports whenever the appliance was switched off as its peak hour.
  let state = deriveOutletEnergy({}, 100, MANILA_MORNING_MS, 56);
  const firstPeakAtMs = state.peakPowerTodayAtMs;

  state = deriveOutletEnergy(state, 100.1, MANILA_MORNING_MS + (3 * HOUR_MS), 56);

  assert.equal(state.peakPowerTodayW, 56);
  assert.equal(state.peakPowerTodayAtMs, firstPeakAtMs, 'still the 08:00 sample');
});

test('the rollover starts a fresh peak and preserves the finished day', () => {
  let state = deriveOutletEnergy({}, 100, MANILA_MORNING_MS, 56.4);
  state = deriveOutletEnergy(state, 102, MANILA_MORNING_MS + 1000, 30);
  assert.equal(state.peakPowerTodayW, 56.4);

  const nextDayMs = MANILA_MORNING_MS + (17 * HOUR_MS);
  state = deriveOutletEnergy(state, 102.3, nextDayMs, 14);

  assert.equal(state.energyDateKey, '2026-03-11');
  assert.equal(state.peakPowerTodayW, 14, 'yesterday\'s high does not carry over');
  assert.equal(state.peakPowerPreviousDayW, 56.4, 'and is preserved for the rollup');
  assert.equal(state.peakPowerPreviousDayAtMs, MANILA_MORNING_MS);
});

test('a meter rebase leaves the peak alone', () => {
  // Peak is measured from instantaneous power, which the PZEM's energy register
  // being cleared or swapped says nothing about.
  let state = deriveOutletEnergy({}, 500, MANILA_MORNING_MS, 56);
  state = deriveOutletEnergy(state, 0.4, MANILA_MORNING_MS + 1000, 55);

  assert.equal(state.meterRebased, true);
  assert.equal(state.peakPowerTodayW, 56);
});

test('resolvePeakForDate finds the peak in either slot, with its hour', () => {
  const outlet = {
    energyDateKey: '2026-03-11',
    peakPowerTodayW: 14,
    peakPowerTodayAtMs: MANILA_MORNING_MS + (17 * HOUR_MS),
    energyPreviousDateKey: '2026-03-10',
    peakPowerPreviousDayW: 56.4,
    peakPowerPreviousDayAtMs: MANILA_MORNING_MS,
  };

  // The rollup runs after telemetry has already rolled the day over.
  assert.deepEqual(
    resolvePeakForDate(outlet, '2026-03-10'),
    { powerW: 56.4, atMs: MANILA_MORNING_MS }
  );
  assert.equal(resolvePeakForDate(outlet, '2026-03-11').powerW, 14);
  assert.deepEqual(resolvePeakForDate(outlet, '2026-03-09'), { powerW: 0, atMs: 0 });
  assert.deepEqual(resolvePeakForDate({}, '2026-03-10'), { powerW: 0, atMs: 0 });
});

test('a caller that passes no power still accounts energy correctly', () => {
  // deriveOutletEnergy predates peak tracking; omitting the argument must not
  // disturb what it already computed.
  let state = deriveOutletEnergy({}, 100, MANILA_MORNING_MS);
  state = deriveOutletEnergy(state, 102, MANILA_MORNING_MS + 1000);

  assert.equal(state.energyTodayKwh, 2);
  assert.equal(state.peakPowerTodayW, 0);
});
