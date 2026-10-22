import test from 'node:test';
import assert from 'node:assert/strict';

import { summarizeMonth } from '../src/screens/BudgetTracking/utils/budgetHelpers.js';

/*
 * The Budget screen's "This month at a glance". budgetHelpers.js is a
 * copy-rule file, so this test exists in both repos.
 */

test('on track: the pace ends the month within budget', () => {
  const m = summarizeMonth({ monthlyBudget: 300, currentSpending: 110, currentDay: 22, daysInMonth: 31 });
  assert.equal(m.status, 'on-track');
  assert.equal(m.dailyAverage, 5);
  assert.equal(m.projected, 155);
  assert.equal(m.daysLeft, 10);
  assert.equal(m.safeDaily, 19); // (300 - 110) / 10
});

test('at risk: under now, over by month end at this pace', () => {
  const m = summarizeMonth({ monthlyBudget: 150, currentSpending: 110, currentDay: 22, daysInMonth: 31 });
  assert.equal(m.status, 'at-risk');
  assert.equal(m.projectedDifference, 5);
});

test('over: already past the budget, nothing safe left to spend', () => {
  const m = summarizeMonth({ monthlyBudget: 100, currentSpending: 110, currentDay: 22, daysInMonth: 31 });
  assert.equal(m.status, 'over');
  assert.equal(m.safeDaily, 0);
});

test('no budget: no status, still a projection', () => {
  const m = summarizeMonth({ monthlyBudget: 0, currentSpending: 60, currentDay: 10, daysInMonth: 30 });
  assert.equal(m.status, 'none');
  assert.equal(m.projected, 180);
  assert.equal(m.safeDaily, 0);
});
