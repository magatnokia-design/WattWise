const admin = require('firebase-admin');
const logger = require('firebase-functions/logger');
const { HttpsError } = require('firebase-functions/v2/https');
const { normalizeUserProfiles } = require('../lib/applianceDetector');

const MAX_LABEL_LENGTH = 40;

/**
 * Removes one learned appliance signature from the user's saved profiles.
 *
 * Matching is case-insensitive on the label, mirroring how
 * registerApplianceProfile replaces a signature when the same appliance is
 * confirmed again.
 */
async function removeApplianceProfile(request) {
  try {
    const { auth, data } = request || {};

    if (!auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const label = String(data?.label || data?.applianceName || '')
      .trim()
      .slice(0, MAX_LABEL_LENGTH);

    if (!label) {
      throw new HttpsError('invalid-argument', 'label is required');
    }

    const db = admin.firestore();
    const userRef = db.doc(`users/${auth.uid}`);

    const result = await db.runTransaction(async (tx) => {
      const userDoc = await tx.get(userRef);
      const existing = normalizeUserProfiles((userDoc.data() || {}).applianceProfiles);

      const remaining = existing.filter(
        (profile) => profile.label.toLowerCase() !== label.toLowerCase()
      );

      if (remaining.length === existing.length) {
        return { removed: false, profiles: existing };
      }

      tx.set(userRef, { applianceProfiles: remaining }, { merge: true });
      return { removed: true, profiles: remaining };
    });

    if (!result.removed) {
      throw new HttpsError('not-found', `No saved appliance named "${label}"`);
    }

    logger.info('Appliance signature removed', { userId: auth.uid, label });

    return { success: true, label, remaining: result.profiles.length };
  } catch (error) {
    if (error instanceof HttpsError) {
      logger.warn('Remove appliance profile rejected', {
        code: error.code,
        message: error.message,
      });
      throw error;
    }

    logger.error('Error removing appliance profile:', {
      message: error?.message,
      stack: error?.stack,
    });

    throw new HttpsError('internal', error?.message || 'Failed to remove appliance profile');
  }
}

module.exports = { removeApplianceProfile };
