const admin = require('firebase-admin');
const logger = require('firebase-functions/logger');

/**
 * HTTP endpoint for ESP32 to send sensor data
 * POST /updateOutletMetrics
 * Body: {
 *   deviceId: string,
 *   timestamp: number,
 *   outlets: [
 *     { number: 1, voltage: 220.5, current: 0.45, power: 99.2, status: "on", energy: 0.5 },
 *     { number: 2, voltage: 220.3, current: 0.0, power: 0.0, status: "off", energy: 0.0 }
 *   ]
 * }
 */
async function updateOutletMetrics(req, res) {
  try {
    // Validate request method
    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    // Extract data
    const { deviceId, timestamp, outlets } = req.body;

    // Validate required fields
    if (!deviceId || !outlets || !Array.isArray(outlets)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: deviceId, outlets' 
      });
    }

    // Validate timestamp (must be within 60 seconds)
    const now = Date.now();
    if (!timestamp || Math.abs(now - timestamp) > 60000) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid or stale timestamp' 
      });
    }

    // TODO: Validate deviceId matches user's registered ESP32
    // For now, extract userId from deviceId (format: userId_deviceId)
    const userId = deviceId.split('_')[0];
    if (!userId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid deviceId format' 
      });
    }

    // Update each outlet
    const db = admin.firestore();
    const batch = db.batch();

    for (const outlet of outlets) {
      const { number, voltage, current, power, status, energy } = outlet;

      // Validate outlet data
      if (!number || number < 1 || number > 2) {
        continue; // Skip invalid outlets
      }

      const outletRef = db.doc(`users/${userId}/outlets/outlet${number}`);
      
      batch.set(outletRef, {
        voltage: voltage || 0,
        current: current || 0,
        power: power || 0,
        status: status || 'off',
        energy: energy || 0,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    // Commit batch write
    await batch.commit();

    logger.info('Outlet metrics updated', { userId, deviceId, outletsCount: outlets.length });

    return res.status(200).json({ 
      success: true,
      message: 'Outlet metrics updated successfully',
      updatedOutlets: outlets.length,
    });

  } catch (error) {
    logger.error('Error updating outlet metrics:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
}

module.exports = { updateOutletMetrics };