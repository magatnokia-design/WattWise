/**
 * The countdown arithmetic, on its own so it can be tested.
 *
 * This is the contract the phone and the web client both depend on. When a user
 * pauses a countdown the client records what was actually left; when they resume
 * it, the client writes `countdownDuration` = that figure and `countdownStartedAt`
 * = now. That works only because this function measures from those two fields and
 * nothing else - so the two sides stay in agreement without the cron needing to
 * know that pausing exists at all.
 *
 * Before that, pausing wrote `{ active: false }` alone. The clock underneath kept
 * running against the original `countdownStartedAt`, so the paused seconds were
 * spent anyway: the moment the user resumed, this arithmetic returned <= 0, the
 * cron switched the outlet and sent a notification saying the countdown had
 * finished. It had not. Reported from a handset on 5 Sep 2026.
 *
 * `checkScheduledTimers` had no test of any kind when that shipped. If you change
 * how remaining time is derived here, change `toggleTimerFields` in
 * `src/screens/Timer/utils/scheduleHelpers.js` (both repos) in the same commit,
 * or a paused timer starts lying again.
 */

/** Firestore Timestamp, Date, or parseable string -> epoch ms. 0 when unusable. */
const toMillis = (value) => {
  if (!value) return 0;
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
};

/**
 * Seconds left on a countdown, or null when the document cannot answer.
 *
 * Null rather than zero, deliberately. A schedule missing its duration or its
 * start is unreadable, not expired - and returning 0 for it would fire the
 * outlet. Absent is not zero, here as everywhere else in this project.
 *
 * @param {object} schedule the countdown document.
 * @param {number} nowMs the instant to measure against.
 * @returns {number|null} whole seconds remaining, or null if undeterminable.
 */
const countdownRemainingSeconds = (schedule, nowMs) => {
  const duration = Number(schedule?.countdownDuration || 0);

  // createdAt is the fallback origin the cron has always used. It is only ever
  // right for a timer that has never been paused or resumed, because neither
  // action rewrites it - so it stays a last resort, not a first choice.
  const startedMs = toMillis(schedule?.countdownStartedAt || schedule?.createdAt);

  if (!duration || duration <= 0 || !startedMs) return null;
  if (!Number.isFinite(nowMs)) return null;

  const elapsedSeconds = Math.floor((nowMs - startedMs) / 1000);
  return Math.max(0, duration - elapsedSeconds);
};

/** True when a countdown has reached zero and should switch its outlet. */
const countdownHasExpired = (schedule, nowMs) => {
  const remaining = countdownRemainingSeconds(schedule, nowMs);
  return remaining !== null && remaining <= 0;
};

module.exports = {
  toMillis,
  countdownRemainingSeconds,
  countdownHasExpired,
};
