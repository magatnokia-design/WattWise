const admin = require('firebase-admin');
const logger = require('firebase-functions/logger');
const { HttpsError } = require('firebase-functions/v2/https');
const { enqueueEmail } = require('../lib/mailQueue');
const {
  normalizeEmail,
  isValidEmail,
  consumeThrottle,
  buildAuthActionUrl,
} = require('../lib/authEmails');

/**
 * Sends the address-confirmation email, branded, pointing at our own handler.
 *
 * Requires a session, unlike the reset counterpart: the address comes from the
 * signed-in account rather than from the request, so this cannot be pointed at
 * a stranger's inbox.
 */
async function sendVerificationEmail(request) {
  const uid = request?.auth?.uid;

  if (!uid) {
    throw new HttpsError('unauthenticated', 'Sign in first');
  }

  let userRecord;
  try {
    userRecord = await admin.auth().getUser(uid);
  } catch (error) {
    logger.error('Could not load the account for verification', {
      uid,
      message: error?.message,
    });
    throw new HttpsError('internal', 'Could not load your account');
  }

  const email = normalizeEmail(userRecord.email);

  if (!isValidEmail(email)) {
    throw new HttpsError('failed-precondition', 'This account has no email address');
  }

  // Nothing to confirm, and sending anyway would hand out a live code for an
  // address already proven.
  if (userRecord.emailVerified) {
    return { success: true, alreadyVerified: true };
  }

  const db = admin.firestore();

  const allowed = await consumeThrottle(db, email, 'verifyEmail');
  if (!allowed) {
    throw new HttpsError(
      'resource-exhausted',
      'A confirmation link was just sent. Check your inbox, and your spam folder.'
    );
  }

  let actionUrl;
  try {
    actionUrl = await buildAuthActionUrl('verifyEmail', email);
  } catch (error) {
    logger.error('Could not build verification link', {
      uid,
      code: error?.code,
      message: error?.message,
    });
    throw new HttpsError('internal', 'Could not start the confirmation');
  }

  const displayName = String(userRecord.displayName || '').trim();

  const result = await enqueueEmail({
    toEmail: email,
    subject: 'Confirm your email for WattWise',
    heading: displayName ? `Welcome, ${displayName}` : 'Confirm your email',
    intro:
      'Confirm this address to finish setting up your WattWise account. '
      + 'Your monthly statements, daily usage receipts, and safety alerts are all sent here, '
      + 'so it needs to be an address you can reach.',
    action: {
      label: 'Confirm my email',
      url: actionUrl,
    },
    rows: [
      ['Account', email],
    ],
    tag: 'auth',
  });

  if (result?.success === false) {
    throw new HttpsError('internal', 'Could not send the confirmation email');
  }

  logger.info('Verification email queued', { uid });

  return { success: true };
}

module.exports = { sendVerificationEmail };
