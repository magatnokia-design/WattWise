const admin = require('firebase-admin');
const logger = require('firebase-functions/logger');
const { HttpsError } = require('firebase-functions/v2/https');
const { dispatchDeviceCommand } = require('../lib/deviceCommandDispatcher');
const { PENDING_STATUS_WINDOW_MS } = require('../lib/outletStatus');
const { resolveOutletLogName } = require('../lib/applianceDetector');

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
      // The device only learns about this when it next polls getDeviceCommand,
      // and it keeps posting telemetry in the meantime carrying its *current*
      // relay state. Without this marker that telemetry overwrites the status
      // we just set, and the outlet visibly flips back within a second.
      // updateOutletMetrics honours the requested status until the device
      // confirms it or the window lapses.
      pendingStatus: status ? 'on' : 'off',
      pendingStatusUntilMs: Date.now() + PENDING_STATUS_WINDOW_MS,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    // Not awaited before dispatch: the device is waiting on the command, and
    // the log only feeds the History screen. Awaiting a second Firestore round
    // trip first added latency to every toggle for no user-visible benefit.
    // Still resilient - a failed log must never fail the toggle.
    const historyWrite = db.collection(`users/${userId}/history_logs`)
      .add({
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        outlet: outletNumber,
        outletName: resolveOutletLogName(outletData, outletNumber),
        action: status ? 'on' : 'off',
        source: 'manual',
        power: outletData.power || 0,
      })
      .catch((historyError) => {
        logger.warn('Outlet toggled but history log failed', {
          userId,
          outletId,
          message: historyError?.message,
        });
      });

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

    // Settled before returning so the write is not cut off when the function
    // instance is frozen - it just ran alongside the dispatch rather than
    // before it.
    await historyWrite;

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