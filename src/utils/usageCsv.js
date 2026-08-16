/**
 * Daily usage as CSV.
 *
 * Deliberately duplicated in the web repo - keep both in sync, the same way
 * billing.js and notificationHelpers.js are. A CSV that differs between the
 * phone and the website is worse than having it on only one, because two people
 * comparing exports would find columns that do not line up.
 *
 * WHY THE NUMBERS CARRY NO PESO SIGN
 *
 * The point of this file is that someone can open it beside their PELCO III
 * bill and add the column up. A cell reading "₱2.87" is text to a spreadsheet -
 * it will not sum, average, or chart. The currency belongs in the header, where
 * it is read once by a human, and the cells stay numeric.
 *
 * The rows this takes are the mapped ones from useHistory (outlet1Kwh,
 * totalCost), not the raw history_daily documents, because that mapping already
 * exists identically on both clients.
 */

// Excel on Windows assumes the system codepage unless a file opens with a byte
// order mark, which turns any appliance name outside ASCII into mojibake. Three
// bytes to stop "Nokia's Charger" arriving as "Nokiaâ€™s Charger".
const UTF8_BOM = '﻿';

const COLUMNS = [
  'Date',
  'Outlet 1',
  'Outlet 1 (kWh)',
  'Outlet 1 Cost (PHP)',
  'Outlet 2',
  'Outlet 2 (kWh)',
  'Outlet 2 Cost (PHP)',
  'Total (kWh)',
  'Total Cost (PHP)',
];

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Energy to 3 dp: a two-outlet day routinely lands under 0.1 kWh. */
const kwh = (value) => toNumber(value).toFixed(3);

const pesos = (value) => toNumber(value).toFixed(2);

/**
 * RFC 4180 quoting. An appliance is named by the user, so a comma in
 * "Charger, bedroom" would otherwise shift every column after it.
 */
const cell = (value) => {
  const text = String(value ?? '');
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
};

/**
 * Builds the CSV text for a set of mapped daily usage rows.
 *
 * Rows are written oldest first regardless of the order they arrive in. The
 * screen lists newest first because that is what you want to look at; a
 * spreadsheet wants a timeline that runs forwards.
 */
export const buildUsageCsv = (rows = []) => {
  const ordered = [...(Array.isArray(rows) ? rows : [])]
    .filter((row) => row && row.date)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  const lines = [COLUMNS.join(',')];

  ordered.forEach((row) => {
    lines.push([
      cell(row.date),
      cell(row.outlet1Name || 'Outlet 1'),
      kwh(row.outlet1Kwh),
      pesos(row.outlet1Cost),
      cell(row.outlet2Name || 'Outlet 2'),
      kwh(row.outlet2Kwh),
      pesos(row.outlet2Cost),
      kwh(row.totalKwh),
      pesos(row.totalCost),
    ].join(','));
  });

  // Trailing newline: without it some tools treat the last row as truncated.
  return `${UTF8_BOM}${lines.join('\r\n')}\r\n`;
};

/**
 * `wattwise-usage-2026-08-01-to-2026-08-16.csv`
 *
 * The range is in the name because these get downloaded repeatedly and end up
 * in the same folder. "wattwise-usage.csv (3)" tells you nothing about which
 * one covers which weeks.
 */
export const buildUsageCsvFilename = (rows = []) => {
  const dates = (Array.isArray(rows) ? rows : [])
    .map((row) => String(row?.date || ''))
    .filter(Boolean)
    .sort();

  if (dates.length === 0) return 'wattwise-usage.csv';

  const first = dates[0];
  const last = dates[dates.length - 1];

  return first === last
    ? `wattwise-usage-${first}.csv`
    : `wattwise-usage-${first}-to-${last}.csv`;
};

/** Row count and span, for the button's own label. */
export const describeUsageCsv = (rows = []) => {
  const count = (Array.isArray(rows) ? rows : []).filter((row) => row?.date).length;

  if (count === 0) return 'Nothing to export yet';
  return count === 1 ? '1 day' : `${count} days`;
};

export default buildUsageCsv;
