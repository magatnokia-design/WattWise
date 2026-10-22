/**
 * "How much did I use between these two dates?" - the Budget screen's range
 * check, on both clients.
 *
 * COPY RULE: byte-identical with C:\App\WattWise-Web\src\utils\rangeUsage.js.
 * Both clients answer the same question from the same rows; two arithmetics
 * would give two answers.
 *
 * Input is history_daily rows for the range, with today's live entry already
 * merged in by withLiveToday (liveUsage.js), so a range ending today counts
 * what has been used so far today.
 *
 * The cost is the sum of each day's `cost`, and that is deliberately the
 * marginal price of the energy: processDailyRollup and buildLiveTodayEntry
 * both leave out the once-a-month metering charge, because a day is not a
 * billing period. So this answers "what did the electricity I used in these
 * days cost", not "what will my bill be" - and the screen says so. It is never
 * the monthly budget figure, which does include that charge.
 */

import { getManilaDateKey, getDaysInManilaMonth } from './liveUsage';

const DAY_MS = 24 * 60 * 60 * 1000;

// Longest range the screen will query: a year of daily rows is one read, and
// anything longer is a question for Analytics.
export const MAX_RANGE_DAYS = 366;

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

// Date keys are calendar days, so they are compared and counted as UTC
// midnights - no device time zone can shift them.
const keyToUtcMs = (key) => Date.parse(`${key}T00:00:00Z`);

const utcMsToKey = (ms) => new Date(ms).toISOString().slice(0, 10);

export const addDaysToKey = (key, days) => utcMsToKey(keyToUtcMs(key) + days * DAY_MS);

/** Inclusive count of calendar days from `startKey` to `endKey`. */
export const countDays = (startKey, endKey) =>
  Math.round((keyToUtcMs(endKey) - keyToUtcMs(startKey)) / DAY_MS) + 1;

/**
 * The quick choices above the calendar. Each returns { startDate, endDate }
 * as Manila date keys ending today.
 */
export const RANGE_PRESETS = [
  {
    id: 'month',
    label: 'This month',
    resolve: (today) => ({ startDate: `${today.slice(0, 7)}-01`, endDate: today }),
  },
  {
    id: 'week',
    label: 'Last 7 days',
    resolve: (today) => ({ startDate: addDaysToKey(today, -6), endDate: today }),
  },
  {
    id: 'thirty',
    label: 'Last 30 days',
    resolve: (today) => ({ startDate: addDaysToKey(today, -29), endDate: today }),
  },
];

/**
 * Checks a chosen range. Returns null when it is usable, or a sentence saying
 * what to change.
 */
export const validateRange = (startDate, endDate, today = getManilaDateKey()) => {
  if (!DATE_KEY.test(String(startDate)) || !DATE_KEY.test(String(endDate))) {
    return 'Choose a start date and an end date.';
  }
  if (startDate > endDate) return 'The start date is after the end date.';
  if (startDate > today) return 'The start date is in the future.';
  if (countDays(startDate, endDate) > MAX_RANGE_DAYS) {
    return 'Choose a range of one year or less.';
  }
  return null;
};

/**
 * Totals for a range.
 *
 * `days` counts calendar days up to today only: a range that runs past today
 * has not happened yet, and averaging over days that have not occurred would
 * quietly shrink the average. A day with no row counts as a day with nothing
 * used - the rollup only writes a row when something was measured.
 *
 * `monthPaceCost` scales the daily average to a full current month, which is
 * the number worth putting beside a monthly budget. It inherits the marginal
 * caveat above.
 */
export const summarizeRange = (entries, { startDate, endDate, today = getManilaDateKey() } = {}) => {
  const lastCountedDay = endDate < today ? endDate : today;
  const days = startDate <= lastCountedDay ? countDays(startDate, lastCountedDay) : 0;

  const rows = (Array.isArray(entries) ? entries : [])
    .filter((row) => row?.date >= startDate && row?.date <= lastCountedDay);

  let outlet1Kwh = 0;
  let outlet2Kwh = 0;
  let cost = 0;
  let includesToday = false;

  for (const row of rows) {
    outlet1Kwh += Math.max(0, toNumber(row.outlet1Energy));
    outlet2Kwh += Math.max(0, toNumber(row.outlet2Energy));
    cost += Math.max(0, toNumber(row.cost));
    if (row.isLive) includesToday = true;
  }

  const totalKwh = outlet1Kwh + outlet2Kwh;
  const dailyCost = days > 0 ? cost / days : 0;

  return {
    startDate,
    endDate: lastCountedDay,
    days,
    daysWithUsage: rows.filter((row) => toNumber(row.totalEnergy) > 0
      || toNumber(row.outlet1Energy) + toNumber(row.outlet2Energy) > 0).length,
    outlet1Kwh: Number(outlet1Kwh.toFixed(3)),
    outlet2Kwh: Number(outlet2Kwh.toFixed(3)),
    totalKwh: Number(totalKwh.toFixed(3)),
    cost: Number(cost.toFixed(2)),
    dailyKwh: days > 0 ? Number((totalKwh / days).toFixed(3)) : 0,
    dailyCost: Number(dailyCost.toFixed(2)),
    monthPaceCost: Number((dailyCost * getDaysInManilaMonth(today)).toFixed(2)),
    includesToday,
  };
};
