// Shared timestamp helpers. Firestore hands back Timestamp objects, but cached
// or locally-created records can arrive as Date/number/string, so every consumer
// needs the same normalization before formatting.

export const toDate = (value) => {
  if (!value) return null;

  // Firestore Timestamp object
  if (typeof value?.toDate === 'function') {
    const converted = value.toDate();
    return converted instanceof Date && !Number.isNaN(converted.getTime()) ? converted : null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof value === 'string') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  // Plain object shape ({ seconds, nanoseconds }) from serialized snapshots.
  if (typeof value === 'object' && typeof value.seconds === 'number') {
    const millis = (value.seconds * 1000) + Math.floor((value.nanoseconds || 0) / 1000000);
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
};

export const getTimestampMs = (value) => {
  const parsedDate = toDate(value);
  return parsedDate ? parsedDate.getTime() : 0;
};

// Parses a `YYYY-MM-DD` document id/field into local-time date parts.
// Deliberately avoids `new Date('YYYY-MM-DD')`, which parses as UTC midnight and
// lands on the previous day for negative UTC offsets.
export const parseDateString = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim());
  if (!match) return null;

  const parsed = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const startOfDayMs = (value) => {
  const parsed = parseDateString(value) || toDate(value);
  if (!parsed) return null;

  const start = new Date(parsed);
  start.setHours(0, 0, 0, 0);
  return start.getTime();
};

export const endOfDayMs = (value) => {
  const parsed = parseDateString(value) || toDate(value);
  if (!parsed) return null;

  const end = new Date(parsed);
  end.setHours(23, 59, 59, 999);
  return end.getTime();
};

export const toDateString = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const formatRelativeTime = (value, fallback = 'Just now') => {
  const date = toDate(value);
  if (!date) return fallback;

  const diffMs = Date.now() - date.getTime();
  // Clock skew between device and server can put a fresh event slightly ahead.
  if (diffMs < 0) return fallback;

  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return fallback;
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  return date.toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};
