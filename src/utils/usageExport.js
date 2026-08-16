/**
 * Daily usage as a styled Excel workbook.
 *
 * Deliberately duplicated in the web repo - keep both in sync, the same way
 * billing.js and notificationHelpers.js are. An export that differs between the
 * phone and the website is worse than having it on only one, because two people
 * comparing files would find columns that do not line up.
 *
 * WHY XLSX AND NOT CSV
 *
 * CSV is plain text and cannot carry a single colour, width, or number format -
 * what you see when a CSV opens is the spreadsheet's own default look, not
 * anything the file asked for. This writes a real workbook, so the theme travels
 * with the data.
 *
 * WHY THE COSTS ARE STILL NUMBERS
 *
 * The point of this file is that someone can open it beside their PELCO III bill
 * and add a column up. A cell holding the text "P2.87" will not sum, average, or
 * chart. So the peso sign here is a *display format* on a numeric cell (`z`), not
 * part of the value: it reads as currency to a human and as 2.87 to SUM().
 * This is the one thing a CSV genuinely could not do.
 *
 * NO TOTALS ROW, ON PURPOSE
 *
 * Adding up the cost column does not give a month's bill, for two reasons: each
 * day's stored cost excludes the once-a-month metering charge, and the PELCO III
 * tariff is not linear in kWh, so the sum of daily prices is not the price of the
 * summed energy. HistoryScreen already prices the range as a whole for exactly
 * this reason. A SUM sitting at the bottom of a spreadsheet reads as authoritative,
 * and this one would be quietly wrong, so it is left out.
 *
 * LOADED ON DEMAND
 *
 * The spreadsheet writer is ~400 kB, so both clients pull this module inside the
 * export handler rather than at import time - on the website that keeps it out of
 * the main bundle entirely. The day-count label the button shows before any click
 * therefore lives in historyHelpers.js, not here.
 *
 * The rows this takes are the mapped ones from useHistory (outlet1Kwh, totalCost),
 * not the raw history_daily documents, because that mapping already exists
 * identically on both clients.
 */
import XLSX from 'xlsx-js-style';

// The app palette, as ARGB-less hex - green/white/yellow only.
// Mirrors src/constants/colors.js; xlsx wants no leading '#'.
const GREEN = '10B981';
const GREEN_DARK = '059669';
const YELLOW = 'FEF3C7';
const WHITE = 'FFFFFF';
const TEXT = '111827';
const BORDER = 'E5E7EB';

const KWH_FORMAT = '0.000';
const PESO_FORMAT = '"₱"#,##0.00';

/**
 * Column plan. `total` marks the two columns that get the yellow tint - the
 * same yellow the export button wears, so the file and the control that
 * produced it read as the same feature.
 */
const COLUMNS = [
  { header: 'Date', width: 12, key: 'date', type: 'text' },
  { header: 'Outlet 1', width: 20, key: 'outlet1Name', type: 'text' },
  { header: 'Outlet 1 (kWh)', width: 14, key: 'outlet1Kwh', type: 'kwh' },
  { header: 'Outlet 1 Cost', width: 14, key: 'outlet1Cost', type: 'peso' },
  { header: 'Outlet 2', width: 20, key: 'outlet2Name', type: 'text' },
  { header: 'Outlet 2 (kWh)', width: 14, key: 'outlet2Kwh', type: 'kwh' },
  { header: 'Outlet 2 Cost', width: 14, key: 'outlet2Cost', type: 'peso' },
  { header: 'Total (kWh)', width: 13, key: 'totalKwh', type: 'kwh', total: true },
  { header: 'Total Cost', width: 13, key: 'totalCost', type: 'peso', total: true },
];

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const thinBorder = {
  bottom: { style: 'thin', color: { rgb: BORDER } },
};

const headerStyle = (column) => ({
  fill: { fgColor: { rgb: column.total ? GREEN_DARK : GREEN } },
  font: { color: { rgb: WHITE }, bold: true, sz: 11 },
  alignment: {
    horizontal: column.type === 'text' ? 'left' : 'right',
    vertical: 'center',
    wrapText: false,
  },
});

const bodyStyle = (column) => ({
  ...(column.total ? { fill: { fgColor: { rgb: YELLOW } } } : {}),
  font: { color: { rgb: TEXT }, sz: 11, bold: Boolean(column.total) },
  alignment: { horizontal: column.type === 'text' ? 'left' : 'right' },
  border: thinBorder,
});

/**
 * Oldest first, whatever order they arrive in, and rows without a date dropped.
 * The screen lists newest first because that is what you want to look at; a
 * spreadsheet wants a timeline that runs forwards.
 */
const orderRows = (rows) =>
  [...(Array.isArray(rows) ? rows : [])]
    .filter((row) => row && row.date)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

/**
 * Dates stay text rather than becoming Excel date serials. ISO strings sort
 * chronologically as text anyway, and a real date cell would be re-rendered in
 * whatever the reader's locale is - so 2026-08-09 could come back as 08/09/2026
 * and be read as 8 September. The export should say what the app says.
 */
const buildCell = (column, row) => {
  if (column.type === 'text') {
    const fallback = column.key === 'outlet1Name' ? 'Outlet 1' : 'Outlet 2';
    const value = column.key === 'date'
      ? String(row.date)
      : String(row[column.key] || fallback);
    return { v: value, t: 's', s: bodyStyle(column) };
  }

  return {
    v: toNumber(row[column.key]),
    t: 'n',
    z: column.type === 'kwh' ? KWH_FORMAT : PESO_FORMAT,
    s: bodyStyle(column),
  };
};

/** Builds the workbook for a set of mapped daily usage rows. */
export const buildUsageWorkbook = (rows = []) => {
  const ordered = orderRows(rows);

  const sheet = {};
  const lastCol = COLUMNS.length - 1;
  const lastRow = ordered.length; // header occupies row 0

  COLUMNS.forEach((column, index) => {
    sheet[XLSX.utils.encode_cell({ c: index, r: 0 })] = {
      v: column.header,
      t: 's',
      s: headerStyle(column),
    };
  });

  ordered.forEach((row, rowIndex) => {
    COLUMNS.forEach((column, colIndex) => {
      sheet[XLSX.utils.encode_cell({ c: colIndex, r: rowIndex + 1 })] =
        buildCell(column, row);
    });
  });

  sheet['!ref'] = XLSX.utils.encode_range({
    s: { c: 0, r: 0 },
    e: { c: lastCol, r: lastRow },
  });
  sheet['!cols'] = COLUMNS.map((column) => ({ wch: column.width }));
  sheet['!rows'] = [{ hpt: 22 }];
  // Sort/filter dropdowns on the header. Freeze panes were tried here too, but
  // this writer drops '!freeze' silently, so it is not pretended at.
  sheet['!autofilter'] = { ref: `A1:${XLSX.utils.encode_col(lastCol)}1` };

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Daily usage');

  return workbook;
};

/**
 * Serialises the workbook. `type` is the caller's platform concern: the phone
 * wants 'base64' to hand straight to expo-file-system, the browser wants
 * 'array' to wrap in a Blob.
 */
export const writeUsageXlsx = (rows = [], type = 'base64') =>
  XLSX.write(buildUsageWorkbook(rows), { bookType: 'xlsx', type });

/**
 * `wattwise-usage-2026-08-01-to-2026-08-16.xlsx`
 *
 * The range is in the name because these get exported repeatedly and end up in
 * the same folder. "wattwise-usage (3).xlsx" tells you nothing about which one
 * covers which weeks.
 */
export const buildUsageFilename = (rows = []) => {
  const dates = (Array.isArray(rows) ? rows : [])
    .map((row) => String(row?.date || ''))
    .filter(Boolean)
    .sort();

  if (dates.length === 0) return 'wattwise-usage.xlsx';

  const first = dates[0];
  const last = dates[dates.length - 1];

  return first === last
    ? `wattwise-usage-${first}.xlsx`
    : `wattwise-usage-${first}-to-${last}.xlsx`;
};

/** The MIME type both clients hand to the OS. */
export const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export default buildUsageWorkbook;
