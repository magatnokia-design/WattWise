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

/**
 * The range of the same length that ends the day before `startDate` - what a
 * range is compared against ("the 15 days before"). A single day compares with
 * the day before it.
 */
export const previousRange = (startDate, endDate) => {
  const length = countDays(startDate, endDate);
  return {
    startDate: addDaysToKey(startDate, -length),
    endDate: addDaysToKey(startDate, -1),
  };
};

const dayCost = (row) => Math.max(0, toNumber(row?.cost));
const dayKwh = (row) => Math.max(0, toNumber(row?.outlet1Energy)) + Math.max(0, toNumber(row?.outlet2Energy));

const isWeekend = (key) => {
  const weekday = new Date(`${key}T00:00:00Z`).getUTCDay();
  return weekday === 0 || weekday === 6;
};

/**
 * Plain-language facts about a range: how it compares with the period before,
 * the busiest and quietest day, which appliance used the most, and weekends
 * against weekdays. Each part is null when there is not enough to say it
 * honestly - a comparison against a period with no usage is not a "% change".
 *
 * `entries` are the same rows summarizeRange read (live today merged in);
 * `previous` is summarizeRange over previousRange().
 */
export const rangeInsights = (entries, summary, previous) => {
  const rows = (Array.isArray(entries) ? entries : [])
    .filter((row) => row?.date >= summary.startDate && row?.date <= summary.endDate && dayKwh(row) > 0);

  const change = previous && previous.cost > 0 && previous.days === summary.days
    ? {
      previousCost: previous.cost,
      percent: Math.round(((summary.cost - previous.cost) / previous.cost) * 100),
    }
    : null;

  // Busiest/quietest only mean something with a few days to choose from.
  const sorted = [...rows].sort((a, b) => dayCost(b) - dayCost(a));
  const pick = (row) => (row ? { date: row.date, cost: Number(dayCost(row).toFixed(2)), kwh: Number(dayKwh(row).toFixed(3)) } : null);
  const busiest = rows.length >= 3 ? pick(sorted[0]) : null;
  const quietest = rows.length >= 3 ? pick(sorted[sorted.length - 1]) : null;

  // Appliances by name, the per-day attribution the statement uses.
  const byName = new Map();
  for (const row of rows) {
    for (const item of row.applianceBreakdown || []) {
      const name = String(item?.applianceName || '').trim();
      if (!name) continue;
      const current = byName.get(name) || { kwh: 0, cost: 0 };
      current.kwh += Math.max(0, toNumber(item.energyKwh));
      current.cost += Math.max(0, toNumber(item.cost));
      byName.set(name, current);
    }
  }
  let topAppliance = null;
  if (summary.totalKwh > 0) {
    for (const [name, totals] of byName) {
      if (!topAppliance || totals.kwh > topAppliance.kwh) topAppliance = { name, ...totals };
    }
  }
  if (topAppliance) {
    topAppliance = {
      name: topAppliance.name,
      kwh: Number(topAppliance.kwh.toFixed(3)),
      cost: Number(topAppliance.cost.toFixed(2)),
      share: Math.round((topAppliance.kwh / summary.totalKwh) * 100),
    };
  }

  // Weekend vs weekday, per day, over days that actually happened.
  let weekendDays = 0;
  let weekdayDays = 0;
  let weekendCost = 0;
  let weekdayCost = 0;
  for (let key = summary.startDate; summary.days > 0 && key <= summary.endDate; key = addDaysToKey(key, 1)) {
    if (isWeekend(key)) weekendDays += 1;
    else weekdayDays += 1;
  }
  for (const row of rows) {
    if (isWeekend(row.date)) weekendCost += dayCost(row);
    else weekdayCost += dayCost(row);
  }
  const weekends = weekendDays >= 2 && weekdayDays >= 3
    ? {
      weekendDaily: Number((weekendCost / weekendDays).toFixed(2)),
      weekdayDaily: Number((weekdayCost / weekdayDays).toFixed(2)),
    }
    : null;

  // A single day: its own peak, from the stored row.
  const only = summary.days === 1 ? rows[0] : null;
  const day = only
    ? { peakPower: Number(toNumber(only.peakPower).toFixed(1)), peakHour: only.peakHour ?? null }
    : null;

  return { change, busiest, quietest, topAppliance, weekends, day };
};

const pesos = (value) => `₱${Number(value || 0).toFixed(2)}`;

/**
 * Up to three tips, each worked out from these figures rather than general
 * advice. Ordered by how much they are worth acting on.
 */
export const buildBudgetTips = (summary, insights, { monthlyBudget = 0, daysInMonth = 30 } = {}) => {
  const tips = [];
  if (!summary || summary.totalKwh <= 0) {
    return ['Nothing was used in these dates. Pick dates when your outlets were on to see tips.'];
  }

  const budget = toNumber(monthlyBudget);
  if (budget > 0) {
    const dailyAllowance = budget / daysInMonth;
    if (summary.dailyCost > dailyAllowance) {
      tips.push(`To stay within your ${pesos(budget)} budget, aim for about ${pesos(dailyAllowance)} a day — `
        + `${pesos(summary.dailyCost - dailyAllowance)} less than ${summary.days === 1 ? 'this day' : 'these dates averaged'}.`);
    } else {
      tips.push(`At ${pesos(summary.dailyCost)} a day you are inside your ${pesos(dailyAllowance)} daily share `
        + `of the ${pesos(budget)} budget. Keep it up.`);
    }
  } else {
    tips.push(`Set a monthly budget above — about ${pesos(summary.monthPaceCost)} matches how you use power now — `
      + 'and Dagitab will warn you at 50, 75, 90 and 100%.');
  }

  const top = insights?.topAppliance;
  if (top && top.share >= 40 && summary.days > 0) {
    const monthlySaving = (top.cost / summary.days) * 0.2 * daysInMonth;
    // The share itself is already under "What stands out"; the tip is the
    // part worth acting on.
    tips.push(`Using ${top.name} 20% less would save about ${pesos(monthlySaving)} a month.`);
  }

  const w = insights?.weekends;
  if (w && w.weekendDaily > w.weekdayDaily * 1.2) {
    tips.push(`Weekends cost more: ${pesos(w.weekendDaily)} a day against ${pesos(w.weekdayDaily)} on weekdays. `
      + 'Switching outlets off when you go out on weekends helps most.');
  }

  const change = insights?.change;
  if (tips.length < 3 && change && change.percent >= 10) {
    tips.push(`You spent ${change.percent}% more than in the ${summary.days === 1 ? 'day' : `${summary.days} days`} before. `
      + 'Check which appliance stayed on longer.');
  }

  if (tips.length < 3) {
    tips.push('Use Schedule to switch an outlet off automatically, so nothing runs all night by mistake.');
  }

  return tips.slice(0, 3);
};
