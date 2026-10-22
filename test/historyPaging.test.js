import test from 'node:test';
import assert from 'node:assert/strict';

import {
  paginate,
  formatDayKey,
  activityDayLabel,
  HISTORY_PAGE_SIZE,
} from '../src/screens/History/utils/historyHelpers.js';

const days = (count) => Array.from({ length: count }, (_, index) => ({ id: index }));

test('a page holds HISTORY_PAGE_SIZE rows, the last one the remainder', () => {
  assert.equal(HISTORY_PAGE_SIZE, 12);
  const first = paginate(days(23), 0, 10);
  assert.equal(first.items.length, 10);
  assert.equal(first.pageCount, 3);
  assert.equal(paginate(days(23), 0).items.length, 12);
  assert.equal(first.hasPrev, false);
  assert.equal(first.hasNext, true);

  const last = paginate(days(23), 2, 10);
  assert.deepEqual(last.items.map((row) => row.id), [20, 21, 22]);
  assert.equal(last.hasNext, false);
  assert.equal(last.hasPrev, true);
});

test('a page that no longer exists falls back to the last real one', () => {
  // The list can shrink under the user (a refresh), and an empty page with
  // no way forward would read as "no usage".
  const result = paginate(days(12), 5, 10);
  assert.equal(result.page, 1);
  assert.deepEqual(result.items.map((row) => row.id), [10, 11]);
  assert.equal(paginate(days(12), -3, 10).page, 0);
});

test('an empty list is one empty page with nowhere to go', () => {
  const result = paginate([], 0);
  assert.deepEqual(result.items, []);
  assert.equal(result.pageCount, 1);
  assert.equal(result.hasPrev, false);
  assert.equal(result.hasNext, false);
  assert.equal(paginate(undefined).items.length, 0);
});

test('a day key reads as weekday, month and day, whatever the time zone', () => {
  assert.equal(formatDayKey('2026-10-22'), 'Thu, Oct 22');
  assert.equal(formatDayKey('2026-08-01'), 'Sat, Aug 1');
  assert.equal(formatDayKey(''), '--');
  assert.equal(formatDayKey(undefined), '--');
});

test('activity is grouped under Today, Yesterday, then the date', () => {
  const now = new Date(2026, 9, 22, 17, 0).getTime();
  assert.equal(activityDayLabel(new Date(2026, 9, 22, 8, 30), now), 'Today');
  assert.equal(activityDayLabel(new Date(2026, 9, 21, 23, 59), now), 'Yesterday');
  assert.equal(activityDayLabel(new Date(2026, 9, 20, 12, 0), now), 'Tue, Oct 20');
  assert.equal(activityDayLabel(null, now), 'Unknown date');
});

test('a page holds as many rows as the space fits, within bounds', async () => {
  const { fitPageSize } = await import('../src/screens/History/utils/historyHelpers.js');
  // 600 px, 40 px chrome, 49 px rows -> 11 rows.
  assert.equal(fitPageSize(600, { rowHeight: 49, chrome: 40 }), 11);
  assert.equal(fitPageSize(100, { rowHeight: 49 }), 5, 'never fewer than the minimum');
  assert.equal(fitPageSize(5000, { rowHeight: 40 }), 25, 'never more than the maximum');
  assert.equal(fitPageSize(0, { rowHeight: 40 }), HISTORY_PAGE_SIZE, 'unmeasured falls back');
});
