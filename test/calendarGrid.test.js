import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildMonthGrid,
  shiftMonth,
  applyRangeTap,
  isBetween,
  formatKeyShort,
} from '../src/utils/calendarGrid.js';

test('October 2026 starts on a Thursday, Monday first', () => {
  const grid = buildMonthGrid(2026, 9);
  assert.equal(grid.length, 42);
  // Mo Tu We are blank; Thursday holds the 1st.
  assert.deepEqual(grid.slice(0, 4), [null, null, null, '2026-10-01']);
  assert.equal(grid.filter(Boolean).length, 31);
  assert.equal(grid.filter(Boolean).at(-1), '2026-10-31');
});

test('a month starting on Monday has no leading blanks', () => {
  // 1 June 2026 is a Monday.
  assert.equal(buildMonthGrid(2026, 5)[0], '2026-06-01');
});

test('February has its leap day only in a leap year', () => {
  assert.equal(buildMonthGrid(2028, 1).filter(Boolean).length, 29);
  assert.equal(buildMonthGrid(2027, 1).filter(Boolean).length, 28);
});

test('months shift across the year boundary', () => {
  assert.deepEqual(shiftMonth({ year: 2026, monthIndex: 11 }, 1), { year: 2027, monthIndex: 0 });
  assert.deepEqual(shiftMonth({ year: 2026, monthIndex: 0 }, -1), { year: 2025, monthIndex: 11 });
});

test('range taps: start, then end, swapping a backwards pick', () => {
  let selection = applyRangeTap({ startDate: '2026-10-01', endDate: '2026-10-05' }, '2026-10-10');
  assert.deepEqual(selection, { startDate: '2026-10-10', endDate: null }, 'a full range restarts');

  selection = applyRangeTap(selection, '2026-10-20');
  assert.deepEqual(selection, { startDate: '2026-10-10', endDate: '2026-10-20' });

  const backwards = applyRangeTap({ startDate: '2026-10-10', endDate: null }, '2026-10-03');
  assert.deepEqual(backwards, { startDate: '2026-10-03', endDate: '2026-10-10' });

  const sameDay = applyRangeTap({ startDate: '2026-10-10', endDate: null }, '2026-10-10');
  assert.deepEqual(sameDay, { startDate: '2026-10-10', endDate: '2026-10-10' });
});

test('in-between is exclusive of both ends', () => {
  assert.equal(isBetween('2026-10-05', '2026-10-01', '2026-10-10'), true);
  assert.equal(isBetween('2026-10-01', '2026-10-01', '2026-10-10'), false);
  assert.equal(isBetween('2026-10-05', '2026-10-01', null), false);
});

test('short dates read from the key digits', () => {
  assert.equal(formatKeyShort('2026-10-08'), 'Oct 8, 2026');
  assert.equal(formatKeyShort('2026-10-08', false), 'Oct 8');
  assert.equal(formatKeyShort(''), '--');
});
