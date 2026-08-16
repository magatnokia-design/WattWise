const admin = require('firebase-admin');
const logger = require('firebase-functions/logger');

/**
 * The security event log.
 *
 * WHY IT EXISTS
 *
 * WattWise records what the *hardware* did - every switch lands in
 * history_logs - but nothing recorded what happened to the *account*. A device
 * linked, a token guessed at, a limit tripped: all of it passed through Cloud
 * Logging and nowhere else, where it is invisible to the person it happened to
 * and gone on the logging retention schedule.
 *
 * Adding the CSV/Excel export is what made this concrete. Data now leaves the
 * boundary the security rules protect, and "we keep an audit trail" was not yet
 * a true sentence.
 *
 * WHAT IS DELIBERATELY NOT RECORDED
 *
 * - **No IP addresses.** The privacy policy says WattWise does not build a
 *   behavioural profile, and a timestamped address history is exactly that.
 *   The rate limiter still keys on IP in memory to do its job; it just never
 *   writes one down. This is the same reasoning that ruled out reCAPTCHA.
 * - **No tokens, passwords or secrets**, enforced by the sanitiser below rather
 *   than by remembering - a log that leaks the thing it is guarding is worse
 *   than no log.
 * - **No account-deletion record.** It would have to outlive the account to be
 *   worth anything, and the privacy policy promises no copy is kept. A trail
 *   that survives the erasure it describes contradicts the erasure.
 *
 * WHERE IT LIVES
 *
 * users/{userId}/security_events/{eventId} - inside the user's own tree, so it
 * is readable by them, deleted with them, and covered by the existing
 * owner-scoped rules. A central collection would have been easier to query and
 * would have outlived deleted accounts, which is precisely why it was not used.
 */

const COLLECTION = 'security_events';

// Ninety days. Long enough to investigate something noticed late, short enough
// that the log is not itself an indefinite record of a person's habits.
const RETENTION_DAYS = 90;
const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;

const EVENT_TYPES = Object.freeze({
  DEVICE_LINKED: 'device_linked',
  DEVICE_TRANSFERRED: 'device_transferred',
  DEVICE_UNLINKED: 'device_unlinked',
  DEVICE_AUTH_FAILED: 'device_auth_failed',
  PASSWORD_RESET_REQUESTED: 'password_reset_requested',
  RATE_LIMIT_EXCEEDED: 'rate_limit_exceeded',
});

const KNOWN_TYPES = new Set(Object.values(EVENT_TYPES));

// Matched against key names, not values: a value can be anything, but a field
// called "deviceToken" is never something we want written down.
const FORBIDDEN_KEY = /token|password|secret|credential|authorization|cookie|apikey|api_key/i;

// An address can arrive inside a detail field by accident - a message, a header
// echo - so it is stripped by shape as well as by key name.
const IPV4 = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g;
const IPV6 = /\b(?:[A-F0-9]{1,4}:){2,7}[A-F0-9]{1,4}\b/gi;

const MAX_STRING = 200;
const MAX_KEYS = 12;

/**
 * Reduces a detail object to something safe to persist.
 *
 * Flat, primitives only, key-filtered and length-capped. Nested objects are
 * dropped rather than walked: a recursive sanitiser is a recursive place for a
 * secret to hide, and nothing here needs the depth.
 */
const sanitizeDetail = (detail) => {
  if (!detail || typeof detail !== 'object' || Array.isArray(detail)) return {};

  const safe = {};

  Object.keys(detail).slice(0, MAX_KEYS).forEach((key) => {
    if (FORBIDDEN_KEY.test(key)) return;

    const value = detail[key];

    if (typeof value === 'number' && Number.isFinite(value)) {
      safe[key] = value;
      return;
    }

    if (typeof value === 'boolean') {
      safe[key] = value;
      return;
    }

    if (typeof value === 'string') {
      const scrubbed = value
        .replace(IPV4, '[address removed]')
        .replace(IPV6, '[address removed]')
        .slice(0, MAX_STRING);

      if (scrubbed.length > 0) safe[key] = scrubbed;
    }
  });

  return safe;
};

/** The record as it will be stored, with no I/O, so it can be tested directly. */
const buildSecurityEvent = (type, detail, nowMs) => ({
  type,
  detail: sanitizeDetail(detail),
  at: new Date(nowMs),
  expireAt: new Date(nowMs + RETENTION_MS),
});

/**
 * Writes one event under a user.
 *
 * Never throws and never awaits anything the caller depends on. This is called
 * from the middle of device authentication and rate limiting, and an audit log
 * that can fail the thing it observes turns a logging outage into a service
 * outage. A missing line is the acceptable failure here.
 *
 * A falsy userId is a no-op rather than an error: several call sites - an
 * unregistered device, a reset for an address with no account - genuinely do
 * not know who the actor is, and inventing a bucket for them would be a
 * different feature with different privacy consequences.
 */
const recordSecurityEvent = async (userId, type, detail = {}, options = {}) => {
  if (!userId) return false;

  if (!KNOWN_TYPES.has(type)) {
    logger.warn('Refusing to record unknown security event type', { type });
    return false;
  }

  const db = options.db || admin.firestore();
  const nowMs = options.nowMs || Date.now();

  try {
    await db
      .collection('users').doc(String(userId))
      .collection(COLLECTION)
      .add(buildSecurityEvent(type, detail, nowMs));

    return true;
  } catch (error) {
    logger.warn('Could not record security event', {
      type,
      message: error?.message,
    });
    return false;
  }
};

module.exports = {
  EVENT_TYPES,
  RETENTION_DAYS,
  buildSecurityEvent,
  recordSecurityEvent,
  sanitizeDetail,
};
