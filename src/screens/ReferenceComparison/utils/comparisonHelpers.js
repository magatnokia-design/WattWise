import { calculatePelcoIIIBill } from '../../../utils/billing';
import { aggregateApplianceUsage } from '../../../utils/applianceBreakdown';

// How many months back the pickers offer. A year covers a full seasonal cycle,
// which is the comparison that actually explains a bill jump.
export const MONTH_OPTION_COUNT = 12;

export const emptyMonthTotals = {
  kWh: 0,
  cost: 0,
  // What this month's energy comes to at the user's configured rates. Kept
  // beside `cost` rather than instead of it, because once a month is finalized
  // `cost` becomes the billed figure and the two stop being the same number -
  // see applyFinalizedCost.
  estimatedCost: 0,
  outlet1: 0,
  outlet2: 0,
  outlet1Name: 'Outlet 1',
  outlet2Name: 'Outlet 2',
  appliances: [],
  daysRecorded: 0,
  isFinal: false,
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
 * Two attributions come out of this, and they are not interchangeable. The
 * outlet totals say which of the two physical outlets the energy went through,
 * named for the appliance each held on the LAST recorded day. `appliances` is
 * the per-day credit - the name the outlet carried on the day it was measured -
 * which is the same rule the emailed statement uses and the only one that
 * survives a rename. Both are returned so a screen can show them side by side
 * and say which is which, rather than printing one and implying the other.
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

  // A month WattWise measured nothing in owes it nothing measured. This figure
  // is labelled as measured usage, so an empty month reads P0.00 rather than
  // the bare metering flat.
  const estimatedCost = calculatePelcoIIIBill(totals.kWh, {
    supplyRates,
    profileId,
    includePeriodFlats: totals.kWh > 0,
  }).totals.total;

  return {
    ...totals,
    cost: estimatedCost,
    estimatedCost,
    outlet1Name: String(latest.outlet1Name || '').trim() || 'Outlet 1',
    outlet2Name: String(latest.outlet2Name || '').trim() || 'Outlet 2',
    appliances: aggregateApplianceUsage(rows),
    daysRecorded: rows.length,
    isFinal: false,
  };
};

/**
 * Replaces a month's estimated cost with the figure it was actually billed at,
 * once that month has been finalized.
 *
 * Until `finalizeInvoice` runs, a month is priced with whatever supply rates
 * are configured in Settings - an estimate, because PELCO III does not publish
 * the official generation rate until after the period closes. Finalizing
 * recomputes the month with the real rates and emails that figure out as the
 * statement. From that moment there are two peso answers for one month, and
 * this screen was still showing the first: August 2026 read P79.39 here beside
 * a statement marked FINAL for P85.09, same 7.24 kWh, with nothing on either
 * surface naming which rate set produced it.
 *
 * The billed figure wins, because it is the one in the user's inbox.
 *
 * `estimatedCost` deliberately survives untouched. It is what the
 * month-on-month comparison runs on, and it has to: a finalized August against
 * an unfinalized July would otherwise measure one month's official rates
 * against another month's configured ones and report the difference as a change
 * in consumption. Same rule for both months, or the comparison is not one.
 *
 * A read that failed is not a month that was never finalized, so an absent or
 * unreadable invoice leaves the totals exactly as they were rather than
 * asserting "estimate".
 *
 * @param {object} totals Output of `summarizeDailyEntries`.
 * @param {object|null} invoice The stored `invoices/{billingMonth}` document.
 */
export const applyFinalizedCost = (totals, invoice) => {
  const base = totals || emptyMonthTotals;
  if (invoice?.status !== 'FINALIZED') return base;

  // `Number(null)` is 0, not NaN, so a finalized document missing its total
  // would coerce to a billed figure of P0.00 and overwrite a real estimate
  // with a fabricated zero.
  const raw = invoice.totalAmountDue;
  if (raw === null || raw === undefined || raw === '') return base;

  const billed = Number(raw);
  if (!Number.isFinite(billed)) return base;

  return { ...base, cost: billed, isFinal: true };
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
    // Estimated cost on both sides, never the billed one. See applyFinalizedCost.
    cost: buildDelta(a.estimatedCost ?? a.cost, b.estimatedCost ?? b.cost),
    outlet1: buildDelta(a.outlet1, b.outlet1),
    outlet2: buildDelta(a.outlet2, b.outlet2),
    hasData: a.daysRecorded > 0 || b.daysRecorded > 0,
    bothHaveData: a.daysRecorded > 0 && b.daysRecorded > 0,
  };
};

/**
 * How the selected month compares with the month before it, in one sentence.
 *
 * The baseline used to be a second month the user picked. That put two
 * unrelated questions behind one screen with no way to tell them apart: "am I
 * using more than last month" (needs two measured months) and "is WattWise's
 * bill estimate right" (needs one month and a paper bill). Only the first
 * dropdown ever fed the bill card, so choosing a month in the second one
 * changed a comparison the user could not see the boundary of - the reasonable
 * reading was that it somehow altered the bill check too, and it never did.
 *
 * One month is selected now and the baseline is always the month before it,
 * which is the only month-on-month comparison anyone was making anyway.
 *
 * `available` is false when the preceding month has no rollups, and callers
 * must render that as an absence rather than as a result. A month that was
 * never measured is not a month that used zero - showing "up 100%" against it
 * is the same class of mistake as grading an unplugged outlet's 0.0 V.
 *
 * `partial` is the other way this comparison lies, and it is the one that shows
 * up on the second of every month: a month two days old against a finished one
 * is a smaller number for a reason that has nothing to do with consumption. Two
 * days of September against twenty-four days of August reads as "92% less
 * energy", which is arithmetically true of the totals and worthless as a trend.
 * So the day counts are always stated, and a month that is clearly still
 * running is reported without a good/bad verdict rather than congratulating the
 * user for not having lived through the rest of it yet.
 *
 * @param {object} [days] `recorded` and `previousRecorded` day counts. Omitted,
 *   nothing is claimed about completeness and the comparison is graded as-is.
 */
export const buildTrend = (comparison, monthLabel, previousLabel, days = {}) => {
  if (!comparison.bothHaveData) {
    return {
      available: false,
      partial: false,
      tone: 'neutral',
      headline: `No ${previousLabel} usage on record`,
      detail: `${monthLabel} is shown on its own. The month-on-month change appears once `
        + `${previousLabel} has at least one recorded day. The bill check below never needs a `
        + `second month - it works from day one, and bills from before you owned the hub count.`,
    };
  }

  const recorded = toNumber(days.recorded);
  const previousRecorded = toNumber(days.previousRecorded);

  // Four fifths rather than an exact match, so a short calendar month is not
  // permanently caveated against a long one - February's 28 days against
  // January's 31 is 90% and a fair comparison. A month still in progress is
  // nowhere near the threshold within the first three weeks, which is the
  // window where the misreading actually happens.
  const partial = recorded > 0
    && previousRecorded > 0
    && recorded < previousRecorded * 0.8;

  const dayNote = recorded > 0 && previousRecorded > 0
    ? ` Counted over ${recorded} recorded ${recorded === 1 ? 'day' : 'days'} in ${monthLabel} `
      + `against ${previousRecorded} in ${previousLabel}.`
    : '';

  if (partial) {
    const gap = comparison.energy.absolute;
    const morePlain = comparison.energy.direction === 'up' ? 'more' : 'less';

    // Fewer days landing on the same total is not sameness, so the flat case
    // does not get the "about the same" wording either.
    const gapText = gap < 0.005
      ? `So far ${monthLabel} has used about as much energy as ${previousLabel}, over fewer days.`
      : `So far ${monthLabel} has used ${gap.toFixed(2)} kWh ${morePlain} than ${previousLabel}, `
        + `but most of that gap is the days that have not happened yet, not a change in how much `
        + `you are using.`;

    return {
      available: true,
      partial: true,
      // No verdict colour. The difference is mostly the missing days, and
      // painting it green would tell a user they are doing well on the second
      // of the month, every month.
      tone: 'neutral',
      headline: `${monthLabel} is not a full month yet`,
      detail: `${gapText}${dayNote}`,
    };
  }

  const { energy, cost } = comparison;

  if (energy.direction === 'flat') {
    return {
      available: true,
      partial: false,
      tone: 'neutral',
      headline: `About the same as ${previousLabel}`,
      detail: `${monthLabel} used roughly the same energy as ${previousLabel}.${dayNote}`,
    };
  }

  const usedLess = energy.direction === 'down';
  const percentText = energy.absolutePercent === null
    ? ''
    : `${energy.absolutePercent.toFixed(1)}% `;

  return {
    available: true,
    partial: false,
    tone: usedLess ? 'good' : 'alert',
    headline: `${percentText}${usedLess ? 'less' : 'more'} energy than ${previousLabel}`,
    detail: `${monthLabel} used ${energy.absolute.toFixed(2)} kWh ${usedLess ? 'less' : 'more'} `
      + `than ${previousLabel}, a difference of ₱${cost.absolute.toFixed(2)}.${dayNote}`,
  };
};

/**
 * How close WattWise's estimate came to the real PELCO III bill.
 *
 * This is the only check in the app that grades the billing model against
 * reality rather than against another app-computed figure.
 */
export const compareToActualBill = (totals, actualBill, options = {}) => {
  if (!actualBill) return null;

  const estimatedCost = toNumber(totals?.cost);
  const actualCost = toNumber(actualBill.totalCost);
  if (actualCost <= 0) return null;

  const difference = estimatedCost - actualCost;
  const percent = (difference / actualCost) * 100;

  // The tariff graded on its own terms: the bill's *own* kWh run through
  // calculatePelcoIIIBill, against the pesos the bill actually charged.
  //
  // The 5% band used to be applied to the comparison above, which grades pesos
  // measured over different energy - the bill covers a whole apartment, WattWise
  // covers two outlets. That can never pass. The owner's card read
  // "-P1173.85 (99.2%) - Outside the expected 5% band" directly above a
  // paragraph explaining the gap is expected, and it would have read that way
  // every month for every user, since nobody's bill covers only these two
  // outlets.
  //
  // Feeding the bill's kWh through the tariff separates the two questions: "we
  // measured less" (scope, always true, not a fault) from "our arithmetic is
  // wrong" (real, and previously invisible behind a warning that was always on).
  // Graded against a real 116 kWh / P1183.00 bill, the model lands within 1.8%.
  const actualKWh = toNumber(actualBill.totalKWh);
  let modelCheck = null;

  if (actualKWh > 0) {
    const modelled = calculatePelcoIIIBill(actualKWh, {
      supplyRates: options.supplyRates || null,
      profileId: options.profileId || null,
      isLifeline: options.isLifeline === true,
    });
    const modelledCost = toNumber(modelled?.totals?.total);

    if (modelledCost > 0) {
      const modelDifference = modelledCost - actualCost;
      const modelPercent = (modelDifference / actualCost) * 100;

      modelCheck = {
        billedKWh: actualKWh,
        billedCost: actualCost,
        modelledCost,
        difference: modelDifference,
        absolute: Math.abs(modelDifference),
        percent: modelPercent,
        absolutePercent: Math.abs(modelPercent),
        // Under 5% is the band the billing spec expects, given the EVAT
        // supply-side factor is the model's one approximation.
        isClose: Math.abs(modelPercent) <= 5,
        direction: modelDifference >= 0 ? 'over' : 'under',
      };
    }
  }

  return {
    estimatedCost,
    actualCost,
    estimatedKWh: toNumber(totals?.kWh),
    actualKWh,
    difference,
    absolute: Math.abs(difference),
    percent,
    absolutePercent: Math.abs(percent),
    // Whether the tariff is right, which is what the badge was always meant to
    // say. Null when the bill carries no kWh figure to grade against - there is
    // no check to report then, rather than a failed one.
    modelCheck,
    isClose: modelCheck ? modelCheck.isClose : null,
    // The scope gap, reported as a fact rather than as a failure. Two outlets
    // measuring less than a whole apartment is the expected result.
    measuresLessThanBill: toNumber(totals?.kWh) < actualKWh,
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

  // The tariff check first, because it is the one that can actually fail for a
  // reason worth acting on. The scope gap below is expected and permanent.
  if (accuracy.modelCheck && !accuracy.modelCheck.isClose) {
    return `Priced against the ${monthLabel} bill's own `
      + `${accuracy.modelCheck.billedKWh.toFixed(0)} kWh, WattWise's rates come to `
      + `₱${accuracy.modelCheck.modelledCost.toFixed(2)} against ₱${accuracy.actualCost.toFixed(2)} `
      + `charged - ${accuracy.modelCheck.absolutePercent.toFixed(1)}% ${accuracy.modelCheck.direction}. `
      + 'Check that your generation rate in Settings matches that month\'s bill.';
  }

  if (accuracy.modelCheck) {
    return `Priced against the ${monthLabel} bill's own `
      + `${accuracy.modelCheck.billedKWh.toFixed(0)} kWh, WattWise's rates land within `
      + `${accuracy.modelCheck.absolutePercent.toFixed(1)}% of what you were charged. `
      + 'It measured less than the bill because the bill covers the whole apartment '
      + 'and WattWise covers outlet 1 and outlet 2.';
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
