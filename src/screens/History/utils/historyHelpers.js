// TODO: Expand when backend is ready

const toDate = (value) => {
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

  if (typeof value === 'object' && typeof value.seconds === 'number') {
    const millis = (value.seconds * 1000) + Math.floor((value.nanoseconds || 0) / 1000000);
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
};

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

export const getTimestampMs = (value) => {
  const parsedDate = toDate(value);
  return parsedDate ? parsedDate.getTime() : 0;
};

export const formatKwh = (value) => {
  if (!value) return '0.00 kWh';
  return `${value.toFixed(2)} kWh`;
};

export const formatCost = (value) => {
  if (!value) return '₱0.00';
  return `₱${value.toFixed(2)}`;
};

export const filterByDateRange = (data, startDate, endDate) => {
  // TODO: Implement date range filter when backend is ready
  return data;
};