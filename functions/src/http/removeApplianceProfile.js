const admin = require('firebase-admin');
const logger = require('firebase-functions/logger');
const { HttpsError } = require('firebase-functions/v2/https');
const { normalizeUserProfiles } = require('../lib/applianceDetector');

const VALID_OUTLET_IDS = ['outlet1', 'outlet2'];
const MAX_LABEL_LENGTH = 40;

/**
 * Removes one learned appliance signature from the user's saved profiles, and
 * un-names any outlet still carrying that name.
 *
 * Matching is case-insensitive on the label, mirroring how
 * registerApplianceProfile replaces a signature when the same appliance is
 * confirmed again.
 *
 * WHY THE OUTLET IS UN-NAMED TOO (Oct 2026)
 *
 * Forgetting used to delete the signature and nothing else, and detection then
 * never offered a name again for that outlet. The outlet was still called
 * "Electric Fan"; the generic profiles still measured the fan as "Electric
 * Fan"; buildApplianceIdentity saw the two labels agree and set
 * `suggestionPending: false` - correctly, by its own rule, since there was
 * nothing to correct. So the user forgot an appliance in order to re-teach it
 * and was never asked. Clearing the name puts the outlet back where a new one
 * starts: `namedAs` is empty, so the next evaluation of the run offers a
 * suggestion - within a few readings, even if the appliance is still running.
 *
 * The identity verdict is deleted with it, because it was a verdict on the
 * name that no longer exists; updateOutletMetrics writes a fresh one on its
 * next evaluation.
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

    const outletRefs = VALID_OUTLET_IDS.map((outletId) =>
      db.doc(`users/${auth.uid}/outlets/${outletId}`)
    );
    const outletDocs = await db.getAll(...outletRefs);
    const batch = db.batch();
    const clearedOutlets = [];

    outletDocs.forEach((snapshot, index) => {
      if (!snapshot.exists) return;

      const currentName = String((snapshot.data() || {}).applianceName || '').trim();
      if (currentName.toLowerCase() !== label.toLowerCase()) return;

      batch.set(snapshot.ref, {
        applianceName: '',
        applianceSelection: admin.firestore.FieldValue.delete(),
        applianceIdentity: admin.firestore.FieldValue.delete(),
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      clearedOutlets.push(VALID_OUTLET_IDS[index]);
    });

    if (clearedOutlets.length > 0) {
      await batch.commit();
    }

    logger.info('Appliance signature removed', { userId: auth.uid, label, clearedOutlets });

    return {
      success: true,
      label,
      remaining: result.profiles.length,
      clearedOutlets,
    };
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
