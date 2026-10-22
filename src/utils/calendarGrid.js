/**
 * Date maths for the Dagitab calendar (Oct 2026). Pure, on `YYYY-MM-DD` keys
 * read from their own digits, so no device time zone can move a day.
 */

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Monday first, matching the timer days (Mo Tu We Th Fr Sa Su).
export const WEEKDAY_INITIALS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

const pad = (value) => String(value).padStart(2, '0');

export const toKey = (year, monthIndex, day) => `${year}-${pad(monthIndex + 1)}-${pad(day)}`;

export const parseKey = (key) => {
  const [year, month, day] = String(key || '').split('-').map(Number);
  if (!year || !month || !day) return null;
  return { year, monthIndex: month - 1, day };
};

const daysIn = (year, monthIndex) => new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();

/**
 * The month as 6 rows of 7, Monday first. Cells outside the month are null,
 * so every month occupies the same height and the sheet never jumps.
 */
export const buildMonthGrid = (year, monthIndex) => {
  // getUTCDay: Sunday 0 .. Saturday 6 -> Monday-first offset 0..6.
  const offset = (new Date(Date.UTC(year, monthIndex, 1)).getUTCDay() + 6) % 7;
  const total = daysIn(year, monthIndex);
  return Array.from({ length: 42 }, (_, index) => {
    const day = index - offset + 1;
    return day >= 1 && day <= total ? toKey(year, monthIndex, day) : null;
  });
};

/** The month after (+1) or before (-1) `{ year, monthIndex }`. */
export const shiftMonth = ({ year, monthIndex }, delta) => {
  const absolute = year * 12 + monthIndex + delta;
  return { year: Math.floor(absolute / 12), monthIndex: ((absolute % 12) + 12) % 12 };
};

/**
 * A tap in range mode. The first tap starts a new range; the second ends it,
 * swapping the two if the end was tapped before the start.
 *
 * @returns {{ startDate: string, endDate: string|null }}
 */
export const applyRangeTap = (selection, key) => {
  const { startDate, endDate } = selection || {};
  if (!startDate || endDate) return { startDate: key, endDate: null };
  return key < startDate
    ? { startDate: key, endDate: startDate }
    : { startDate, endDate: key };
};

export const isBetween = (key, startDate, endDate) =>
  Boolean(key && startDate && endDate && key > startDate && key < endDate);

/** "Oct 8, 2026", or "Oct 8" without the year. */
export const formatKeyShort = (key, withYear = true) => {
  const parts = parseKey(key);
  if (!parts) return '--';
  const month = MONTH_NAMES[parts.monthIndex].slice(0, 3);
  return withYear ? `${month} ${parts.day}, ${parts.year}` : `${month} ${parts.day}`;
};
