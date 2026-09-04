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

/**
 * Seconds left on a countdown, or null when it is not counting.
 *
 * The single source of truth for "how long until this runs". Both the card and
 * the NEXT UP banner read it, because they used to compute it separately and
 * drifted apart: the banner read `countdownDuration`, which only one of the two
 * creation paths in scheduleService writes, so on a timer created the other way
 * it fell through to `countdownRemaining` - a server field refreshed once a
 * minute. The card ticked down smoothly while the banner above it sat up to a
 * minute behind and jumped. One timer, two answers, on the same screen.
 *
 * `countdownTime` is the fallback because it is the field every path writes.
 *
 * @returns {number|null} seconds, or null when the timer is not running.
 */
export const countdownSecondsRemaining = (item, nowMs = Date.now()) => {
  const baseDuration = Number(item?.countdownDuration ?? parseClockToSeconds(item?.countdownTime));
  const startedAt = toDate(item?.countdownStartedAt);
  const stored0 = Number(item?.countdownRemaining);

  /*
   * A paused timer is not counting. Elapsed time since countdownStartedAt is
   * only meaningful while the thing is running, and without this guard a timer
   * the user had switched off - or one that had already finished - carried on
   * counting down on screen beside the words "Finished - ran once".
   *
   * The guard existed in getLiveCountdownDisplay before this function was
   * factored out of it, and was dropped in the move. Restored, and now tested.
   */
  if (item && item.active === false) {
    if (Number.isFinite(stored0)) return Math.max(0, stored0);
    return Number.isFinite(baseDuration) && baseDuration > 0 ? baseDuration : null;
  }

  if (startedAt && Number.isFinite(baseDuration) && baseDuration > 0) {
    return Math.max(0, baseDuration - Math.floor((nowMs - startedAt.getTime()) / 1000));
  }

  const stored = Number(item?.countdownRemaining);
  if (Number.isFinite(stored)) return Math.max(0, stored);

  // A timer carrying no duration and no remaining value is unknown, not zero.
  // parseClockToSeconds answers 0 for a missing clock string, so without this
  // an empty object came back as "no time left" - and describeTimerState then
  // announced "Switching now" about a timer it knew nothing about. Absent is
  // not zero, here as everywhere else in this project.
  if (!Number.isFinite(baseDuration) || baseDuration <= 0) return null;

  return Math.max(0, baseDuration);
};

export const getLiveCountdownDisplay = (item, nowMs = Date.now()) => {
  const seconds = countdownSecondsRemaining(item, nowMs);
  return formatDuration(seconds === null ? 0 : seconds);
};

/**
 * What a timer is actually doing, in the words to put on the card.
 *
 * A countdown does not simply stop at zero. It reaches zero on the phone,
 * and then waits for `checkScheduledTimers` - which runs once a minute - to
 * notice and switch the outlet. For up to sixty seconds the card therefore
 * showed **00:00:00** beside the word **Active**, which reads as a timer that
 * has failed rather than one that is a few seconds from firing.
 *
 * Afterwards the backend sets `active: false`, and the same card showed a spent
 * countdown with a toggle offering to switch it back on - which would re-run it
 * immediately, because zero seconds remain. Neither state said what it was.
 *
 * @returns {{label: string, tone: 'running'|'waiting'|'done'|'paused', canRun: boolean}}
 */
export const describeTimerState = (item, nowMs = Date.now()) => {
  if (item?.type !== 'countdown') {
    return item?.active
      ? { label: 'Active', tone: 'running', canRun: true }
      : { label: 'Paused', tone: 'paused', canRun: false };
  }

  const remaining = countdownSecondsRemaining(item, nowMs);

  if (!item?.active) {
    return { label: 'Finished · ran once', tone: 'done', canRun: false };
  }

  if (remaining !== null && remaining <= 0) {
    return { label: 'Switching now…', tone: 'waiting', canRun: true };
  }

  return { label: 'Counting down', tone: 'running', canRun: true };
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