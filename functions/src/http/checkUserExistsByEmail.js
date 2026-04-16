const admin = require('firebase-admin');
const logger = require('firebase-functions/logger');
const { HttpsError } = require('firebase-functions/v2/https');

const EMAIL_REGEX = /^\S+@\S+\.\S+$/;

async function checkUserExistsByEmail(request) {
  const { data } = request || {};
  const email = String(data?.email || '').trim().toLowerCase();

  if (!EMAIL_REGEX.test(email)) {
    throw new HttpsError('invalid-argument', 'A valid email is required');
  }

  try {
    await admin.auth().getUserByEmail(email);
    return { exists: true };
  } catch (error) {
    if (error?.code === 'auth/user-not-found') {
      return { exists: false };
    }

    logger.error('Error checking user by email', {
      code: error?.code,
      message: error?.message,
    });

    throw new HttpsError('internal', 'Failed to verify account email');
  }
}

module.exports = { checkUserExistsByEmail };
