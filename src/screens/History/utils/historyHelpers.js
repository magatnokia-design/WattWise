import {
  toDate,
  getTimestampMs,
  parseDateString,
  startOfDayMs,
  endOfDayMs,
  toDateString,
} from '../../../utils/datetime';

export { getTimestampMs };

export const formatDate = (date) => {
  const parsedDate = toDate(date);
  if (!parsedDate) return '-- --- ----';

  return parsedDate.toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

export const formatTime = (date) => {
  const parsedDate = toDate(date);
  if (!parsedDate) return '--:--';

  return parsedDate.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const formatKwh = (value) => {
  if (!value) return '0.00 kWh';
  return `${value.toFixed(2)} kWh`;
};

export const formatCost = (value) => {
  if (!value) return '₱0.00';
  return `₱${value.toFixed(2)}`;
};

// Splits a `history_daily` document id (`YYYY-MM-DD`) into the day/month labels
// the usage list renders.
export const splitDailyDate = (dateString) => {
  const parsed = parseDateString(dateString);
  if (!parsed) return { day: '--', month: '---' };

  return {
    day: String(parsed.getDate()),
    month: parsed.toLocaleDateString(undefined, { month: 'short' }),
  };
};

// Every history_logs document carries a `source` written by the backend
// (processOutletToggle, checkScheduledTimers, handleSafetyAlerts). It is the
// most useful column on the row: it says whether the user pressed the button,
// a timer fired, or the safety cutoff tripped.
const SOURCE_LABELS = {
  manual: { label: 'Manual', tone: 'neutral' },
  schedule: { label: 'Schedule', tone: 'info' },
  auto_cutoff: { label: 'Auto-cutoff', tone: 'danger' },
  timer: { label: 'Timer', tone: 'info' },
  // A relay moved without WattWise ordering it - a power-cycle is the ordinary
  // cause, since the ESP32 boots with both relays open. Named for what is known
  // rather than for the presumed cause.
  device: { label: 'Device', tone: 'info' },
};

export const describeLogSource = (source) => {
  const normalized = String(source || '').trim().toLowerCase();
  return SOURCE_LABELS[normalized] || { label: 'System', tone: 'neutral' };
};

export const formatWatts = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return '';
  return `${parsed.toFixed(1)} W`;
};

/**
 * The wattage a switch event is allowed to claim.
 *
 * Only a switch-off has one: it is the draw measured just before the relay
 * opened. A switch-on has nothing to measure - the outlet was off, and the new
 * load's reading only develops over the seconds after the row is written.
 *
 * The backend now writes 0 for every 'on' (see functions/src/lib/historyLog.js),
 * but rows created before that are still in Firestore and are not rewritten -
 * history should record what the system believed at the time. Those rows can
 * carry a genuinely misleading figure: `power` held the last telemetry, and
 * after a switch-off the device has not posted a zero yet, so it was still the
 * reading from *before* that switch-off. A lamp turned off at 15.2 W and back on
 * seconds later logged 14.9 W against the switch-on - a measurement of an outlet
 * that was drawing nothing.
 *
 * Whether that stale value landed depended on if telemetry arrived between the
 * two toggles, which is a race. That is why the column looked arbitrary: some ON
 * rows had a figure, some did not, and nothing about the outlet decided which.
 *
 * Applying the rule at render time as well as at write time makes the column
 * consistent immediately, rather than after the log rolls over.
 */
export const powerAtSwitch = (log = {}) => {
  const isOn = String(log?.status || '').trim().toUpperCase() === 'ON';
  if (isOn) return 0;

  const parsed = Number(log?.power);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

export const DATE_RANGE_PRESETS = [
  { id: 'all', label: 'All time', shortLabel: 'Date' },
  { id: '7d', label: 'Last 7 days', shortLabel: '7 days' },
  { id: '30d', label: 'Last 30 days', shortLabel: '30 days' },
  { id: 'month', label: 'This month', shortLabel: 'This month' },
];

// Resolves a preset id into inclusive `YYYY-MM-DD` bounds. `all` returns nulls
// so callers fall back to their unfiltered query.
export const resolveDateRange = (rangeId) => {
  const today = new Date();
  const endDate = toDateString(today);

  if (rangeId === '7d' || rangeId === '30d') {
    const days = rangeId === '7d' ? 7 : 30;
    const start = new Date(today);
    // Inclusive of today, so a 7-day range spans today plus the previous 6.
    start.setDate(start.getDate() - (days - 1));
    return { startDate: toDateString(start), endDate };
  }

  if (rangeId === 'month') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    return { startDate: toDateString(start), endDate };
  }

  return { startDate: null, endDate: null };
};

// Client-side range filter for records already in memory (activity logs).
// Daily usage is filtered server-side by `historyService.getDailyUsage` instead.
export const filterByDateRange = (data = [], startDate, endDate) => {
  if (!startDate && !endDate) return data;

  const startMs = startDate ? startOfDayMs(startDate) : null;
  const endMs = endDate ? endOfDayMs(endDate) : null;
  if (startMs === null && endMs === null) return data;

  return data.filter((item) => {
    const itemMs = getTimestampMs(item?.timestamp);
    if (!itemMs) return false;
    if (startMs !== null && itemMs < startMs) return false;
    if (endMs !== null && itemMs > endMs) return false;
    return true;
  });
};

/**
 * How many days an export would cover, for the export control's own label.
 *
 * Lives here rather than beside the workbook builder on purpose: this is the one
 * thing the export UI needs *before* anyone clicks, and `usageExport.js` carries
 * a 400 kB spreadsheet library that the website loads on demand. Keeping the
 * label out of that module is what lets the heavy part stay behind the click.
 */
export const describeUsageRows = (rows = []) => {
  const count = (Array.isArray(rows) ? rows : []).filter((row) => row?.date).length;

  if (count === 0) return 'Nothing to export yet';
  return count === 1 ? '1 day' : `${count} days`;
};
