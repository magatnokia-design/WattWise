const toDate = (value) => {
  if (!value) return null;

  if (typeof value?.toDate === 'function') {
    return value.toDate();
  }

  if (value instanceof Date) {
    return value;
  }

  if (typeof value === 'object' && typeof value.seconds === 'number') {
    return new Date((value.seconds * 1000) + Math.floor((value.nanoseconds || 0) / 1000000));
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const formatNotificationTime = (timestamp) => {
  const date = toDate(timestamp);
  if (!date) return '--:--';

  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const formatNotificationDate = (timestamp) => {
  const date = toDate(timestamp);
  if (!date) return '-- --- ----';

  return date.toLocaleDateString([], {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  });
};

export const getNotificationIcon = (type) => {
  switch (type) {
    case 'high_usage': return '⚡';
    case 'warning': return '⚠️';
    case 'cutoff': return '🔴';
    case 'budget': return '💰';
    case 'schedule': return '⏱️';
    case 'device': return '🔌';
    default: return '🔔';
  }
};

export const getNotificationColor = (type) => {
  switch (type) {
    case 'high_usage': return '#F59E0B';
    case 'warning': return '#F97316';
    case 'cutoff': return '#EF4444';
    case 'budget': return '#8B5CF6';
    case 'schedule': return '#10B981';
    case 'device': return '#3B82F6';
    default: return '#6B7280';
  }
};