/**
 * Wall-clock helpers for Asia/Manila.
 *
 * Cloud Functions run with TZ unset, which means the runtime clock is UTC.
 * `new Date().getHours()` therefore returns UTC hours, NOT Manila hours - and
 * the `timeZone` option on onSchedule only controls when the cron fires, not
 * what the handler reads off the Date object. Every wall-clock comparison in a
 * scheduled function must go through these helpers.
 *
 * Philippine Standard Time is UTC+8 year-round (no DST since 1978), so a fixed
 * offset is exact here and avoids per-call Intl formatting.
 */

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

const toDate = (value) => (value instanceof Date ? value : new Date(value));

// Shifts an instant so the UTC getters read Manila wall-clock values.
const shiftToManila = (value) => new Date(toDate(value).getTime() + MANILA_OFFSET_MS);

const pad = (value) => String(value).padStart(2, '0');

/** Manila wall-clock time as `HH:MM`, matching the schedule's stored format. */
const getManilaTimeString = (value = new Date()) => {
  const shifted = shiftToManila(value);
  return `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`;
};

/** Manila day of week, 0 = Sunday through 6 = Saturday. */
const getManilaWeekday = (value = new Date()) => shiftToManila(value).getUTCDay();

/** Manila hour of day, 0-23. */
const getManilaHour = (value = new Date()) => shiftToManila(value).getUTCHours();

/** Manila calendar date as `YYYY-MM-DD`. */
const getManilaDateKey = (value = new Date()) => {
  const shifted = shiftToManila(value);
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
};

/**
 * The UTC instants bounding a Manila calendar day.
 * `getManilaDayBounds('2026-08-09')` covers 2026-08-08T16:00Z - 2026-08-09T15:59:59.999Z.
 */
const getManilaDayBounds = (dateKey) => {
  const [year, month, day] = String(dateKey || '')
    .split('-')
    .map((part) => Number(part));

  if (!year || !month || !day) return null;

  const startMs = Date.UTC(year, month - 1, day, 0, 0, 0, 0) - MANILA_OFFSET_MS;
  const endMs = startMs + (24 * 60 * 60 * 1000) - 1;

  return { start: new Date(startMs), end: new Date(endMs) };
};

/** Manila date key for the day before the given instant's Manila date. */
const getManilaPreviousDateKey = (value = new Date()) => {
  const shifted = shiftToManila(value);
  shifted.setUTCDate(shifted.getUTCDate() - 1);
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
};

/** Number of days in the Manila calendar month containing `dateKey`. */
const getDaysInManilaMonth = (dateKey) => {
  const [year, month] = String(dateKey || '')
    .split('-')
    .map((part) => Number(part));

  if (!year || !month) return 30;
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
};

module.exports = {
  MANILA_OFFSET_MS,
  getManilaTimeString,
  getManilaWeekday,
  getManilaHour,
  getManilaDateKey,
  getManilaDayBounds,
  getManilaPreviousDateKey,
  getDaysInManilaMonth,
};
