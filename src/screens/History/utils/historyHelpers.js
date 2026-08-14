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
