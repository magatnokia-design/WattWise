import { calculatePelcoIIIBill } from '../../../utils/billing';

// How many months back the pickers offer. A year covers a full seasonal cycle,
// which is the comparison that actually explains a bill jump.
export const MONTH_OPTION_COUNT = 12;

export const emptyMonthTotals = {
  kWh: 0,
  cost: 0,
  outlet1: 0,
  outlet2: 0,
  outlet1Name: 'Outlet 1',
  outlet2Name: 'Outlet 2',
  daysRecorded: 0,
};

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const pad = (value) => String(value).padStart(2, '0');

export const previousMonthKey = (monthKey) => {
  const [year, month] = String(monthKey).split('-').map(Number);
  if (!year || !month) return monthKey;
  return month === 1 ? `${year - 1}-12` : `${year}-${pad(month - 1)}`;
};

export const formatMonthLabel = (monthKey) => {
  const [year, month] = String(monthKey).split('-').map(Number);
  if (!year || !month) return monthKey;

  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
};

export const formatMonthShort = (monthKey) => {
  const [year, month] = String(monthKey).split('-').map(Number);
  if (!year || !month) return monthKey;

  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
};

/** Most recent month first, so the default selection is the current month. */
export const buildMonthOptions = (count = MONTH_OPTION_COUNT, from = new Date()) => {
  const options = [];
  let year = from.getFullYear();
  let month = from.getMonth() + 1;

  for (let index = 0; index < count; index += 1) {
    const value = `${year}-${pad(month)}`;
    options.push({ value, label: formatMonthLabel(value), short: formatMonthShort(value) });

    month -= 1;
    if (month === 0) {
      month = 12;
      year -= 1;
    }
  }

  return options;
};

/**
 * Rolls a month of `history_daily` documents into one total.
 *
 * The month's cost is priced from its total energy in a single call, never by
 * adding up the stored daily costs. Those are deliberately marginal - a day is
 * not a billing period, so `processDailyRollup` leaves the once-a-month P5.00
 * metering charge out of them - and summing them would drop that charge from
 * the month entirely. Summing them back when they *did* include it was the
 * original bug: the fee landed once per day, and three days of near-zero usage
 * came to P19.58 instead of P8.69.
 *
 * Both mistakes come from treating a sum of days as a bill. Nothing should.
 *
 * Appliance names come from the most recent day that carries them, so an outlet
 * renamed mid-month shows its current name rather than a stale one.
 *
 * @param {Array} entries `history_daily` documents for the month.
 * @param {object} [rates] `supplyRates` and `profileId` from user preferences.
 *   Omitted, the seeded profile is used - which prices a month at the default
 *   tariff rather than the user's own.
 */
export const summarizeDailyEntries = (entries, { supplyRates = null, profileId = null } = {}) => {
  const rows = Array.isArray(entries) ? entries : [];
  if (rows.length === 0) return emptyMonthTotals;

  const totals = rows.reduce((accumulator, entry) => ({
    kWh: accumulator.kWh + toNumber(entry.totalEnergy),
    outlet1: accumulator.outlet1 + toNumber(entry.outlet1Energy),
    outlet2: accumulator.outlet2 + toNumber(entry.outlet2Energy),
  }), { kWh: 0, outlet1: 0, outlet2: 0 });

  const latest = rows[rows.length - 1] || {};

  return {
    ...totals,
    cost: calculatePelcoIIIBill(totals.kWh, { supplyRates, profileId }).totals.total,
    outlet1Name: String(latest.outlet1Name || '').trim() || 'Outlet 1',
    outlet2Name: String(latest.outlet2Name || '').trim() || 'Outlet 2',
    daysRecorded: rows.length,
  };
};

/**
 * Signed change from `previous` to `current`.
 *
 * `direction` is what the UI colours on, and it is deliberately not the same as
 * the sign: using less energy is 'down' and good, so the caller never has to
 * work out which way is favourable.
 */
export const buildDelta = (current, previous) => {
  const currentValue = toNumber(current);
  const previousValue = toNumber(previous);
  const difference = currentValue - previousValue;

  // No baseline means no percentage - showing "+100%" against zero is noise.
  const percent = previousValue > 0 ? (difference / previousValue) * 100 : null;

  let direction = 'flat';
  if (Math.abs(difference) > 0.005) direction = difference > 0 ? 'up' : 'down';

  return {
    current: currentValue,
    previous: previousValue,
    difference,
    absolute: Math.abs(difference),
    percent,
    absolutePercent: percent === null ? null : Math.abs(percent),
    direction,
    hasBaseline: previousValue > 0,
  };
};

export const compareMonths = (totalsA, totalsB) => {
  const a = totalsA || emptyMonthTotals;
  const b = totalsB || emptyMonthTotals;

  return {
    energy: buildDelta(a.kWh, b.kWh),
    cost: buildDelta(a.cost, b.cost),
    outlet1: buildDelta(a.outlet1, b.outlet1),
    outlet2: buildDelta(a.outlet2, b.outlet2),
    hasData: a.daysRecorded > 0 || b.daysRecorded > 0,
    bothHaveData: a.daysRecorded > 0 && b.daysRecorded > 0,
  };
};

/**
 * One plain sentence for the top of the screen. This is the whole point of the
 * comparison, so it says the outcome outright rather than leaving the user to
 * subtract two numbers.
 */
export const buildVerdict = (comparison, monthALabel, monthBLabel) => {
  if (!comparison.bothHaveData) {
    return {
      tone: 'neutral',
      headline: 'Not enough data yet',
      detail: `WattWise needs recorded usage in both ${monthALabel} and ${monthBLabel} to compare them.`,
    };
  }

  const { energy, cost } = comparison;

  if (energy.direction === 'flat') {
    return {
      tone: 'neutral',
      headline: 'About the same',
      detail: `${monthALabel} used roughly the same energy as ${monthBLabel}.`,
    };
  }

  const usedLess = energy.direction === 'down';
  const percentText = energy.absolutePercent === null
    ? ''
    : ` (${energy.absolutePercent.toFixed(1)}%)`;

  return {
    tone: usedLess ? 'good' : 'alert',
    headline: usedLess
      ? `${energy.absolutePercent === null ? '' : `${energy.absolutePercent.toFixed(1)}% `}less energy`
      : `${energy.absolutePercent === null ? '' : `${energy.absolutePercent.toFixed(1)}% `}more energy`,
    detail: `${monthALabel} used ${energy.absolute.toFixed(2)} kWh ${usedLess ? 'less' : 'more'} than ${monthBLabel}${percentText}, a difference of ₱${cost.absolute.toFixed(2)}.`,
  };
};

/**
 * How close WattWise's estimate came to the real PELCO III bill.
 *
 * This is the only check in the app that grades the billing model against
 * reality rather than against another app-computed figure.
 */
export const compareToActualBill = (totals, actualBill) => {
  if (!actualBill) return null;

  const estimatedCost = toNumber(totals?.cost);
  const actualCost = toNumber(actualBill.totalCost);
  if (actualCost <= 0) return null;

  const difference = estimatedCost - actualCost;
  const percent = (difference / actualCost) * 100;

  return {
    estimatedCost,
    actualCost,
    estimatedKWh: toNumber(totals?.kWh),
    actualKWh: toNumber(actualBill.totalKWh),
    difference,
    absolute: Math.abs(difference),
    percent,
    absolutePercent: Math.abs(percent),
    // Under 5% is the band the billing spec expects, given the EVAT supply-side
    // factor is the model's one approximation.
    isClose: Math.abs(percent) <= 5,
    direction: difference >= 0 ? 'over' : 'under',
  };
};

/**
 * Why the estimate and the paper bill differ, in one sentence for the user.
 *
 * The 5% band assumes WattWise measures everything the bill covers. It does
 * not: the bill is for the whole apartment, WattWise is two outlets. So a large
 * *under* reading is the expected result and says nothing about the billing
 * model - telling that user to check their generation rate sends them after a
 * fault that is not there. A large *over* reading is the one scope cannot
 * explain, since two outlets cannot cost more than the apartment containing
 * them, and that is where the rate is worth checking.
 *
 * Lives here rather than in a screen so both clients say the same thing. The
 * "98.9% off" figure is the first thing anyone reviewing this project asks
 * about, and two clients answering it differently would be worse than either
 * answer alone.
 */
export const explainAccuracy = (accuracy, monthLabel) => {
  const percent = accuracy.absolutePercent.toFixed(1);

  if (accuracy.isClose) {
    return `WattWise is tracking your ${monthLabel} bill closely.`;
  }

  if (accuracy.direction === 'under') {
    return `WattWise read ${percent}% under the ${monthLabel} bill. That is expected `
      + 'unless everything you own runs through these two outlets - the bill covers the '
      + 'whole apartment, WattWise covers outlet 1 and outlet 2. This gap is a difference '
      + 'in what is being measured, not an error in the estimate.';
  }

  return `WattWise read ${percent}% over the ${monthLabel} bill. Two outlets cannot cost `
    + 'more than the whole apartment they are in, so check that your generation rate in '
    + "Settings matches that month's bill.";
};
