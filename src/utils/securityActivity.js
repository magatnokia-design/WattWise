/**
 * Turning stored security events into something a person can act on.
 *
 * Deliberately duplicated in the web repo - keep both in sync, the same way
 * billing.js and usageExport.js are. This decides what a security warning says,
 * and two clients describing the same event differently would be worse than one
 * of them not showing it at all.
 *
 * WHY THE WORDING MATTERS MORE THAN USUAL
 *
 * Most of these entries are things the user themselves did, and the honest
 * default is reassurance, not alarm. A log that treats every line as a threat
 * teaches people to ignore it, which is the failure mode that matters: the one
 * entry that IS worth acting on has to stand out from the ones that are not.
 *
 * So each type carries a tone. `alert` is reserved for the two that a person
 * cannot explain away by remembering what they did last week.
 */

const TYPES = {
  device_auth_failed: {
    title: 'Device sign-in refused',
    body: 'Something tried to send readings using the wrong device token. '
      + 'If this was not your WattWise unit being set up, re-link it in Settings '
      + 'to issue a new token.',
    tone: 'alert',
  },
  rate_limit_exceeded: {
    title: 'Too many requests blocked',
    body: 'WattWise refused a burst of requests from your account. Usually this '
      + 'is an app retrying after losing connection.',
    tone: 'notice',
  },
  device_linked: {
    title: 'WattWise unit linked',
    body: 'A unit was linked to your account.',
    tone: 'info',
  },
  device_transferred: {
    title: 'WattWise unit moved to this account',
    body: 'A unit that was linked to another account is now linked to yours.',
    tone: 'alert',
  },
  device_unlinked: {
    title: 'WattWise unit removed',
    body: 'A unit was unlinked from your account.',
    tone: 'info',
  },
  password_reset_requested: {
    title: 'Password reset requested',
    body: 'A reset link was sent for your account. If you did not ask for it, '
      + 'your password has not changed and the link expires in an hour.',
    tone: 'notice',
  },
};

const UNKNOWN = {
  title: 'Security activity',
  body: 'Something security-related happened on your account.',
  tone: 'info',
};

/** Firestore Timestamp, Date, or millis - callers have all three. */
export const eventTimeMs = (value) => {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * "3 minutes ago", "yesterday", "14 Aug".
 *
 * Recent entries get a relative time because that is how someone checks "was
 * that me, just now?". Older ones get a date, because "37 days ago" is a number
 * nobody converts.
 */
export const describeWhen = (value, nowMs = Date.now()) => {
  const ms = eventTimeMs(value);
  if (!ms) return '';

  const diff = nowMs - ms;
  if (diff < 0) return 'just now';

  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;

  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;

  return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

/** Everything a row needs, with the raw event's own detail folded in. */
export const describeSecurityEvent = (event, nowMs = Date.now()) => {
  const known = TYPES[event?.type] || UNKNOWN;

  // The device id is the one detail worth surfacing: with two units, "which
  // one" is the first thing a person asks.
  const deviceId = typeof event?.detail?.deviceId === 'string' ? event.detail.deviceId : '';

  return {
    id: event?.id || '',
    type: event?.type || 'unknown',
    title: known.title,
    body: known.body,
    tone: known.tone,
    deviceId,
    when: describeWhen(event?.at, nowMs),
    atMs: eventTimeMs(event?.at),
  };
};

/**
 * Newest first, and only what a person would recognise as recent.
 *
 * The backend keeps 90 days; showing all of it turns a security check into
 * scrolling. Anything older is still readable in the console if it is ever
 * actually needed for an investigation.
 */
export const describeSecurityEvents = (events = [], nowMs = Date.now()) =>
  (Array.isArray(events) ? events : [])
    .map((event) => describeSecurityEvent(event, nowMs))
    .filter((row) => row.atMs > 0)
    .sort((a, b) => b.atMs - a.atMs);

/**
 * How the entry point should read before it is opened.
 *
 * Takes `nowMs` like everything else here. It looked unnecessary - the summary
 * only counts and reads the newest row - but it forwards to describeWhen, so
 * without it the summary silently used the wall clock while the list beside it
 * used the passed time, and the two could disagree.
 */
export const summariseSecurityEvents = (events = [], nowMs = Date.now()) => {
  const rows = describeSecurityEvents(events, nowMs);

  if (rows.length === 0) return 'Nothing to report';

  const alerts = rows.filter((row) => row.tone === 'alert').length;
  if (alerts > 0) return `${alerts} item${alerts === 1 ? '' : 's'} to review`;

  return `Last activity ${rows[0].when}`;
};

export default describeSecurityEvents;
