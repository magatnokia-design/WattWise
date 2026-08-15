const admin = require('firebase-admin');
const logger = require('firebase-functions/logger');
const { HttpsError } = require('firebase-functions/v2/https');
const { repriceUserDailyRows } = require('../lib/repriceDaily');

/**
 * Strips the once-a-month metering flat from daily rows priced before a day
 * stopped being treated as a billing period.
 *
 * processDailyRollup runs this sweep itself, so the rows repair themselves on
 * the next nightly run. This callable exists for when that is too long to wait
 * and to make the operation auditable on demand - it reports what it would
 * change and commits only on { apply: true }.
 */
async function repriceDailyRollups(request) {
  try {
    const { auth, data } = request || {};

    if (!auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const apply = data?.apply === true;

    const db = admin.firestore();
    const userId = auth.uid;

    const userDoc = await db.doc(`users/${userId}`).get();
    const userData = userDoc.exists ? userDoc.data() : {};

    const { changes, scanned } = await repriceUserDailyRows({
      db,
      userId,
      userData,
      apply,
    });

    if (apply && changes.length > 0) {
      logger.info('Repriced daily rollups', { userId, count: changes.length });
    }

    return {
      success: true,
      applied: apply,
      count: changes.length,
      scanned,
      changes,
    };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    logger.error('repriceDailyRollups failed', error);
    throw new HttpsError('internal', 'Could not reprice daily rollups');
  }
}

module.exports = { repriceDailyRollups };
