import test from 'node:test';
import assert from 'node:assert/strict';

import {
  summarizeRange,
  validateRange,
  countDays,
  addDaysToKey,
  RANGE_PRESETS,
  MAX_RANGE_DAYS,
} from '../src/utils/rangeUsage.js';

/*
 * `rangeUsage.js` is a copy-rule file - byte-identical to the website's - and
 * these tests exist in both repos for the same reason: the Budget screen's
 * "how much did I use from Oct 8 to today" must give one answer on both.
 */

const row = (date, outlet1Energy, outlet2Energy, cost, extra = {}) => ({
  date,
  outlet1Energy,
  outlet2Energy,
  totalEnergy: outlet1Energy + outlet2Energy,
  cost,
  ...extra,
});

test('sums energy and cost over the rows inside the range', () => {
  const summary = summarizeRange(
    [
      row('2026-10-07', 1, 1, 9), // before the range
      row('2026-10-08', 0.5, 0.25, 4.1),
      row('2026-10-09', 0.25, 0.5, 3.9),
    ],
    { startDate: '2026-10-08', endDate: '2026-10-09', today: '2026-10-22' }
  );

  assert.equal(summary.outlet1Kwh, 0.75);
  assert.equal(summary.outlet2Kwh, 0.75);
  assert.equal(summary.totalKwh, 1.5);
  assert.equal(summary.cost, 8);
  assert.equal(summary.days, 2);
});

test('days with no row count as days with nothing used, not as missing', () => {
  // The rollup writes no row for a day with no usage, so a 10-day range with
  // two rows really is ten days, and the average is over ten.
  const summary = summarizeRange(
    [row('2026-10-08', 1, 0, 10), row('2026-10-17', 1, 0, 10)],
    { startDate: '2026-10-08', endDate: '2026-10-17', today: '2026-10-22' }
  );

  assert.equal(summary.days, 10);
  assert.equal(summary.daysWithUsage, 2);
  assert.equal(summary.dailyCost, 2);
});

test('a range that runs past today is counted only up to today', () => {
  // Averaging over days that have not happened would shrink the average.
  const summary = summarizeRange(
    [row('2026-10-20', 1, 0, 6), row('2026-10-22', 1, 0, 6, { isLive: true })],
    { startDate: '2026-10-20', endDate: '2026-10-31', today: '2026-10-22' }
  );

  assert.equal(summary.days, 3);
  assert.equal(summary.endDate, '2026-10-22');
  assert.equal(summary.dailyCost, 4);
  assert.equal(summary.includesToday, true);
});

test('the month pace scales the daily average to the current month', () => {
  const summary = summarizeRange(
    [row('2026-10-01', 1, 0, 3)],
    { startDate: '2026-10-01', endDate: '2026-10-01', today: '2026-10-22' }
  );

  // October has 31 days.
  assert.equal(summary.monthPaceCost, 93);
});

test('an empty range reports zeros rather than NaN', () => {
  const summary = summarizeRange([], {
    startDate: '2026-10-08', endDate: '2026-10-22', today: '2026-10-22',
  });

  assert.equal(summary.cost, 0);
  assert.equal(summary.totalKwh, 0);
  assert.equal(summary.dailyCost, 0);
  assert.equal(summary.days, 15);
});

test('ignores negative and non-numeric readings', () => {
  const summary = summarizeRange(
    [row('2026-10-08', -1, 'x', 'bad')],
    { startDate: '2026-10-08', endDate: '2026-10-08', today: '2026-10-22' }
  );

  assert.equal(summary.totalKwh, 0);
  assert.equal(summary.cost, 0);
});

test('validateRange names what to fix', () => {
  const today = '2026-10-22';
  assert.equal(validateRange('2026-10-08', '2026-10-22', today), null);
  assert.match(validateRange('2026-10-22', '2026-10-08', today), /after the end/);
  assert.match(validateRange('2026-11-01', '2026-11-02', today), /future/);
  assert.match(validateRange('', '2026-10-22', today), /Choose/);
  assert.match(validateRange('2024-01-01', '2026-10-22', today), /one year/);
});

test('date-key arithmetic is calendar days, unaffected by month ends and DST', () => {
  assert.equal(countDays('2026-10-08', '2026-10-22'), 15);
  assert.equal(countDays('2026-02-27', '2026-03-01'), 3);
  assert.equal(addDaysToKey('2026-03-01', -1), '2026-02-28');
  assert.equal(addDaysToKey('2026-12-31', 1), '2027-01-01');
  assert.ok(countDays('2026-01-01', '2026-12-31') <= MAX_RANGE_DAYS);
});

test('presets end today and start where their names say', () => {
  const today = '2026-10-22';
  const resolved = Object.fromEntries(RANGE_PRESETS.map((p) => [p.id, p.resolve(today)]));

  assert.deepEqual(resolved.month, { startDate: '2026-10-01', endDate: today });
  assert.deepEqual(resolved.week, { startDate: '2026-10-16', endDate: today });
  assert.equal(countDays(resolved.thirty.startDate, today), 30);
});
