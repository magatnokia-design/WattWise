const { calculatePelcoIIIBill, DEFAULT_SUPPLY_RATES, hasSupplyRates } = require('./billing');
const { getDaysInManilaMonth } = require('./manilaTime');

/**
 * Invoice assembly and its state machine.
 *
 * PELCO III computes one averaged rate per month in arrears, applied uniformly
 * to every kWh. So kWh is accumulated across the whole period and priced once -
 * never per-day and summed. The catch is that the correct rate does not exist
 * until after the period closes, which is what the three states are for:
 *
 *   DRAFT      period still open; priced with the previous month's rates
 *   PENDING    period closed, official rates not yet entered; still an estimate
 *   FINALIZED  user entered the official rates for this billing month; locked
 */

const STATUS = {
  DRAFT: 'DRAFT',
  PENDING: 'PENDING',
  FINALIZED: 'FINALIZED',
};

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const round2 = (value) => Number(toNumber(value).toFixed(2));

const pad = (value) => String(value).padStart(2, '0');

/** Calendar-month period. Reading dates run 1st to last day inclusive. */
const getBillingPeriod = (billingMonth) => {
  const [year, month] = String(billingMonth).split('-').map(Number);
  if (!year || !month) return null;

  const billingDays = getDaysInManilaMonth(`${billingMonth}-01`);

  return {
    billingMonth,
    readingDateFrom: `${billingMonth}-01`,
    readingDateTo: `${billingMonth}-${pad(billingDays)}`,
    billingDays,
  };
};

const previousMonth = (billingMonth) => {
  const [year, month] = String(billingMonth).split('-').map(Number);
  if (!year || !month) return null;
  return month === 1 ? `${year - 1}-12` : `${year}-${pad(month - 1)}`;
};

/**
 * Which rates to price this period with, and whether that makes it an estimate.
 *
 * Order: the official rates entered when finalizing, then the most recent
 * finalized invoice, then whatever the user saved in Settings, then the seeded
 * defaults - so a first-ever invoice still prices, just as an estimate.
 *
 * The Settings rung matters for a new account: without it a user who carefully
 * entered their generation rate would still get a statement priced at the
 * seeded defaults until their first finalization.
 */
const resolveSupplyRates = ({ billingMonth, officialRates, lastFinalized, userRates }) => {
  if (officialRates) {
    return {
      rates: officialRates,
      rateSourceMonth: billingMonth,
      rateSource: 'official',
      isEstimate: false,
    };
  }

  if (lastFinalized?.supplyRates) {
    return {
      rates: lastFinalized.supplyRates,
      rateSourceMonth: lastFinalized.billingMonth || null,
      rateSource: 'lastFinalized',
      isEstimate: true,
    };
  }

  if (hasSupplyRates(userRates)) {
    // `rateSourceMonth` answers "which billing month's finalized rates were
    // reused", which is genuinely null here - these came from the Settings
    // editor, not from a month. The PDF used to read that null as "the seeded
    // defaults" and tell a user who had carefully entered their own rates that
    // the statement was priced with default ones. Named explicitly instead.
    return { rates: userRates, rateSourceMonth: null, rateSource: 'settings', isEstimate: true };
  }

  return {
    rates: DEFAULT_SUPPLY_RATES,
    rateSourceMonth: null,
    rateSource: 'default',
    isEstimate: true,
  };
};

const resolveStatus = ({ period, officialRates, todayKey }) => {
  if (officialRates) return STATUS.FINALIZED;
  return todayKey > period.readingDateTo ? STATUS.PENDING : STATUS.DRAFT;
};

/**
 * Days of the period that have elapsed, used for the end-of-period projection.
 * Clamped to at least 1 so day one does not divide by zero.
 */
const elapsedDays = (period, todayKey) => {
  if (todayKey > period.readingDateTo) return period.billingDays;
  if (todayKey < period.readingDateFrom) return 0;
  return Math.max(1, Number(todayKey.slice(8, 10)));
};

/**
 * @param {string} billingMonth YYYY-MM
 * @param {Array} dailyEntries history_daily documents for the month.
 * @param {object} [liveToday] Today's in-progress usage, same shape.
 * @param {object} [officialRates] Block 1 rates; presence means FINALIZED.
 * @param {object} [lastFinalized] Previous finalized invoice, for rate fallback.
 * @param {string} todayKey YYYY-MM-DD in Manila terms.
 * @param {object} [userRates] Block 1 rates saved in Settings, used when no
 *   finalized invoice exists yet.
 * @param {boolean} [isLifeline]
 */
const buildInvoice = ({
  billingMonth,
  dailyEntries = [],
  liveToday = null,
  officialRates = null,
  lastFinalized = null,
  userRates = null,
  todayKey,
  isLifeline = false,
}) => {
  const period = getBillingPeriod(billingMonth);
  if (!period) return null;

  // Live today replaces any stored row for the same date, so an open day is not
  // counted twice once the rollup writes it.
  const byDate = new Map();
  dailyEntries.forEach((entry) => {
    if (entry?.date) byDate.set(entry.date, entry);
  });
  if (liveToday?.date && liveToday.date.startsWith(billingMonth)) {
    byDate.set(liveToday.date, liveToday);
  }

  const entries = [...byDate.values()].filter((entry) =>
    String(entry.date || '').startsWith(billingMonth)
  );

  const totalKwh = entries.reduce((sum, entry) => sum + toNumber(entry.totalEnergy), 0);
  const outlet1Kwh = entries.reduce((sum, entry) => sum + toNumber(entry.outlet1Energy), 0);
  const outlet2Kwh = entries.reduce((sum, entry) => sum + toNumber(entry.outlet2Energy), 0);

  const applianceTotals = new Map();
  entries.forEach((entry) => {
    (Array.isArray(entry.applianceBreakdown) ? entry.applianceBreakdown : []).forEach((item) => {
      const name = String(item?.applianceName || '').trim();
      const energyKwh = toNumber(item?.energyKwh);
      if (!name || energyKwh <= 0) return;

      const existing = applianceTotals.get(name) || { applianceName: name, energyKwh: 0 };
      existing.energyKwh += energyKwh;
      applianceTotals.set(name, existing);
    });
  });

  const { rates, rateSourceMonth, rateSource, isEstimate } = resolveSupplyRates({
    billingMonth,
    officialRates,
    lastFinalized,
    userRates,
  });

  const status = resolveStatus({ period, officialRates, todayKey });

  // One rate, applied once, over the whole period's kWh.
  const bill = calculatePelcoIIIBill(totalKwh, { supplyRates: rates, isLifeline });

  // Cost per appliance is the bill split by share of energy, so the parts always
  // add up to the total rather than each being re-priced at an average rate.
  const applianceBreakdown = [...applianceTotals.values()]
    .map((item) => ({
      applianceName: item.applianceName,
      energyKwh: Number(item.energyKwh.toFixed(4)),
      cost: totalKwh > 0 ? round2(bill.totals.total * (item.energyKwh / totalKwh)) : 0,
    }))
    .sort((a, b) => b.energyKwh - a.energyKwh);

  const daysElapsed = elapsedDays(period, todayKey);
  const isOpen = status === STATUS.DRAFT;

  // Projection only means something while the period is still running.
  const projectedKwh = isOpen && daysElapsed > 0
    ? Number(((totalKwh / daysElapsed) * period.billingDays).toFixed(3))
    : totalKwh;
  const projectedBill = isOpen && projectedKwh > totalKwh
    ? calculatePelcoIIIBill(projectedKwh, { supplyRates: rates, isLifeline })
    : bill;

  return {
    billingMonth,
    ...period,
    status,
    isEstimate,
    rateSourceMonth,
    rateSource,
    supplyRates: rates,
    isLifeline: !!isLifeline,

    daysElapsed,
    // How many days actually contributed energy, which is not the length of
    // the billing period. processDailyRollup writes no document for a day the
    // Hub never reported, so a 31-day August can be built from 22 rows - and a
    // statement that prints only "Billing days 31" invites the reader to
    // divide the total by 31 and get a daily average that was never measured.
    daysMeasured: entries.length,
    totalKwh: Number(totalKwh.toFixed(3)),
    outlet1Kwh: Number(outlet1Kwh.toFixed(3)),
    outlet2Kwh: Number(outlet2Kwh.toFixed(3)),
    applianceBreakdown,

    bill,
    totalAmountDue: bill.totals.total,
    effectiveRate: bill.effectiveRate,

    projectedKwh,
    projectedTotal: projectedBill.totals.total,

    finalizedAt: null,
    estimateTotalBeforeFinalize: null,
  };
};

/**
 * Difference between what the user was last shown and the finalized figure.
 * Surfacing this explains the shift as expected rather than as a bug.
 */
const buildFinalizationDelta = (estimateTotal, finalTotal) => {
  const estimate = toNumber(estimateTotal);
  const final = toNumber(finalTotal);

  return {
    estimateTotal: round2(estimate),
    finalTotal: round2(final),
    difference: round2(final - estimate),
    direction: final >= estimate ? 'higher' : 'lower',
  };
};

module.exports = {
  STATUS,
  getBillingPeriod,
  previousMonth,
  buildInvoice,
  buildFinalizationDelta,
};
