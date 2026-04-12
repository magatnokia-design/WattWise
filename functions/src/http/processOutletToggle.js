const admin = require('firebase-admin');
const logger = require('firebase-functions/logger');
const { HttpsError } = require('firebase-functions/v2/https');

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
    if (!outletDoc.exists) {
      throw new HttpsError('not-found', 'Outlet not found');
    }

    const outletData = outletDoc.data();
    const outletNumber = parseInt(outletId.replace('outlet', ''));

    // Update outlet status
    await outletRef.set({
      status: status ? 'on' : 'off',
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    // Create activity log
    const logsRef = db.collection(`users/${userId}/history_logs`);
    await logsRef.add({
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      outlet: outletNumber,
      outletName: outletData.applianceName || `Outlet ${outletNumber}`,
      action: status ? 'on' : 'off',
      source: 'manual',
      power: outletData.power || 0,
    });

    // TODO: Send command to ESP32 via Realtime Database
    // const rtdb = admin.database();
    // await rtdb.ref(`devices/${userId}/commands/${outletId}`).set({
    //   action: status ? 'on' : 'off',
    //   timestamp: Date.now(),
    // });

    logger.info('Outlet toggled', { userId, outletId, status });

    return { 
      success: true,
      outletId,
      status: status ? 'on' : 'off',
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

    throw new HttpsError('internal', error?.message || 'Failed to toggle outlet');
  }
}

module.exports = { processOutletToggle };