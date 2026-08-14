const admin = require('firebase-admin');
const logger = require('firebase-functions/logger');
const { HttpsError } = require('firebase-functions/v2/https');
const {
  buildApplianceSignature,
  mergeSignatureIntoProfiles,
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
 * Names the appliance on an outlet and records the currently-measured run as a
 * learned signature ("confirm to learn").
 *
 * The naming write lives here rather than on the client because firestore.rules
 * only lets the app touch `applianceName`/`lastUpdated`/`outletNumber` - the
 * selection metadata it wants to store alongside the name would be rejected.
 *
 * Naming always succeeds; learning is best-effort and reported back separately,
 * since an outlet can be idle or too briefly measured to learn anything from.
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
    const outletNumber = Number(outletId.replace('outlet', ''));

    // Read outside the transaction on purpose: the outlet doc is rewritten by
    // telemetry roughly once a second, so including it in a transaction meant
    // constant retries and eventual aborts while hardware was live.
    const outletDoc = await outletRef.get();
    if (!outletDoc.exists) {
      throw new HttpsError('not-found', 'Outlet not found');
    }

    const outletData = outletDoc.data() || {};
    const signature = buildApplianceSignature(outletData.detectionState, label);

    const confidencePercent = Number(data?.confidencePercent);
    const selection = {
      name: label,
      source: String(data?.source || 'manual').trim().toLowerCase(),
      acceptedSuggestion: String(data?.source || '').trim().toLowerCase() === 'auto_suggestion',
      selectedAtMs: Date.now(),
      selectedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (Number.isFinite(confidencePercent)) {
      selection.confidencePercent = confidencePercent;
    }

    if (data?.modelVersion) {
      selection.modelVersion = String(data.modelVersion).slice(0, MAX_LABEL_LENGTH);
    }

    await outletRef.set({
      outletNumber,
      applianceName: label,
      applianceSelection: selection,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    if (!signature) {
      logger.info('Appliance named but not learned (insufficient run data)', {
        userId: auth.uid,
        outletId,
        label,
      });

      return {
        success: true,
        outletId,
        applianceName: label,
        learned: false,
        learnError:
          'Named, but not saved as a signature yet - keep it running for a few seconds and confirm again.',
      };
    }

    // Only the user doc is transactional; it is no longer written by telemetry,
    // so this stays contention-free.
    // Confirming the same appliance in a different operating regime used to
    // replace what was learned before, so an iPhone taught at 28.8 W and then
    // confirmed again at 10.5 W kept only the last one and stopped recognising
    // itself at the other end of its own charge curve. mergeSignatureIntoProfiles
    // refines the nearest cluster when the measurement is close to one, and adds
    // a cluster when it is not.
    await db.runTransaction(async (tx) => {
      const userDoc = await tx.get(userRef);
      const nextProfiles = mergeSignatureIntoProfiles(
        (userDoc.data() || {}).applianceProfiles,
        signature,
        Date.now()
      );

      tx.set(userRef, { applianceProfiles: nextProfiles }, { merge: true });
    });

    logger.info('Appliance signature learned', {
      userId: auth.uid,
      outletId,
      label,
      meanPower: signature.meanPower,
    });

    return {
      success: true,
      outletId,
      applianceName: label,
      learned: true,
      profile: signature,
    };
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
