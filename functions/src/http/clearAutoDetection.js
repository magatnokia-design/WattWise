const admin = require('firebase-admin');
const logger = require('firebase-functions/logger');
const { HttpsError } = require('firebase-functions/v2/https');
const { normalizeDetectionState } = require('../lib/applianceDetector');

const VALID_OUTLET_IDS = new Set(['outlet1', 'outlet2']);
const HTTPS_ERROR_CODES = new Set([
  'cancelled',
  'unknown',
  'invalid-argument',
  'deadline-exceeded',
  'not-found',
  'already-exists',
  'permission-denied',
  'resource-exhausted',
  'failed-precondition',
  'aborted',
  'out-of-range',
  'unimplemented',
  'internal',
  'unavailable',
  'data-loss',
  'unauthenticated',
]);

const normalizeOutletId = (value) => {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === '1' || normalized === '2') return `outlet${normalized}`;
  if (normalized.startsWith('outlet')) return normalized;
  return normalized;
};

const buildResetPayload = () => ({
  autoDetectedAppliance: '',
  applianceDetection: {
    modelVersion: '',
    confidence: 0,
    candidates: [],
    features: {},
    updatedAtMs: 0,
  },
  detectionState: normalizeDetectionState(null, 'off'),
});

async function clearAutoDetection(request) {
  try {
    const { auth, data } = request || {};

    if (!auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const requestedOutletId = normalizeOutletId(data?.outletId || data?.outletNumber || data?.outlet);
    if (requestedOutletId && !VALID_OUTLET_IDS.has(requestedOutletId)) {
      throw new HttpsError('invalid-argument', 'Invalid outletId: must be outlet1 or outlet2');
    }

    const outletIds = requestedOutletId ? [requestedOutletId] : ['outlet1', 'outlet2'];
    const db = admin.firestore();
    const resetPayload = buildResetPayload();
    const batch = db.batch();

    outletIds.forEach((outletId) => {
      const outletRef = db.doc(`users/${auth.uid}/outlets/${outletId}`);
      batch.set(outletRef, resetPayload, { merge: true });
    });

    await batch.commit();

    logger.info('Auto detection cleared', {
      userId: auth.uid,
      outletIds,
    });

    return { success: true, outletIds };
  } catch (error) {
    logger.error('Error clearing auto detection:', {
      message: error?.message,
      code: error?.code,
      stack: error?.stack,
    });

    if (error instanceof HttpsError) {
      throw error;
    }

    if (HTTPS_ERROR_CODES.has(error?.code)) {
      throw new HttpsError(error.code, error?.message || 'Request failed');
    }

    throw new HttpsError('internal', error?.message || 'Failed to clear auto detection');
  }
}

module.exports = { clearAutoDetection };
