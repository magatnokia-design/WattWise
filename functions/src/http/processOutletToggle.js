const admin = require('firebase-admin');
const logger = require('firebase-functions/logger');

/**
 * HTTPS Callable function for app to toggle outlets
 * Called from: Dashboard screen
 * Data: { outletId: 'outlet1' | 'outlet2', status: boolean }
 */
async function processOutletToggle(data, context) {
  try {
    // Check authentication
    if (!context.auth) {
      throw new Error('Unauthenticated');
    }

    const userId = context.auth.uid;
    const { outletId, status } = data;

    // Validate input
    if (!outletId || typeof status !== 'boolean') {
      throw new Error('Invalid input: outletId and status required');
    }

    if (!['outlet1', 'outlet2'].includes(outletId)) {
      throw new Error('Invalid outletId: must be outlet1 or outlet2');
    }

    const db = admin.firestore();
    const outletRef = db.doc(`users/${userId}/outlets/${outletId}`);

    // Get current outlet data
    const outletDoc = await outletRef.get();
    if (!outletDoc.exists) {
      throw new Error('Outlet not found');
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
    logger.error('Error toggling outlet:', error);
    throw new Error(error.message || 'Failed to toggle outlet');
  }
}

module.exports = { processOutletToggle };