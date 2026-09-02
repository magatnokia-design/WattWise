import test from 'node:test';
import assert from 'node:assert/strict';

import { applyFinalizedSpend } from '../src/screens/BudgetTracking/utils/budgetHelpers.js';

/*
 * `processDailyRollup` prices a month from the supply rates in Settings and
 * `finalizeInvoice` never touches the budget document, so a finalized month
 * disagreed with its own statement for ever: August 2026 read P79.39 on the
 * Budget page against a statement stamped FINAL for P85.09.
 */

const AUGUST = { id: '2026-08', monthKey: '2026-08', month: 'Aug', year: '2026', spent: 79.39, budget: 400 };
const SEPTEMBER = { id: '2026-09', monthKey: '2026-09', month: 'Sep', year: '2026', spent: 5.83, budget: 1000 };

const invoices = (entries) => new Map(Object.entries(entries));

test('a finalized month shows what the statement billed', () => {
  const [august] = applyFinalizedSpend([AUGUST], invoices({
    '2026-08': { status: 'FINALIZED', totalAmountDue: 85.09 },
  }));

  assert.equal(august.spent, 85.09);
  assert.equal(august.isFinal, true);
  assert.equal(august.budget, 400, 'the budget in force then is untouched');
});

test('an open month keeps the stored figure, so it agrees with its own alerts', () => {
  // handleBudgetAlerts fires on the stored currentSpending. A screen showing a
  // different number than the one that triggered "75% of your budget used"
  // would replace one disagreement with another.
  const [september] = applyFinalizedSpend([SEPTEMBER], invoices({
    '2026-09': { status: 'DRAFT', totalAmountDue: 6.40 },
  }));

  assert.equal(september.spent, 5.83);
  assert.equal(september.isFinal, false);
});

test('a month awaiting its official rate is not final either', () => {
  const [august] = applyFinalizedSpend([AUGUST], invoices({
    '2026-08': { status: 'PENDING', totalAmountDue: 83.40 },
  }));

  assert.equal(august.spent, 79.39);
  assert.equal(august.isFinal, false);
});

test('a month with no statement, or a failed read, keeps what it had', () => {
  for (const lookup of [invoices({}), new Map(), null, undefined]) {
    const [august] = applyFinalizedSpend([AUGUST], lookup);
    assert.equal(august.spent, 79.39);
    assert.equal(august.isFinal, false);
  }
});

test('a finalized month missing its total is not billed at zero', () => {
  // `Number(null)` is 0, not NaN.
  for (const total of [null, undefined, '', 'n/a']) {
    const [august] = applyFinalizedSpend([AUGUST], invoices({
      '2026-08': { status: 'FINALIZED', totalAmountDue: total },
    }));

    assert.equal(august.spent, 79.39, 'the stored figure stands');
    assert.equal(august.isFinal, false);
  }
});

test('a genuine zero is kept, because a month that measured nothing cost nothing', () => {
  const [august] = applyFinalizedSpend([AUGUST], invoices({
    '2026-08': { status: 'FINALIZED', totalAmountDue: 0 },
  }));

  assert.equal(august.spent, 0);
  assert.equal(august.isFinal, true);
});

test('rows are matched by month, never by position', () => {
  const rows = applyFinalizedSpend([SEPTEMBER, AUGUST], invoices({
    '2026-08': { status: 'FINALIZED', totalAmountDue: 85.09 },
  }));

  assert.equal(rows[0].spent, 5.83, 'September untouched');
  assert.equal(rows[1].spent, 85.09, 'August corrected');
});

test('a plain object of invoices works as well as a Map', () => {
  const [august] = applyFinalizedSpend([AUGUST], {
    '2026-08': { status: 'FINALIZED', totalAmountDue: 85.09 },
  });

  assert.equal(august.spent, 85.09);
});

test('a row carrying only an id still matches its statement', () => {
  const [august] = applyFinalizedSpend(
    [{ id: '2026-08', month: 'Aug', year: '2026', spent: 79.39, budget: 400 }],
    invoices({ '2026-08': { status: 'FINALIZED', totalAmountDue: 85.09 } })
  );

  assert.equal(august.spent, 85.09);
});

test('an empty or malformed history does not throw', () => {
  assert.deepEqual(applyFinalizedSpend([], invoices({})), []);
  assert.deepEqual(applyFinalizedSpend(null, invoices({})), []);
});
