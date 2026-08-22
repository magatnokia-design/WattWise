const test = require('node:test');
const assert = require('node:assert/strict');

const { recomputeMonthlyBudget } = require('../src/scheduled/processDailyRollup');

// Minimal Firestore stand-in: the month query returns the supplied daily rows,
// and the budget write is captured rather than sent anywhere.
const stubDb = (dailyRows, captured) => {
  const query = {
    where() {
      return query;
    },
    async get() {
      return {
        forEach(fn) {
          dailyRows.forEach((row) => fn({ data: () => row }));
        },
      };
    },
  };

  return {
    collection: () => query,
    doc: () => ({
      async set(payload) {
        Object.assign(captured, payload);
      },
    }),
  };
};

const runBudget = async (dailyRows) => {
  const captured = {};
  await recomputeMonthlyBudget({
    db: stubDb(dailyRows, captured),
    userId: 'user-1',
    monthString: '2026-08',
  });
  return captured;
};

test('a month with nothing measured spends nothing', async () => {
  // A brand-new account with no Hub linked used to report "spent P5.60" - the
  // P5.00 metering flat plus its VAT - before it had measured a single watt,
  // which Compare Months then labelled "measured by WattWise".
  const budget = await runBudget([]);

  assert.equal(budget.currentSpending, 0);
  assert.equal(budget.outlet1Spending, 0);
  assert.equal(budget.outlet2Spending, 0);
});

test('daily rows that all recorded zero still spend nothing', async () => {
  // processDailyRollup writes a row per user per night whether or not that user
  // has hardware, so an unpaired account accrues zero-energy rows rather than no
  // rows at all. Those must not add up to a bill either.
  const budget = await runBudget([
    { date: '2026-08-18', totalEnergy: 0, outlet1Energy: 0 },
    { date: '2026-08-19', totalEnergy: 0, outlet1Energy: 0 },
    { date: '2026-08-20', totalEnergy: 0, outlet1Energy: 0 },
  ]);

  assert.equal(budget.currentSpending, 0);
});

test('a month with real energy still owes the metering flat', async () => {
  // The guard is on zero, not on the flat itself. Once anything is measured the
  // once-a-month P5.00 is charged exactly as before.
  const budget = await runBudget([
    { date: '2026-08-21', totalEnergy: 2.0, outlet1Energy: 0.5 },
    { date: '2026-08-22', totalEnergy: 1.0, outlet1Energy: 0.5 },
  ]);

  assert.ok(budget.currentSpending > 5.6, 'the flat plus the electricity is charged');
  assert.equal(
    Number((budget.outlet1Spending + budget.outlet2Spending).toFixed(2)),
    budget.currentSpending,
    'the split still sums to the total'
  );
});

test('the outlet split stays proportional to energy', async () => {
  const budget = await runBudget([
    { date: '2026-08-21', totalEnergy: 4.0, outlet1Energy: 3.0 },
  ]);

  // Outlet 1 drew three quarters of the month, so it carries three quarters of
  // the bill - fixed component included, counted once across the pair.
  const share = budget.outlet1Spending / budget.currentSpending;
  assert.ok(Math.abs(share - 0.75) < 0.01, `outlet 1 share was ${share}`);
});
