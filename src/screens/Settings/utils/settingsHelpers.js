// TODO: Expand when backend is ready

export const formatRate = (rate) => {
  if (!rate) return '₱0.00/kWh';
  return `₱${parseFloat(rate).toFixed(2)}/kWh`;
};

export const formatVersion = () => {
  return 'v1.0.0';
};

export const validateRate = (rate) => {
  const parsed = parseFloat(rate);
  if (isNaN(parsed)) return false;
  if (parsed <= 0) return false;
  if (parsed > 999) return false;
  return true;
};