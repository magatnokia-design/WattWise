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
 * Has this countdown actually run, as opposed to being switched off by hand?
 *
 * `active: false` means both things, which is why a paused timer was labelled
 * "Finished - ran once". The two are already distinguishable in the data and
 * nothing had read it: `lastTriggered` is written only by checkScheduledTimers
 * when it fires a countdown, and every client creation path seeds it `null` and
 * never writes it again.
 *
 * Compared against `countdownStartedAt` rather than null-checked, because a
 * timer that ran, was re-armed and then paused still carries the old
 * `lastTriggered` - and that one is paused, not finished.
 */
const hasAlreadyFired = (item) => {
  const firedAt = toDate(item?.lastTriggered);
  if (!firedAt) return false;

  const startedAt = toDate(item?.countdownStartedAt);
  if (!startedAt) return true;

  return firedAt.getTime() >= startedAt.getTime();
};

/**
 * The fields to write when the user works the toggle on a timer.
 *
 * Pausing used to write `{ active: false }` and nothing else, which stopped the
 * display and not the clock. `countdownStartedAt` still pointed at the original
 * start, so every second spent paused was counted as elapsed: a 30 s timer
 * paused with 10 s left and resumed a moment later came back at 2 s, and the
 * backend - which computes remaining from the same field - switched the outlet
 * on the next tick and sent a notification saying the countdown had finished.
 * It had not. The user had un-paused it.
 *
 * So the pause records what was actually left at the instant of the tap, and
 * the resume restarts the clock from that figure. Writing `countdownDuration`
 * on resume is what makes this work on the backend with no change there:
 * checkScheduledTimers already computes `countdownDuration - (now -
 * countdownStartedAt)`, and both of its inputs are now correct.
 *
 * `countdownTime` is deliberately left alone - it holds the original duration
 * the user asked for, which is still the truthful answer to "what is this
 * timer", and it is the fallback every creation path writes.
 *
 * Scheduled timers have no clock to preserve, so they keep writing `active`
 * alone.
 *
 * @returns {object} the Firestore field set for this toggle.
 */
export const toggleTimerFields = (item, active, nowMs = Date.now()) => {
  if (item?.type !== 'countdown') {
    return { active: Boolean(active) };
  }

  const remaining = countdownSecondsRemaining(item, nowMs);

  if (!active) {
    // Absent is not zero: a timer we cannot read the remaining time of is left
    // with whatever it had rather than being frozen at nothing.
    return remaining === null
      ? { active: false }
      : { active: false, countdownRemaining: remaining };
  }

  if (remaining === null || remaining <= 0) {
    // Nothing left to run. Re-arming it here would fire the outlet on the next
    // tick, so the clock is not restarted and the card keeps saying so.
    return { active: true };
  }

  return {
    active: true,
    countdownDuration: remaining,
    countdownRemaining: remaining,
    countdownStartedAt: new Date(nowMs),
  };
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
    // A paused schedule can be switched back on, so canRun is true. It read
    // false, and the card takes canRun as "may the user work this control" -
    // which would have disabled the only way to re-enable it.
    return item?.active
      ? { label: 'Active', tone: 'running', canRun: true }
      : { label: 'Paused', tone: 'paused', canRun: true };
  }

  const remaining = countdownSecondsRemaining(item, nowMs);

  if (!item?.active) {
    // Two different things reach this branch and they used to read the same.
    // A timer the backend has run is spent: re-arming it would fire the outlet
    // on the next tick, so the control is closed. A timer the user paused still
    // has time on it and must be resumable.
    if (hasAlreadyFired(item) || remaining === null || remaining <= 0) {
      return { label: 'Finished · ran once', tone: 'done', canRun: false };
    }

    return {
      label: `Paused · ${formatDuration(remaining)} left`,
      tone: 'paused',
      canRun: true,
    };
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