const admin = require('firebase-admin');
const logger = require('firebase-functions/logger');
const { HttpsError } = require('firebase-functions/v2/https');
const {
  MAX_USER_PROFILES,
  normalizeUserProfiles,
  buildApplianceSignature,
} = require('../lib/applianceDetector');

const VALID_OUTLET_IDS = new Set(['outlet1', 'outlet2']);
const MAX_LABEL_LENGTH = 40;

const normalizeOutletId = (value) => {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === '1' || normalized === '2') return `outlet${normalized}`;
  return normalized;
};

const normalizeLabel = (value) => String(value || '').trim().slice(0, MAX_LABEL_LENGTH);

/**
 * Records the currently-measured run on an outlet as a learned appliance
 * signature ("confirm to learn"). Signatures are stored on the user document so
 * the telemetry path can match against them without an extra read.
 *
 * Replaces any existing signature with the same label so re-confirming an
 * appliance refines it rather than accumulating duplicates.
 */
async function registerApplianceProfile(request) {
  try {
    const { auth, data } = request || {};

    if (!auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const outletId = normalizeOutletId(data?.outletId || data?.outletNumber || data?.outlet);
    if (!outletId || !VALID_OUTLET_IDS.has(outletId)) {
      throw new HttpsError('invalid-argument', 'Invalid outletId: must be outlet1 or outlet2');
    }

    const label = normalizeLabel(data?.applianceName || data?.label);
    if (!label) {
      throw new HttpsError('invalid-argument', 'applianceName is required');
    }

    const db = admin.firestore();
    const userRef = db.doc(`users/${auth.uid}`);
    const outletRef = db.doc(`users/${auth.uid}/outlets/${outletId}`);

    const signature = await db.runTransaction(async (tx) => {
      const [userDoc, outletDoc] = await Promise.all([tx.get(userRef), tx.get(outletRef)]);

      if (!outletDoc.exists) {
        throw new HttpsError('not-found', 'Outlet not found');
      }

      const outletData = outletDoc.data() || {};
      const built = buildApplianceSignature(outletData.detectionState, label);

      if (!built) {
        throw new HttpsError(
          'failed-precondition',
          'Not enough measured data to learn this appliance yet. Keep it running for a few seconds and try again.'
        );
      }

      const existing = normalizeUserProfiles((userDoc.data() || {}).applianceProfiles);
      const withoutSameLabel = existing.filter(
        (profile) => profile.label.toLowerCase() !== label.toLowerCase()
      );

      const nextProfiles = [
        { ...built, updatedAtMs: Date.now() },
        ...withoutSameLabel,
      ].slice(0, MAX_USER_PROFILES);

      tx.set(userRef, { applianceProfiles: nextProfiles }, { merge: true });
      return built;
    });

    logger.info('Appliance signature learned', {
      userId: auth.uid,
      outletId,
      label,
      meanPower: signature.meanPower,
    });

    return { success: true, outletId, profile: signature };
  } catch (error) {
    if (error instanceof HttpsError) {
      logger.warn('Register appliance profile rejected', {
        code: error.code,
        message: error.message,
      });
      throw error;
    }

    logger.error('Error registering appliance profile:', {
      message: error?.message,
      stack: error?.stack,
    });

    throw new HttpsError('internal', error?.message || 'Failed to register appliance profile');
  }
}

module.exports = { registerApplianceProfile };
