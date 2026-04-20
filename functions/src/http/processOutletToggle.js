const admin = require('firebase-admin');
const logger = require('firebase-functions/logger');
const { HttpsError } = require('firebase-functions/v2/https');
const { dispatchDeviceCommand } = require('../lib/deviceCommandDispatcher');

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

/**
 * HTTPS Callable function for app to toggle outlets
 * Called from: Dashboard screen
 * Data: { outletId: 'outlet1' | 'outlet2', status: boolean }
 */
async function processOutletToggle(request) {
  try {
    const { data, auth } = request || {};

    // Check authentication
    if (!auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const userId = auth.uid;
    const { outletId, status } = data;

    // Validate input
    if (!outletId || typeof status !== 'boolean') {
      throw new HttpsError(
        'invalid-argument',
        'Invalid input: outletId (string) and status (boolean) required'
      );
    }

    if (!['outlet1', 'outlet2'].includes(outletId)) {
      throw new HttpsError('invalid-argument', 'Invalid outletId: must be outlet1 or outlet2');
    }

    const db = admin.firestore();
    const outletRef = db.doc(`users/${userId}/outlets/${outletId}`);

    // Get current outlet data
    const outletDoc = await outletRef.get();

    const outletData = outletDoc.exists ? outletDoc.data() : {};
    const outletNumber = parseInt(outletId.replace('outlet', ''));

    // Upsert to support older users missing initialized outlet docs.
    await outletRef.set({
      outletNumber,
      applianceName: outletData.applianceName || `Outlet ${outletNumber}`,
      voltage: outletData.voltage || 0,
      current: outletData.current || 0,
      power: outletData.power || 0,
      energy: outletData.energy || 0,
      totalEnergy: outletData.totalEnergy || 0,
      autoDetectedAppliance: outletData.autoDetectedAppliance || '',
      status: status ? 'on' : 'off',
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    // Keep status update resilient even if activity log creation fails.
    try {
      const logsRef = db.collection(`users/${userId}/history_logs`);
      await logsRef.add({
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        outlet: outletNumber,
        outletName: outletData.applianceName || `Outlet ${outletNumber}`,
        action: status ? 'on' : 'off',
        source: 'manual',
        power: outletData.power || 0,
      });
    } catch (historyError) {
      logger.warn('Outlet toggled but history log failed', {
        userId,
        outletId,
        message: historyError?.message,
      });
    }

    const commandResult = await dispatchDeviceCommand({
      userId,
      outletId,
      action: status ? 'on' : 'off',
      reason: 'manual_toggle',
      source: 'app',
      metadata: {
        outletNumber,
      },
    });

    logger.info('Outlet toggled', {
      userId,
      outletId,
      status,
      commandId: commandResult.commandId,
      commandChannel: commandResult.channel,
    });

    return { 
      success: true,
      outletId,
      status: status ? 'on' : 'off',
      commandId: commandResult.commandId,
      commandChannel: commandResult.channel,
      message: 'Outlet toggled successfully',
    };

  } catch (error) {
    logger.error('Error toggling outlet:', {
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

    throw new HttpsError('internal', error?.message || 'Failed to toggle outlet');
  }
}

module.exports = { processOutletToggle };