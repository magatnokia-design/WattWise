// TODO: Expand when backend is ready

export const formatCountdown = (hours, minutes, seconds) => {
  const h = String(hours).padStart(2, '0');
  const m = String(minutes).padStart(2, '0');
  const s = String(seconds).padStart(2, '0');
  return `${h}:${m}:${s}`;
};

export const formatScheduledTime = (time) => {
  if (!time) return '--:--';
  return time;
};

export const formatDays = (days) => {
  if (!days || days.length === 0) return 'No days selected';
  if (days.length === 7) return 'Everyday';
  return days.join(', ');
};

export const formatOutletName = (outlet) => {
  if (!outlet) return 'No outlet selected';
  return `Outlet ${outlet}`;
};