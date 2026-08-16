import test from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx-js-style';

import {
  buildUsageWorkbook,
  writeUsageXlsx,
  buildUsageFilename,
} from '../src/utils/usageExport.js';
// Deliberately not in usageExport.js: the label is needed before any click, and
// keeping it out is what lets the 400 kB writer load only on demand.
import { describeUsageRows } from '../src/screens/History/utils/historyHelpers.js';

/*
 * `usageExport.js` is a copy-rule file — byte-identical to the website's. These
 * tests exist in both repos so neither can drift the format without the other
 * noticing: two people comparing exports must not find different columns.
 *
 * Several of these assert on a real write/read round trip rather than on the
 * in-memory sheet, because a style object can be set on a cell and then silently
 * dropped by the writer — which is exactly what happened to freeze panes.
 */

const row = (overrides = {}) => ({
  date: '2026-08-16',
  outlet1Name: 'Nokia\'s Charger',
  outlet1Kwh: 0.291,
  outlet1Cost: 2.87,
  outlet2Name: 'Nokia\'s Fan',
  outlet2Kwh: 0.265,
  outlet2Cost: 2.61,
  totalKwh: 0.556,
  totalCost: 5.48,
  ...overrides,
});

/** Writes and reads the workbook back, so assertions see what Excel would. */
const roundTrip = (rows) => {
  const buffer = writeUsageXlsx(rows, 'buffer');
  const back = XLSX.read(buffer, { cellStyles: true });
  return back.Sheets['Daily usage'];
};

/*
 * Reading a workbook back restores fills but not fonts, so a bold white header
 * would look absent even though it was written correctly. These assertions go to
 * the styles part of the xlsx package itself, which is what Excel reads.
 */
const stylesXml = (rows) => {
  const buffer = writeUsageXlsx(rows, 'buffer');
  const back = XLSX.read(buffer, { type: 'buffer', bookFiles: true });
  // TextDecoder rather than Buffer: this file is shared with the web repo, which
  // lints test/ against browser globals.
  return new TextDecoder('utf-8').decode(
    new Uint8Array(back.files['xl/styles.xml'].content)
  );
};

const section = (xml, tag) =>
  (xml.match(new RegExp(`<${tag}[\\s\\S]*?</${tag}>`)) || [''])[0];

const sheetOf = (rows) => buildUsageWorkbook(rows).Sheets['Daily usage'];

test('costs are numeric cells with a peso display format, so SUM still works', () => {
  // This is the whole reason for xlsx over CSV: currency that a spreadsheet can
  // still add up. A text cell reading "₱2.87" would sum to zero.
  const sheet = roundTrip([row()]);

  assert.equal(sheet.D2.t, 'n', 'cost must be a number, not text');
  assert.equal(sheet.D2.v, 2.87);
  assert.ok(sheet.D2.z.includes('₱'), 'the peso sign is a format, not the value');
  assert.equal(sheet.I2.t, 'n');
  assert.equal(sheet.I2.v, 5.48);
});

test('energy keeps three decimals', () => {
  // A two-outlet day routinely lands under 0.1 kWh, where two decimals loses a
  // significant figure — the same reason the notification detail uses 3 dp.
  const sheet = roundTrip([row({ outlet1Kwh: 0.0884 })]);

  assert.equal(sheet.C2.t, 'n');
  assert.equal(sheet.C2.z, '0.000');
  assert.equal(sheet.C2.v, 0.0884, 'the full value is stored; 3 dp is display only');
});

test('the header is theme green with bold white text, in the written file', () => {
  assert.equal(roundTrip([row()]).A1.s.fgColor.rgb, '10B981');

  const fonts = section(stylesXml([row()]), 'fonts');
  assert.ok(fonts.includes('<b/>'), 'header font must be bold');
  assert.ok(fonts.includes('<color rgb="FFFFFF"/>'), 'header text must be white');
});

test('the two total columns are marked out in yellow, header and body', () => {
  const sheet = roundTrip([row()]);

  // Darker green header, yellow body — the same yellow the export button wears.
  assert.equal(sheet.H1.s.fgColor.rgb, '059669');
  assert.equal(sheet.I1.s.fgColor.rgb, '059669');
  assert.equal(sheet.H2.s.fgColor.rgb, 'FEF3C7');
  assert.equal(sheet.I2.s.fgColor.rgb, 'FEF3C7');

  // A non-total column must stay unfilled, or the yellow means nothing.
  assert.notEqual(sheet.C2.s?.fgColor?.rgb, 'FEF3C7');
});

test('every fill in the file is green, white or yellow', () => {
  // Read from the styles part rather than the cells, so a stray colour cannot
  // hide in a style the reader declines to hand back.
  const fills = section(stylesXml([row(), row({ date: '2026-08-15' })]), 'fills');
  const allowed = new Set(['10B981', '059669', 'FEF3C7', 'FFFFFF']);

  const used = [...fills.matchAll(/<fgColor rgb="(?:FF)?([0-9A-F]{6})"/gi)]
    .map((match) => match[1].toUpperCase());

  assert.ok(used.length > 0, 'expected at least one fill');
  used.forEach((colour) => {
    assert.ok(allowed.has(colour), `off-palette fill ${colour}`);
  });
});

test('dates stay text so a locale cannot re-read the day as the month', () => {
  // 2026-08-09 as a real date cell can come back as 08/09/2026 and be read as
  // 8 September. The export should say exactly what the app says.
  const sheet = roundTrip([row({ date: '2026-08-09' })]);

  assert.equal(sheet.A2.t, 's');
  assert.equal(sheet.A2.v, '2026-08-09');
});

test('rows are written oldest first whatever order they arrive in', () => {
  const sheet = sheetOf([
    row({ date: '2026-08-16' }),
    row({ date: '2026-08-14' }),
    row({ date: '2026-08-15' }),
  ]);

  assert.deepEqual(
    [sheet.A2.v, sheet.A3.v, sheet.A4.v],
    ['2026-08-14', '2026-08-15', '2026-08-16']
  );
});

test('an appliance name with a comma or quote needs no escaping and survives whole', () => {
  // The user names these, so "Charger, bedroom" is a thing they can type. In CSV
  // this shifted every column after it; here it is just a string.
  const sheet = roundTrip([
    row({ outlet1Name: 'Charger, bedroom', outlet2Name: 'The "big" fan' }),
  ]);

  assert.equal(sheet.B2.v, 'Charger, bedroom');
  assert.equal(sheet.E2.v, 'The "big" fan');
});

test('missing outlet names fall back to the slot label', () => {
  const sheet = sheetOf([row({ outlet1Name: '', outlet2Name: null })]);

  assert.equal(sheet.B2.v, 'Outlet 1');
  assert.equal(sheet.E2.v, 'Outlet 2');
});

test('non-numeric energy or cost lands as zero rather than breaking the sheet', () => {
  const sheet = sheetOf([row({ outlet1Kwh: undefined, totalCost: 'n/a' })]);

  assert.equal(sheet.C2.v, 0);
  assert.equal(sheet.C2.t, 'n');
  assert.equal(sheet.I2.v, 0);
});

test('rows without a date are dropped rather than exported blank', () => {
  const sheet = sheetOf([row(), { outlet1Kwh: 1 }, null]);

  assert.equal(sheet['!ref'], 'A1:I2', 'header plus the one real row');
  assert.equal(describeUsageRows([row(), { outlet1Kwh: 1 }]), '1 day');
});

test('an empty export is a header and nothing else, and still opens', () => {
  const sheet = roundTrip([]);

  assert.equal(sheet.A1.v, 'Date');
  assert.equal(sheet.A2, undefined);
  assert.equal(buildUsageFilename([]), 'wattwise-usage.xlsx');
  assert.equal(describeUsageRows([]), 'Nothing to export yet');
});

test('columns are pre-sized so no header opens truncated', () => {
  // The CSV version opened as "Outlet 1 Co…" until you resized by hand; the
  // point of the workbook is that it arrives readable.
  const sheet = sheetOf([row()]);

  assert.equal(sheet['!cols'].length, 9);
  sheet['!cols'].forEach((col, index) => {
    assert.ok(col.wch >= 12, `column ${index} too narrow at ${col.wch}`);
  });
});

test('the header row carries sort and filter dropdowns', () => {
  const sheet = roundTrip([row(), row({ date: '2026-08-15' })]);

  assert.ok(sheet['!autofilter'], 'autofilter must survive the write');
  assert.ok(sheet['!autofilter'].ref.startsWith('A1:'));
});

test('there is no totals row, because summing the cost column is not the bill', () => {
  // Daily costs exclude the monthly metering charge and the tariff is not linear
  // in kWh, so a SUM at the bottom would read as authoritative and be wrong.
  const sheet = sheetOf([row(), row({ date: '2026-08-15' })]);

  assert.equal(sheet['!ref'], 'A1:I3', 'header plus exactly two data rows');
  assert.equal(sheet.A4, undefined);
});

test('the filename carries the range it covers', () => {
  assert.equal(
    buildUsageFilename([row({ date: '2026-08-14' }), row({ date: '2026-08-16' })]),
    'wattwise-usage-2026-08-14-to-2026-08-16.xlsx'
  );

  assert.equal(
    buildUsageFilename([row({ date: '2026-08-16' })]),
    'wattwise-usage-2026-08-16.xlsx'
  );
});

test('base64 and array encodings both produce a readable workbook', () => {
  // The phone writes base64 straight to expo-file-system; the browser wraps an
  // array in a Blob. Both callers must get something Excel can open.
  const base64 = writeUsageXlsx([row()], 'base64');
  const array = writeUsageXlsx([row()], 'array');

  assert.equal(typeof base64, 'string');
  assert.ok(base64.length > 0);
  assert.ok(array.byteLength > 0);

  assert.equal(XLSX.read(base64, { type: 'base64' }).SheetNames[0], 'Daily usage');
  assert.equal(XLSX.read(array, { type: 'array' }).SheetNames[0], 'Daily usage');
});
