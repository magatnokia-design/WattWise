import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildUsageCsv,
  buildUsageCsvFilename,
  describeUsageCsv,
} from '../src/utils/usageCsv.js';

/*
 * `usageCsv.js` is a copy-rule file — byte-identical to the website's. These
 * tests exist in both repos so neither can drift the format without the other
 * noticing: two people comparing exports must not find different columns.
 */

const row = (overrides = {}) => ({
  date: '2026-08-16',
  outlet1Name: 'Nokia\'s Charger',
  outlet1Kwh: 0.291,
  outlet1Cost: 2.87,
  outlet2Name: 'Nokia\'s Fan',
  outlet2Kwh: 0.258,
  outlet2Cost: 2.55,
  totalKwh: 0.549,
  totalCost: 5.43,
  ...overrides,
});

const lines = (csv) => csv.replace(/^﻿/, '').trim().split('\r\n');

test('the header names the currency so the cells can stay numeric', () => {
  const header = lines(buildUsageCsv([row()]))[0];

  assert.ok(header.includes('Total Cost (PHP)'));
  assert.ok(!header.includes('₱'), 'the symbol belongs in the header text, not the data');
});

test('costs carry no currency symbol, so a spreadsheet can sum them', () => {
  const [, first] = lines(buildUsageCsv([row()]));

  assert.ok(first.endsWith('5.43'), 'plain number, not ₱5.43');
  assert.ok(!first.includes('₱'));
});

test('a comma in an appliance name does not shift the columns', () => {
  // The user names these, so "Charger, bedroom" is a thing they can type.
  const csv = buildUsageCsv([row({ outlet1Name: 'Charger, bedroom' })]);
  const [, first] = lines(csv);

  assert.ok(first.includes('"Charger, bedroom"'));
  // Header column count must still match the data row's.
  const headerCols = lines(csv)[0].split(',').length;
  const dataCols = first.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).length;
  assert.equal(dataCols, headerCols);
});

test('a quote in an appliance name is doubled rather than breaking the field', () => {
  const [, first] = lines(buildUsageCsv([row({ outlet2Name: 'The "big" fan' })]));

  assert.ok(first.includes('"The ""big"" fan"'));
});

test('rows are written oldest first whatever order they arrive in', () => {
  // The screen lists newest first; a spreadsheet wants a forward timeline.
  const csv = buildUsageCsv([
    row({ date: '2026-08-16' }),
    row({ date: '2026-08-14' }),
    row({ date: '2026-08-15' }),
  ]);

  const dates = lines(csv).slice(1).map((line) => line.split(',')[0]);
  assert.deepEqual(dates, ['2026-08-14', '2026-08-15', '2026-08-16']);
});

test('energy keeps three decimals', () => {
  // A two-outlet day routinely lands under 0.1 kWh, where two decimals loses a
  // significant figure - the same reason the notification detail uses 3 dp.
  const [, first] = lines(buildUsageCsv([row({ outlet1Kwh: 0.0884 })]));

  assert.ok(first.includes('0.088'));
});

test('the file opens as UTF-8 in Excel', () => {
  assert.ok(buildUsageCsv([row()]).startsWith('﻿'));
});

test('missing outlet names fall back to the slot label', () => {
  const [, first] = lines(buildUsageCsv([row({ outlet1Name: '', outlet2Name: null })]));

  assert.ok(first.includes('Outlet 1'));
  assert.ok(first.includes('Outlet 2'));
});

test('an empty export is a header and nothing else', () => {
  const csv = buildUsageCsv([]);

  assert.equal(lines(csv).length, 1);
  assert.equal(buildUsageCsvFilename([]), 'wattwise-usage.csv');
  assert.equal(describeUsageCsv([]), 'Nothing to export yet');
});

test('the filename carries the range it covers', () => {
  assert.equal(
    buildUsageCsvFilename([row({ date: '2026-08-14' }), row({ date: '2026-08-16' })]),
    'wattwise-usage-2026-08-14-to-2026-08-16.csv'
  );

  assert.equal(
    buildUsageCsvFilename([row({ date: '2026-08-16' })]),
    'wattwise-usage-2026-08-16.csv'
  );
});

test('rows without a date are dropped rather than exported blank', () => {
  const csv = buildUsageCsv([row(), { outlet1Kwh: 1 }, null]);

  assert.equal(lines(csv).length, 2, 'header plus the one real row');
  assert.equal(describeUsageCsv([row(), { outlet1Kwh: 1 }]), '1 day');
});
