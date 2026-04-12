const DAY_LABEL_TO_INDEX = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const toDate = (value) => {
  if (!value) return null;

  if (typeof value?.toDate === 'function') {
    return value.toDate();
  }

  if (value instanceof Date) {
    return value;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const parseClockToSeconds = (clockValue) => {
  if (!clockValue || typeof clockValue !== 'string') return 0;
  const [hours, minutes, seconds] = clockValue.split(':').map((part) => parseInt(part, 10) || 0);
  return (hours * 3600) + (minutes * 60) + seconds;
};

const normalizeScheduleDays = (days = []) => {
  if (!Array.isArray(days)) return [];

  return days
    .map((day) => {
      if (typeof day === 'number' && day >= 0 && day <= 6) return day;
      if (typeof day === 'string') {
        const shortDay = day.slice(0, 3);
        const normalized = shortDay.charAt(0).toUpperCase() + shortDay.slice(1).toLowerCase();
        return Object.prototype.hasOwnProperty.call(DAY_LABEL_TO_INDEX, normalized)
          ? DAY_LABEL_TO_INDEX[normalized]
          : null;
      }
      return null;
    })
    .filter((day) => Number.isInteger(day));
};

export const formatDuration = (totalSeconds) => {
  const safeSeconds = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(totalSeconds)) : 0;
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

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

export const getLiveCountdownDisplay = (item, nowMs = Date.now()) => {
  const baseDuration = Number(item?.countdownDuration ?? parseClockToSeconds(item?.countdownTime));
  const currentRemaining = Number(item?.countdownRemaining);
  const startedAt = toDate(item?.countdownStartedAt);

  if (!item?.active) {
    if (Number.isFinite(currentRemaining)) return formatDuration(currentRemaining);
    return formatDuration(baseDuration);
  }

  if (startedAt && Number.isFinite(baseDuration) && baseDuration > 0) {
    const elapsedSeconds = Math.floor((nowMs - startedAt.getTime()) / 1000);
    const remaining = Math.max(0, baseDuration - elapsedSeconds);
    return formatDuration(remaining);
  }

  if (Number.isFinite(currentRemaining)) {
    return formatDuration(currentRemaining);
  }

  return formatDuration(baseDuration);
};

export const getNextScheduledRunSeconds = (scheduledTime, days, nowMs = Date.now()) => {
  if (!scheduledTime || typeof scheduledTime !== 'string') return null;

  const normalizedDays = normalizeScheduleDays(days);
  if (normalizedDays.length === 0) return null;

  const [hours, minutes] = scheduledTime.split(':').map((part) => parseInt(part, 10));
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;

  const now = new Date(nowMs);

  for (let dayOffset = 0; dayOffset <= 7; dayOffset += 1) {
    const candidate = new Date(now);
    candidate.setSeconds(0, 0);
    candidate.setDate(now.getDate() + dayOffset);
    candidate.setHours(hours, minutes, 0, 0);

    if (!normalizedDays.includes(candidate.getDay())) {
      continue;
    }

    if (candidate.getTime() <= nowMs) {
      continue;
    }

    return Math.floor((candidate.getTime() - nowMs) / 1000);
  }

  return null;
};