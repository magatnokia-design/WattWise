// TODO: Expand when backend is ready

export const formatRate = (rate) => {
  if (!rate) return '₱0.00/kWh';
  return `₱${parseFloat(rate).toFixed(2)}/kWh`;
};

export const formatVersion = () => {
  return 'v1.0.0';
};

export const formatCurrency = (value, currency = '₱') => {
  const numericValue = Number(value || 0);
  return `${currency}${numericValue.toFixed(2)}`;
};

export const validateRate = (rate) => {
  const parsed = parseFloat(rate);
  if (isNaN(parsed)) return false;
  if (parsed <= 0) return false;
  if (parsed > 999) return false;
  return true;
};

const formatRelativeAge = (timestampMs) => {
  const ts = Number(timestampMs || 0);
  if (!ts) return 'never';

  const diffMs = Math.max(0, Date.now() - ts);
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 5) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;

  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
};

export const formatDeviceHealthValue = (status, lastSeenAtMs) => {
  const normalized = String(status || '').trim().toLowerCase();

  if (normalized === 'not_linked') return 'Not linked';
  if (normalized === 'unregistered') return 'Unregistered';
  if (normalized === 'online') return `Online (${formatRelativeAge(lastSeenAtMs)})`;
  if (normalized === 'delayed') return `Delayed (${formatRelativeAge(lastSeenAtMs)})`;
  if (normalized === 'degraded') return `Degraded (${formatRelativeAge(lastSeenAtMs)})`;

  return `Offline (${formatRelativeAge(lastSeenAtMs)})`;
};

export const formatAckStatusValue = (ackStatus) => {
  const normalized = String(ackStatus || '').trim().toLowerCase();
  if (!normalized) return '--';
  if (normalized === 'executed') return 'Executed';
  if (normalized === 'delivered') return 'Delivered';
  if (normalized === 'failed') return 'Failed';
  if (normalized === 'rejected') return 'Rejected';
  if (normalized === 'timeout') return 'Timeout';
  return normalized;
};