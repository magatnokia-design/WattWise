const crypto = require('crypto');
const admin = require('firebase-admin');
const logger = require('firebase-functions/logger');

/**
 * Sends Firebase's auth emails ourselves.
 *
 * Firebase will not let this project edit its email templates or point them at
 * our own page - the Identity Toolkit API rejects any write to
 * `notification.sendEmail` with EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED, which is
 * policy on newer projects rather than an outage. So its mail is unbranded and
 * always lands on wattwise-fe394.firebaseapp.com.
 *
 * The documented way out is to stop using its mail: generate the action link
 * with the Admin SDK, keep only the one-time code from it, and send our own
 * message pointing at our own handler. The code is validated by Firebase, not by
 * whichever page consumes it.
 */

// Where the rebuilt links land. The web client serves this route; overridable so
// a preview deployment can be pointed at without a code change.
const ACTION_BASE_URL = (process.env.AUTH_ACTION_BASE_URL
  || 'https://www.wattwise.site/auth/action').trim();

// One request per address per minute, per kind. Password reset is callable
// without a session - it has to be, the user cannot sign in - so it is the one
// endpoint a stranger can make send mail. Brevo's free tier is 300/day shared
// across every email the system sends, which an unthrottled loop would exhaust
// in minutes and take the invoices down with it.
const THROTTLE_WINDOW_MS = 60000;
const THROTTLE_COLLECTION = 'auth_email_throttle';

const EMAIL_REGEX = /^\S+@\S+\.\S+$/;

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const isValidEmail = (email) => EMAIL_REGEX.test(email);

// The address is the throttle key, and storing it in plain text would leave a
// collection of every address that ever asked for a reset, readable by anything
// that gains access to it. The hash is enough to rate limit.
const throttleKey = (email, kind) => crypto
  .createHash('sha256')
  .update(`${kind}:${email}`)
  .digest('hex');

/**
 * Returns false when this address asked for the same mail less than a minute
 * ago. Fails open: a throttle that cannot be read must not stop a genuine
 * password reset.
 */
const consumeThrottle = async (db, email, kind, nowMs = Date.now()) => {
  const ref = db.collection(THROTTLE_COLLECTION).doc(throttleKey(email, kind));

  try {
    const snapshot = await ref.get();
    const lastSentAtMs = Number(snapshot.exists ? snapshot.data()?.lastSentAtMs : 0) || 0;

    if (lastSentAtMs && nowMs - lastSentAtMs < THROTTLE_WINDOW_MS) {
      return false;
    }

    await ref.set({
      lastSentAtMs: nowMs,
      kind,
      // Lets a TTL policy clear these; they are worthless after the window.
      expireAt: new Date(nowMs + 24 * 60 * 60 * 1000),
    });

    return true;
  } catch (error) {
    logger.warn('Auth email throttle unavailable, allowing send', {
      kind,
      message: error?.message,
    });
    return true;
  }
};

/**
 * Pulls the one-time code out of a link the Admin SDK generated.
 *
 * Only `oobCode` is kept. Everything else in that URL - the host, apiKey, lang,
 * continueUrl - describes Firebase's hosted page, which is precisely what we are
 * replacing.
 */
const extractOobCode = (link) => {
  try {
    return new URL(String(link)).searchParams.get('oobCode') || null;
  } catch {
    return null;
  }
};

const buildActionUrl = (mode, oobCode) =>
  `${ACTION_BASE_URL}?mode=${encodeURIComponent(mode)}&oobCode=${encodeURIComponent(oobCode)}`;

/**
 * Generates the link and rewrites it to our handler.
 *
 * `generatePasswordResetLink` and `generateEmailVerificationLink` both throw
 * auth/user-not-found for an unknown address, which the callers translate.
 */
const buildAuthActionUrl = async (mode, email) => {
  const generators = {
    resetPassword: (address) => admin.auth().generatePasswordResetLink(address),
    verifyEmail: (address) => admin.auth().generateEmailVerificationLink(address),
  };

  const generate = generators[mode];
  if (!generate) {
    throw new Error(`Unsupported auth email mode: ${mode}`);
  }

  const firebaseLink = await generate(email);
  const oobCode = extractOobCode(firebaseLink);

  if (!oobCode) {
    throw new Error('Firebase returned a link without an oobCode');
  }

  return buildActionUrl(mode, oobCode);
};

module.exports = {
  ACTION_BASE_URL,
  THROTTLE_WINDOW_MS,
  THROTTLE_COLLECTION,
  normalizeEmail,
  isValidEmail,
  throttleKey,
  consumeThrottle,
  extractOobCode,
  buildActionUrl,
  buildAuthActionUrl,
};
