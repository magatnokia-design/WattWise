import test from 'node:test';
import assert from 'node:assert/strict';

import {
  aggregateApplianceUsage,
  foldApplianceRows,
  APPLIANCE_ROW_LIMIT,
} from '../src/utils/applianceBreakdown.js';
import {
  summarizeDailyEntries,
  applyInvoiceCost,
  describeCostBasis,
  compareMonths,
} from '../src/screens/ReferenceComparison/utils/comparisonHelpers.js';

/*
 * Compare Usage and the emailed statement have to itemise one month the same
 * way. They did not: the PDF credited energy to the name each outlet carried on
 * the day it was measured and printed six appliances for August 2026, while the
 * screen summed the two outlet totals and printed two - off the same 7.24 kWh.
 */

const day = (date, breakdown, extra = {}) => ({
  date,
  totalEnergy: breakdown.reduce((sum, item) => sum + item.energyKwh, 0),
  outlet1Energy: 0,
  outlet2Energy: 0,
  applianceBreakdown: breakdown,
  ...extra,
});

test('a rename splits one appliance into both names, never rewriting the earlier days', () => {
  const rows = aggregateApplianceUsage([
    day('2026-08-01', [{ applianceName: 'Nokia\u2019s Fan', energyKwh: 0.4, cost: 4 }]),
    day('2026-08-02', [{ applianceName: 'My Ceiling Fan', energyKwh: 0.6, cost: 6 }]),
  ]);

  assert.deepEqual(
    rows.map((row) => row.applianceName),
    ['My Ceiling Fan', 'Nokia\u2019s Fan'],
    'largest first, and the old name survives on the days it was measured'
  );
  assert.equal(rows[1].energyKwh, 0.4);
});

test('nameless and zero-energy entries are dropped rather than printed as blank rows', () => {
  const rows = aggregateApplianceUsage([
    day('2026-08-01', [
      { applianceName: '  ', energyKwh: 1.2, cost: 12 },
      { applianceName: 'LED Lamp', energyKwh: 0, cost: 0 },
      { applianceName: 'Television', energyKwh: 0.79, cost: 9.25 },
    ]),
  ]);

  assert.deepEqual(rows.map((row) => row.applianceName), ['Television']);
});

test('a day carrying no breakdown contributes nothing instead of throwing', () => {
  assert.deepEqual(aggregateApplianceUsage([{ date: '2026-08-01', totalEnergy: 1 }]), []);
  assert.deepEqual(aggregateApplianceUsage(null), []);
});

test('the folded rows always add up to the unfolded total', () => {
  const breakdown = Array.from({ length: 14 }, (unused, index) => ({
    applianceName: `Appliance ${index + 1}`,
    energyKwh: 1 - (index * 0.05),
    cost: 10 - (index * 0.5),
  }));

  const total = breakdown.reduce((sum, row) => sum + row.energyKwh, 0);
  const folded = foldApplianceRows(breakdown);
  const foldedTotal = folded.reduce((sum, row) => sum + row.energyKwh, 0);

  assert.equal(folded.length, APPLIANCE_ROW_LIMIT + 1);
  assert.equal(folded[folded.length - 1].applianceName, 'Other (8 appliances)');
  assert.ok(Math.abs(foldedTotal - total) < 1e-9, 'the residual closes the gap exactly');
});

test('a single leftover appliance is named, not called Other (1 appliances)', () => {
  const breakdown = Array.from({ length: APPLIANCE_ROW_LIMIT + 1 }, (unused, index) => ({
    applianceName: `Appliance ${index + 1}`,
    energyKwh: 1 - (index * 0.05),
    cost: 1,
  }));

  const folded = foldApplianceRows(breakdown);
  assert.equal(folded[APPLIANCE_ROW_LIMIT].applianceName, `Appliance ${APPLIANCE_ROW_LIMIT + 1}`);
});

test('a negligible tail is dropped rather than printed as 0.00 kWh', () => {
  const breakdown = Array.from({ length: 9 }, (unused, index) => ({
    applianceName: `Appliance ${index + 1}`,
    energyKwh: index < APPLIANCE_ROW_LIMIT ? 1 : 0.001,
    cost: 0,
  }));

  assert.equal(foldApplianceRows(breakdown).length, APPLIANCE_ROW_LIMIT);
});

test('the month summary carries the per-day breakdown beside the outlet totals', () => {
  const totals = summarizeDailyEntries([
    {
      date: '2026-08-01',
      totalEnergy: 1,
      outlet1Energy: 0.6,
      outlet2Energy: 0.4,
      outlet1Name: 'Speaker',
      outlet2Name: 'Electric Fan',
      applianceBreakdown: [
        { applianceName: 'LED Lamp', energyKwh: 0.6, cost: 6 },
        { applianceName: 'Electric Fan', energyKwh: 0.4, cost: 4 },
      ],
    },
  ]);

  // The outlet totals still answer "which socket", under the most recent name.
  assert.equal(totals.outlet1Name, 'Speaker');
  assert.equal(totals.outlet1, 0.6);
  // And the appliance rows answer "which appliance", under the name of the day.
  assert.deepEqual(totals.appliances.map((row) => row.applianceName), ['LED Lamp', 'Electric Fan']);
  assert.equal(totals.estimatedCost, totals.cost);
  assert.equal(totals.isFinal, false);
});

/*
 * Once a month is finalized there are two peso answers for it, and the screen
 * was showing the wrong one: August 2026 read P79.39 beside a statement marked
 * FINAL for P85.09.
 */

const AUGUST = summarizeDailyEntries([
  { date: '2026-08-01', totalEnergy: 7.24, outlet1Energy: 4.77, outlet2Energy: 2.47 },
]);

test('a finalized month shows the billed figure, not the estimate', () => {
  const final = applyInvoiceCost(AUGUST, {
    status: 'FINALIZED',
    totalAmountDue: 85.09,
    totalKwh: 7.24,
  });

  assert.equal(final.cost, 85.09);
  assert.equal(final.isFinal, true);
  assert.equal(final.costBasis, 'final');
  assert.equal(final.estimatedCost, AUGUST.estimatedCost, 'the estimate is kept, not overwritten');
});

test('a finalized month is adopted even if a day was backfilled behind it', () => {
  // It is a billed fact in an inbox and a locked record. The energy guard below
  // is for estimates, which are still moving.
  const final = applyInvoiceCost(AUGUST, {
    status: 'FINALIZED',
    totalAmountDue: 85.09,
    totalKwh: 6.1,
  });

  assert.equal(final.cost, 85.09);
  assert.equal(final.costBasis, 'final');
});

/*
 * The quiet half of the same bug. `resolveSupplyRates` prices an unfinalized
 * month from the last FINALIZED month's official rates and falls back to
 * Settings; this screen only ever used Settings. So the moment one month is
 * finalized, every later statement is priced from it and the screen is not.
 */

test('a pending month takes the statement estimate rather than computing its own', () => {
  const pending = applyInvoiceCost(AUGUST, {
    status: 'PENDING',
    totalAmountDue: 83.40,
    totalKwh: 7.24,
  });

  assert.equal(pending.cost, 83.40);
  assert.equal(pending.isFinal, false, 'still not final - no official rate has been entered');
  assert.equal(pending.costBasis, 'statement');
});

test('an unfinalized invoice pricing different energy is not adopted', () => {
  // The open month's invoice is refreshed once a day and can lag a rollup.
  // Printing its pesos beside freshly summed kWh would put a total next to a
  // price computed for a different number of kilowatt-hours.
  const stale = applyInvoiceCost(AUGUST, {
    status: 'DRAFT',
    totalAmountDue: 71.10,
    totalKwh: 6.4,
  });

  assert.equal(stale.cost, AUGUST.estimatedCost);
  assert.equal(stale.costBasis, 'estimate');
});

test('rounding in the stored kWh does not reject a matching invoice', () => {
  // totalKwh is stored to three places; the screen sums unrounded.
  const rounded = applyInvoiceCost(AUGUST, {
    status: 'PENDING',
    totalAmountDue: 83.40,
    totalKwh: 7.2404,
  });

  assert.equal(rounded.costBasis, 'statement');
});

test('an absent or unreadable invoice leaves the estimate standing', () => {
  for (const invoice of [null, undefined]) {
    const result = applyInvoiceCost(AUGUST, invoice);
    assert.equal(result.cost, AUGUST.estimatedCost);
    assert.equal(result.costBasis, 'estimate');
    assert.equal(result.isFinal, false);
  }
});

test('an invoice with no total does not overwrite the estimate with zero', () => {
  // `Number(null)` is 0, not NaN, so coercing first would bill the month at
  // P0.00 and, for a finalized one, call that final.
  for (const total of [null, undefined, '', 'n/a']) {
    for (const status of ['FINALIZED', 'PENDING']) {
      const result = applyInvoiceCost(AUGUST, { status, totalAmountDue: total, totalKwh: 7.24 });
      assert.equal(result.cost, AUGUST.estimatedCost);
      assert.equal(result.isFinal, false);
      assert.equal(result.costBasis, 'estimate');
    }
  }
});

test('the month-on-month change prices both months the same way', () => {
  const july = summarizeDailyEntries([
    { date: '2026-07-01', totalEnergy: 6.0, outlet1Energy: 4, outlet2Energy: 2 },
  ]);
  const august = applyInvoiceCost(AUGUST, {
    status: 'FINALIZED',
    totalAmountDue: 85.09,
    totalKwh: 7.24,
  });

  const comparison = compareMonths(august, july);

  assert.equal(
    comparison.cost.current,
    AUGUST.estimatedCost,
    'the finalized figure must not enter the delta - July has no official rates to meet it'
  );
  assert.equal(comparison.cost.previous, july.estimatedCost);
});

test('each basis describes itself differently, and none of them lie', () => {
  const final = describeCostBasis('final', 'Aug 2026');
  const statement = describeCostBasis('statement', 'Aug 2026');
  const estimate = describeCostBasis('estimate', 'Aug 2026');

  assert.match(final, /finalized figure/);
  assert.match(final, /official rates/);
  // The one that used to be wrong: a pending month priced from last month's
  // official rates was described as "an estimate at the rates set in Settings".
  assert.doesNotMatch(statement, /rates set in Settings/);
  assert.match(statement, /same estimate your emailed statement/);
  assert.match(estimate, /rates set in Settings/);
  assert.equal(new Set([final, statement, estimate]).size, 3);
});
