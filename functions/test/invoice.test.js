const test = require('node:test');
const assert = require('node:assert/strict');

const {
  STATUS,
  getBillingPeriod,
  previousMonth,
  buildInvoice,
  buildFinalizationDelta,
} = require('../src/lib/invoice');

const day = (date, totalEnergy, extra = {}) => ({
  date,
  totalEnergy,
  outlet1Energy: totalEnergy * 0.7,
  outlet2Energy: totalEnergy * 0.3,
  applianceBreakdown: [
    { applianceName: 'Electric Fan', energyKwh: totalEnergy * 0.7 },
    { applianceName: 'Phone Charger', energyKwh: totalEnergy * 0.3 },
  ],
  ...extra,
});

const OFFICIAL = { generation: 5.5924, generationRateAdj: -0.0306, transmission: 1.5257, systemLoss: 0.5301 };

test('a calendar-month period spans the first to the last day', () => {
  assert.deepEqual(getBillingPeriod('2026-08'), {
    billingMonth: '2026-08',
    readingDateFrom: '2026-08-01',
    readingDateTo: '2026-08-31',
    billingDays: 31,
  });

  assert.equal(getBillingPeriod('2026-02').billingDays, 28);
  assert.equal(getBillingPeriod('2028-02').billingDays, 29, 'leap year');
});

test('previousMonth rolls across the year boundary', () => {
  assert.equal(previousMonth('2026-08'), '2026-07');
  assert.equal(previousMonth('2026-01'), '2025-12');
});

test('an open period is a DRAFT estimate using the fallback rates', () => {
  const invoice = buildInvoice({
    billingMonth: '2026-08',
    dailyEntries: [day('2026-08-01', 4), day('2026-08-02', 4)],
    todayKey: '2026-08-02',
    lastFinalized: { billingMonth: '2026-07', supplyRates: OFFICIAL },
  });

  assert.equal(invoice.status, STATUS.DRAFT);
  assert.equal(invoice.isEstimate, true);
  assert.equal(invoice.rateSourceMonth, '2026-07');
  assert.equal(invoice.totalKwh, 8);
});

test('a closed period with no official rates becomes PENDING', () => {
  const invoice = buildInvoice({
    billingMonth: '2026-08',
    dailyEntries: [day('2026-08-15', 100)],
    todayKey: '2026-09-01',
  });

  assert.equal(invoice.status, STATUS.PENDING);
  assert.equal(invoice.isEstimate, true);
});

test('entering official rates finalizes the invoice', () => {
  const invoice = buildInvoice({
    billingMonth: '2026-08',
    dailyEntries: [day('2026-08-15', 216)],
    todayKey: '2026-09-03',
    officialRates: OFFICIAL,
  });

  assert.equal(invoice.status, STATUS.FINALIZED);
  assert.equal(invoice.isEstimate, false);
  assert.equal(invoice.rateSourceMonth, '2026-08');
  // Same 216 kWh as the verified sample bill.
  assert.ok(Math.abs(invoice.totalAmountDue - 2251.72) < 3);
});

// The whole point of accumulating rather than billing per-day: one averaged
// rate over the period's kWh, not thirty small bills added together.
test('kWh accumulates across the period and is priced once', () => {
  const spread = buildInvoice({
    billingMonth: '2026-08',
    dailyEntries: Array.from({ length: 30 }, (_, i) => day(`2026-08-${String(i + 1).padStart(2, '0')}`, 7.2)),
    todayKey: '2026-09-01',
    officialRates: OFFICIAL,
  });

  const single = buildInvoice({
    billingMonth: '2026-08',
    dailyEntries: [day('2026-08-15', 216)],
    todayKey: '2026-09-01',
    officialRates: OFFICIAL,
  });

  assert.equal(spread.totalKwh, 216);
  assert.equal(spread.totalAmountDue, single.totalAmountDue);
  // The metering flat is charged once for the period, not once per day.
  const metering = spread.bill.items.distribution.find((item) => item.key === 'meteringRate');
  assert.equal(metering.amount, 5);
});

test('DRAFT projects an end-of-period total from the run rate', () => {
  const invoice = buildInvoice({
    billingMonth: '2026-08',
    // 10 days in, 5 kWh/day.
    dailyEntries: Array.from({ length: 10 }, (_, i) => day(`2026-08-${String(i + 1).padStart(2, '0')}`, 5)),
    todayKey: '2026-08-10',
  });

  assert.equal(invoice.totalKwh, 50);
  assert.equal(invoice.daysElapsed, 10);
  // 50 / 10 * 31 days
  assert.equal(invoice.projectedKwh, 155);
  assert.ok(invoice.projectedTotal > invoice.totalAmountDue);
});

test('a closed period does not project beyond what was measured', () => {
  const invoice = buildInvoice({
    billingMonth: '2026-08',
    dailyEntries: [day('2026-08-15', 100)],
    todayKey: '2026-09-05',
  });

  assert.equal(invoice.projectedKwh, invoice.totalKwh);
  assert.equal(invoice.projectedTotal, invoice.totalAmountDue);
});

test('live today replaces a stored row for the same date', () => {
  const invoice = buildInvoice({
    billingMonth: '2026-08',
    dailyEntries: [day('2026-08-01', 4), day('2026-08-02', 4)],
    liveToday: day('2026-08-02', 9),
    todayKey: '2026-08-02',
  });

  assert.equal(invoice.totalKwh, 13, 'not 17 - the stored row for the 2nd is superseded');
});

test('days outside the billing month are excluded', () => {
  const invoice = buildInvoice({
    billingMonth: '2026-08',
    dailyEntries: [day('2026-07-31', 100), day('2026-08-01', 5), day('2026-09-01', 100)],
    todayKey: '2026-08-05',
  });

  assert.equal(invoice.totalKwh, 5);
});

test('appliance costs sum to the invoice total', () => {
  const invoice = buildInvoice({
    billingMonth: '2026-08',
    dailyEntries: [day('2026-08-10', 120), day('2026-08-11', 96)],
    todayKey: '2026-09-01',
    officialRates: OFFICIAL,
  });

  const summed = invoice.applianceBreakdown.reduce((sum, item) => sum + item.cost, 0);
  assert.ok(Math.abs(summed - invoice.totalAmountDue) < 0.02);
  assert.equal(invoice.applianceBreakdown[0].applianceName, 'Electric Fan');
});

test('an empty month still produces a coherent invoice', () => {
  const invoice = buildInvoice({
    billingMonth: '2026-08',
    dailyEntries: [],
    todayKey: '2026-08-01',
  });

  assert.equal(invoice.totalKwh, 0);
  assert.equal(invoice.status, STATUS.DRAFT);
  // The metering flat is still owed.
  assert.equal(invoice.totalAmountDue, 5.6);
});

test('the finalization delta explains the shift from the estimate', () => {
  const delta = buildFinalizationDelta(1183.97, 1241.30);

  assert.equal(delta.difference, 57.33);
  assert.equal(delta.direction, 'higher');
  assert.equal(delta.estimateTotal, 1183.97);
});

// The Settings rung of resolveSupplyRates. Without it a user who entered their
// generation rate would still be billed at the seeded defaults until their
// first finalization, which is months away on a new account.
const SETTINGS_RATES = {
  generation: 6.2295,
  generationRateAdj: -0.0306,
  transmission: 1.2729,
  systemLoss: 0.5499,
};

test('rates saved in Settings price the invoice when nothing is finalized yet', () => {
  const invoice = buildInvoice({
    billingMonth: '2026-08',
    dailyEntries: [day('2026-08-15', 94)],
    todayKey: '2026-09-01',
    userRates: SETTINGS_RATES,
  });

  assert.equal(invoice.supplyRates.generation, SETTINGS_RATES.generation);
  // Still an estimate: these are the user's rates, not PELCO III's official
  // posting for this billing month.
  assert.equal(invoice.isEstimate, true);
});

test('a finalized invoice still outranks the Settings rates', () => {
  const invoice = buildInvoice({
    billingMonth: '2026-08',
    dailyEntries: [day('2026-08-15', 94)],
    todayKey: '2026-09-01',
    lastFinalized: { billingMonth: '2026-07', supplyRates: { generation: 5.5034 } },
    userRates: SETTINGS_RATES,
  });

  assert.equal(invoice.supplyRates.generation, 5.5034);
  assert.equal(invoice.rateSourceMonth, '2026-07');
});

test('a Settings object with no generation rate falls through to the defaults', () => {
  const invoice = buildInvoice({
    billingMonth: '2026-08',
    dailyEntries: [day('2026-08-15', 94)],
    todayKey: '2026-09-01',
    userRates: { generation: 0, transmission: 1.2 },
  });

  assert.notEqual(invoice.supplyRates.generation, 0);
});
