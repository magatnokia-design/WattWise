import test from 'node:test';
import assert from 'node:assert/strict';

import {
  costPerHour,
  projectApplianceCost,
  describeApplianceDraw,
  formatHours,
} from '../src/utils/applianceCost.js';
import {
  aggregateApplianceUsage,
  averageHoursPerRunDay,
  foldApplianceRows,
  priceByEnergyShare,
} from '../src/utils/applianceBreakdown.js';
import { marginalRatePerKwh, DEFAULT_SUPPLY_RATES } from '../src/utils/billing.js';
import { buildLiveTodayEntry, getManilaDateKey } from '../src/utils/liveUsage.js';

const near = (actual, expected, tolerance = 0.005) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);

// --- The rate ---

test('the calculator rate is the full per-kWh price, not the generation line alone', () => {
  const rate = marginalRatePerKwh();

  // Generation is about half of what a kWh costs; pricing with it alone would
  // understate every appliance by ~40%.
  assert.ok(rate > DEFAULT_SUPPLY_RATES.generation * 1.5);
  // And no fixed charge is smeared in: a lamp is centavos an hour, not pesos.
  assert.ok(costPerHour(15.9, rate) < 0.5);
});

// --- Projection ---

test('a 56 W fan for 8 hours on 30 days', () => {
  const result = projectApplianceCost({ watts: 56, hoursPerDay: 8, daysPerMonth: 30, ratePerKwh: 11 });

  near(result.perHour, 0.616);
  near(result.perDay, 4.928);
  near(result.perMonth, 147.84);
  near(result.kWhPerMonth, 13.44);
});

test('hours and days are bounded, so a slip cannot project an impossible month', () => {
  const result = projectApplianceCost({ watts: 100, hoursPerDay: 100, daysPerMonth: 365, ratePerKwh: 10 });

  assert.equal(result.hours, 24);
  assert.equal(result.days, 31);
});

test('negative and junk inputs cost nothing rather than a negative amount', () => {
  const result = projectApplianceCost({ watts: -60, hoursPerDay: 'eight', daysPerMonth: null, ratePerKwh: 11 });

  assert.equal(result.perMonth, 0);
  assert.equal(costPerHour('abc', 11), 0);
});

// --- A saved appliance's draw ---

test('patterns within 15% read as one figure', () => {
  const draw = describeApplianceDraw({ meanPower: 56, minPower: 54, maxPower: 58 });

  assert.equal(draw.varies, false);
  assert.equal(draw.watts, 56);
});

test('a charger tapering from 30 W to 8 W reads as a range, not its 21 W mean', () => {
  const draw = describeApplianceDraw({ meanPower: 21, minPower: 8, maxPower: 30 });

  assert.equal(draw.varies, true);
  assert.equal(draw.minWatts, 8);
  assert.equal(draw.maxWatts, 30);
});

test('a single-pattern appliance from an older build has no range fields and still works', () => {
  const draw = describeApplianceDraw({ meanPower: 60 });

  assert.equal(draw.varies, false);
  assert.equal(draw.minWatts, 60);
  assert.equal(draw.maxWatts, 60);
});

// --- Measured hours ---

const day = (date, items) => ({ date, applianceBreakdown: items });

test('hours a day average over the days it ran, skipping days run time was not measured', () => {
  const rows = aggregateApplianceUsage([
    // Rolled up before run time existed: energy, no hours.
    day('2026-10-26', [{ applianceName: 'Electric Fan', energyKwh: 0.4, cost: 4 }]),
    day('2026-10-27', [{ applianceName: 'Electric Fan', energyKwh: 0.4, cost: 4, onSeconds: null }]),
    day('2026-10-28', [{ applianceName: 'Electric Fan', energyKwh: 0.45, cost: 5, onSeconds: 8 * 3600 }]),
    day('2026-10-29', [{ applianceName: 'Electric Fan', energyKwh: 0.34, cost: 4, onSeconds: 6 * 3600 }]),
  ]);

  assert.equal(rows[0].runDays, 2);
  assert.equal(averageHoursPerRunDay(rows[0]), 7);
});

test('an appliance with no measured day has no average, rather than zero hours', () => {
  const rows = aggregateApplianceUsage([
    day('2026-10-26', [{ applianceName: 'Lamp', energyKwh: 0.08, cost: 1 }]),
  ]);

  assert.equal(averageHoursPerRunDay(rows[0]), null);
});

test('a measured zero is a measurement - it counts as a day', () => {
  const rows = aggregateApplianceUsage([
    day('2026-10-28', [{ applianceName: 'Lamp', energyKwh: 0.01, cost: 0.1, onSeconds: 0 }]),
    day('2026-10-29', [{ applianceName: 'Lamp', energyKwh: 0.08, cost: 1, onSeconds: 6 * 3600 }]),
  ]);

  assert.equal(rows[0].runDays, 2);
  assert.equal(averageHoursPerRunDay(rows[0]), 3);
});

// --- Splitting a period's cost ---

test('appliance costs are the period total split by energy share, and add up to it', () => {
  const rows = aggregateApplianceUsage([
    day('2026-10-28', [
      { applianceName: 'Electric Fan', energyKwh: 3, cost: 0 },
      { applianceName: 'Lamp', energyKwh: 1, cost: 0 },
    ]),
  ]);
  const priced = priceByEnergyShare(rows, 50, 4);

  assert.equal(priced[0].cost, 37.5);
  assert.equal(priced[1].cost, 12.5);
  near(priced[0].share, 0.75, 1e-9);
  near(priced.reduce((sum, row) => sum + row.cost, 0), 50, 0.011);
});

test('a folded Other row is priced from its own energy, like any row', () => {
  const rows = aggregateApplianceUsage([
    day('2026-10-28', ['A', 'B', 'C', 'D', 'E'].map((name, index) => ({
      applianceName: name, energyKwh: 5 - index, cost: 0,
    }))),
  ]);
  const priced = priceByEnergyShare(foldApplianceRows(rows, 3), 30, 15);

  assert.equal(priced.length, 4);
  assert.equal(priced[3].applianceName, 'Other (2 appliances)');
  assert.equal(priced[3].cost, 6);
  near(priced.reduce((sum, row) => sum + row.cost, 0), 30, 0.011);
});

test('an empty period prices nothing rather than dividing by zero', () => {
  assert.deepEqual(priceByEnergyShare([], 0, 0), []);
  assert.equal(priceByEnergyShare([{ applianceName: 'Lamp', energyKwh: 0 }], 10, 0)[0].cost, 0);
});

// --- Today's live run time ---

const liveOutlet = (number, fields) => ({
  outletId: `outlet${number}`,
  outletNumber: number,
  energyDateKey: getManilaDateKey(),
  ...fields,
});

test("today's live entry carries each appliance's run time so far", () => {
  const entry = buildLiveTodayEntry([
    liveOutlet(1, { applianceName: 'Electric Fan', energyTodayKwh: 0.2, onSecondsToday: 3 * 3600 }),
    liveOutlet(2, { applianceName: 'Lamp', energyTodayKwh: 0.05, onSecondsToday: 2 * 3600 }),
  ]);

  const fan = entry.applianceBreakdown.find((item) => item.applianceName === 'Electric Fan');
  assert.equal(fan.onSeconds, 3 * 3600);
  assert.equal(entry.outlet2OnSeconds, 2 * 3600);
});

test('an outlet from before run time was tracked has none today, not zero', () => {
  const entry = buildLiveTodayEntry([
    liveOutlet(1, { applianceName: 'Electric Fan', energyTodayKwh: 0.2 }),
  ]);

  assert.equal(entry.applianceBreakdown[0].onSeconds, null);
  assert.equal(entry.outlet1OnSeconds, null);
});

test('yesterday\'s run time is never reported as today\'s', () => {
  const entry = buildLiveTodayEntry([
    liveOutlet(1, {
      applianceName: 'Electric Fan',
      energyTodayKwh: 0.2,
      energyDateKey: '2020-01-01',
      onSecondsToday: 9 * 3600,
      energyPreviousDateKey: getManilaDateKey(),
      energyPreviousDayKwh: 0.2,
      onSecondsPreviousDay: 4 * 3600,
    }),
  ]);

  assert.equal(entry.applianceBreakdown[0].onSeconds, 4 * 3600);
});

test('hours format as minutes under an hour', () => {
  assert.equal(formatHours(0.75), '45 min');
  assert.equal(formatHours(6.24), '6.2 h');
});
