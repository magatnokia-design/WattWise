const admin = require('firebase-admin');
const logger = require('firebase-functions/logger');
const { HttpsError } = require('firebase-functions/v2/https');

/**
 * Per-caller rate limiting for the HTTPS callables.
 *
 * WHY THIS AND NOT APP CHECK
 *
 * App Check is the usual answer to "stop things that are not my app calling my
 * backend", but it cannot attest this project's Android client: both clients use
 * the Firebase JS SDK, whose App Check providers are reCAPTCHA-based and need a
 * DOM that React Native does not have. Enforcement is also per-product rather
 * than per-client, so switching it on would reject every call from the phone.
 *
 * This lives in our own code instead, which means it covers the phone, the
 * website, and a curl loop equally - something App Check never could here.
 *
 * WHAT IT ACTUALLY DEFENDS
 *
 * Firestore rules are already owner-scoped, so this is not about reading other
 * people's data - it is about abuse that costs money or leaks facts:
 *
 *   - `checkUserExistsByEmail` is an unauthenticated oracle. Without a limit,
 *     anyone can feed it a wordlist and learn which addresses hold accounts.
 *   - `sendPasswordResetEmail` makes a stranger send mail. It already throttles
 *     per address; a per-IP limit stops one caller working through many.
 *   - `linkDeviceToAccount` checks a device token, so it is guessable given
 *     enough attempts.
 *   - Everything else is billed invocations someone could run up.
 *
 * FIXED WINDOW, NOT A SLIDING ONE
 *
 * A fixed window lets a caller spend a full allowance at the end of one window
 * and again at the start of the next. That burst is acceptable here and the
 * alternative costs more reads per call. What matters is that a sustained
 * attack cannot exceed `limit` per window, and it cannot.
 */

const COLLECTION = 'rate_limits';

// Counters are worthless once their window has passed; this only exists so a
// TTL policy can sweep them, the same way authEmails throttle documents do.
const RETENTION_MS = 24 * 60 * 60 * 1000;

/**
 * Identifies the caller.
 *
 * A signed-in user is keyed by uid, because that survives them changing network
 * and cannot be spoofed - the token is verified before the handler runs. Anyone
 * else is keyed by IP, which is weaker (shared NAT lumps strangers together,
 * and an attacker with many addresses gets many allowances) but is the only
 * identifier an unauthenticated caller has. The limits on those endpoints are
 * set loose enough that a shared office NAT is not locked out.
 */
const callerKey = (request) => {
  const uid = request?.auth?.uid;
  if (uid) return `uid:${uid}`;

  const headers = request?.rawRequest?.headers || {};
  // Cloud Functions sits behind Google's front end, which appends the real
  // client address as the first entry of x-forwarded-for.
  const forwarded = String(headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = forwarded || request?.rawRequest?.ip || 'unknown';

  // Firestore document IDs cannot contain '/'.
  return `ip:${ip.replace(/[^A-Za-z0-9.:_-]/g, '_')}`;
};

/**
 * The whole decision, with no I/O, so it can be tested directly.
 *
 * Returns the counter state to persist when allowed. A denied call writes
 * nothing: counting rejected attempts would let an attacker who is already
 * blocked keep pushing their own window forward, and it costs a write per
 * rejection at exactly the moment someone is generating a lot of them.
 */
const decideRateLimit = ({
  windowStartMs = 0,
  count = 0,
  limit,
  windowMs,
  nowMs,
}) => {
  const windowExpired = !windowStartMs || nowMs - windowStartMs >= windowMs;

  const nextWindowStartMs = windowExpired ? nowMs : windowStartMs;
  const nextCount = windowExpired ? 1 : count + 1;

  if (nextCount > limit) {
    return {
      allowed: false,
      retryAfterMs: Math.max(0, nextWindowStartMs + windowMs - nowMs),
    };
  }

  return {
    allowed: true,
    remaining: limit - nextCount,
    nextWindowStartMs,
    nextCount,
  };
};

/** Human-readable wait, for the message the caller actually sees. */
const describeRetryAfter = (retryAfterMs) => {
  const seconds = Math.ceil(Math.max(0, retryAfterMs) / 1000);
  if (seconds <= 90) return `${seconds} second${seconds === 1 ? '' : 's'}`;

  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;

  const hours = Math.ceil(minutes / 60);
  return `${hours} hour${hours === 1 ? '' : 's'}`;
};

/**
 * Reads, decides and writes in a transaction.
 *
 * The transaction matters: setGlobalOptions allows 10 concurrent instances, so
 * a read-then-write without one would let simultaneous calls each read the same
 * count and all write count+1, which is precisely the burst a limiter exists to
 * stop.
 */
const consumeRateLimit = async (db, { action, key, limit, windowMs, nowMs = Date.now() }) => {
  const ref = db.collection(COLLECTION).doc(`${action}:${key}`);

  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    const data = snapshot.exists ? snapshot.data() : null;

    const decision = decideRateLimit({
      windowStartMs: Number(data?.windowStartMs) || 0,
      count: Number(data?.count) || 0,
      limit,
      windowMs,
      nowMs,
    });

    if (decision.allowed) {
      tx.set(ref, {
        action,
        windowStartMs: decision.nextWindowStartMs,
        count: decision.nextCount,
        expireAt: new Date(nowMs + RETENTION_MS),
      });
    }

    return decision;
  });
};

/**
 * Throws `resource-exhausted` when the caller is over their allowance.
 *
 * Fails OPEN if Firestore itself is unavailable, matching consumeThrottle in
 * authEmails.js. That is a deliberate trade: a limiter that fails closed turns
 * a database blip into a total outage of every callable, and the thing being
 * protected here is cost and enumeration rather than access to data - the
 * security rules do that job and are unaffected either way.
 */
const enforceRateLimit = async (request, policy, options = {}) => {
  if (!policy) return;

  const db = options.db || admin.firestore();
  const nowMs = options.nowMs || Date.now();
  const key = callerKey(request);

  let decision;
  try {
    decision = await consumeRateLimit(db, {
      action: policy.action,
      key,
      limit: policy.limit,
      windowMs: policy.windowMs,
      nowMs,
    });
  } catch (error) {
    logger.warn('Rate limiter unavailable, allowing call', {
      action: policy.action,
      message: error?.message,
    });
    return;
  }

  if (decision.allowed) return;

  logger.warn('Rate limit exceeded', {
    action: policy.action,
    // The key, not the raw address: enough to correlate repeat offenders in
    // logs without writing user identifiers or IPs into them wholesale.
    keyKind: key.split(':')[0],
    limit: policy.limit,
    windowMs: policy.windowMs,
  });

  throw new HttpsError(
    'resource-exhausted',
    `Too many attempts. Please try again in ${describeRetryAfter(decision.retryAfterMs)}.`
  );
};

/** Wraps a callable handler so the limit is applied before it runs. */
const withRateLimit = (handler, policy) => async (request) => {
  await enforceRateLimit(request, policy);
  return handler(request);
};

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

/**
 * The policy table.
 *
 * Limits are set so a real person never meets them. The two unauthenticated
 * endpoints are the tight ones because they are the only surface a stranger can
 * reach at all; the authenticated limits exist to cap a runaway client or a
 * stolen session, not to police normal use.
 */
const RATE_LIMITS = {
  // Unauthenticated - keyed by IP.
  checkUserExistsByEmail: { action: 'checkUserExistsByEmail', limit: 20, windowMs: HOUR_MS },
  sendPasswordResetEmail: { action: 'sendPasswordResetEmail', limit: 10, windowMs: HOUR_MS },

  // Authenticated - keyed by uid.
  // Toggling is the hot path: a person tapping two switches never approaches
  // 60 a minute, but a client stuck in a retry loop would.
  processOutletToggle: { action: 'processOutletToggle', limit: 60, windowMs: MINUTE_MS },
  linkDeviceToAccount: { action: 'linkDeviceToAccount', limit: 10, windowMs: HOUR_MS },
  deleteAccount: { action: 'deleteAccount', limit: 3, windowMs: HOUR_MS },
  sendVerificationEmail: { action: 'sendVerificationEmail', limit: 10, windowMs: HOUR_MS },
  sendInvoiceEmail: { action: 'sendInvoiceEmail', limit: 20, windowMs: HOUR_MS },
  finalizeInvoice: { action: 'finalizeInvoice', limit: 30, windowMs: HOUR_MS },
  repriceDailyRollups: { action: 'repriceDailyRollups', limit: 10, windowMs: HOUR_MS },
  clearAutoDetection: { action: 'clearAutoDetection', limit: 60, windowMs: HOUR_MS },
  registerApplianceProfile: { action: 'registerApplianceProfile', limit: 60, windowMs: HOUR_MS },
  removeApplianceProfile: { action: 'removeApplianceProfile', limit: 60, windowMs: HOUR_MS },
  renameApplianceProfile: { action: 'renameApplianceProfile', limit: 60, windowMs: HOUR_MS },
};

module.exports = {
  RATE_LIMITS,
  callerKey,
  consumeRateLimit,
  decideRateLimit,
  describeRetryAfter,
  enforceRateLimit,
  withRateLimit,
};
