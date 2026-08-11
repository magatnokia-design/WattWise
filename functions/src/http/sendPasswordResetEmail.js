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
 * Sends the password reset email, branded, pointing at our own handler.
 *
 * Replaces the client's sendPasswordResetEmail: Firebase's own message cannot be
 * edited on this project and always links to its hosted page. This one goes out
 * through the same Brevo transport as every other WattWise email.
 *
 * Callable without a session by necessity - the whole point is that the user
 * cannot sign in. That makes it the one endpoint a stranger can make send mail,
 * hence the throttle.
 */
async function sendPasswordResetEmail(request) {
  const email = normalizeEmail(request?.data?.email);

  if (!isValidEmail(email)) {
    throw new HttpsError('invalid-argument', 'A valid email is required');
  }

  const db = admin.firestore();

  const allowed = await consumeThrottle(db, email, 'resetPassword');
  if (!allowed) {
    throw new HttpsError(
      'resource-exhausted',
      'A reset link was just sent. Check your inbox, and your spam folder, before asking for another.'
    );
  }

  let actionUrl;
  try {
    actionUrl = await buildAuthActionUrl('resetPassword', email);
  } catch (error) {
    if (error?.code === 'auth/user-not-found') {
      // Matches the existing forgot-password flow, which already tells the user
      // when no account exists rather than silently succeeding.
      throw new HttpsError('not-found', 'No account found with this email');
    }

    logger.error('Could not build password reset link', {
      code: error?.code,
      message: error?.message,
    });
    throw new HttpsError('internal', 'Could not start the password reset');
  }

  const result = await enqueueEmail({
    toEmail: email,
    subject: 'Reset your WattWise password',
    heading: 'Reset your password',
    intro:
      'Use the button below to choose a new password for your WattWise account. '
      + 'The link works once and expires in one hour. If you ask for another, only the newest one will work.',
    action: {
      label: 'Reset my password',
      url: actionUrl,
    },
    rows: [
      ['Account', email],
      ['Link expires', '1 hour after this email was sent'],
    ],
    tag: 'auth',
  });

  if (result?.success === false) {
    throw new HttpsError('internal', 'Could not send the reset email');
  }

  logger.info('Password reset email queued', { email });

  return { success: true };
}

module.exports = { sendPasswordResetEmail };
