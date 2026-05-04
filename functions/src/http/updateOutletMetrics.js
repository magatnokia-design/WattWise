const admin = require('firebase-admin');
const logger = require('firebase-functions/logger');
const {
  DeviceRequestError,
  parseIncomingTimestampMs,
  assertFreshTimestamp,
  parseMetric,
  validateDeviceRequest,
  enforceMetricsRateAndReplayGuards,
} = require('../lib/deviceSecurity');
const {
  normalizeDetectionState,
  updateDetectionState,
  shouldEvaluateLive,
  detectApplianceFromRunState,
} = require('../lib/applianceDetector');
const { dispatchDeviceCommand } = require('../lib/deviceCommandDispatcher');

const VALID_STATUSES = new Set(['on', 'off']);
const MAX_OUTLET_POWER_W = 500;
const MAX_TOTAL_POWER_W = 1000;
const OVERPOWER_COMMAND_COOLDOWN_MS = 15000;
const TOTAL_OVERPOWER_COMMAND_COOLDOWN_MS = 15000;

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
    const { deviceId, timestamp, outlets } = req.body || {};
    const requestToken = String(req.get('x-device-token') || req.body?.deviceToken || '').trim();

    // Validate required fields
    if (!deviceId || !outlets || !Array.isArray(outlets)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: deviceId, outlets' 
      });
    }

    if (outlets.length > 4) {
      return res.status(400).json({
        success: false,
        error: 'Invalid outlets payload size',
      });
    }

    // Validate timestamp (must be recent to reduce replay risk)
    const timestampMs = parseIncomingTimestampMs(timestamp);
    const now = Date.now();
    assertFreshTimestamp(timestampMs, now);

    const db = admin.firestore();
    const {
      userId,
      userRef,
      resolvedDevice,
      normalizedDeviceId,
    } = await validateDeviceRequest({
      db,
      deviceId,
      requestToken,
      requireToken: true,
    });

    await enforceMetricsRateAndReplayGuards({
      db,
      normalizedDeviceId,
      timestampMs,
      nowMs: now,
      minIntervalMs: 700,
    });

    // Validate and normalize outlet payloads before write.
    const validOutlets = [];
    for (const outlet of outlets) {
      const outletNumber = Number(outlet?.number);
      if (!Number.isInteger(outletNumber) || outletNumber < 1 || outletNumber > 2) {
        continue;
      }

      const voltage = parseMetric(outlet?.voltage, 0, 300);
      const current = parseMetric(outlet?.current, 0, 100);
      const power = parseMetric(outlet?.power, 0, 50000);
      const energy = parseMetric(outlet?.energy, 0, 1000000);
      const status = String(outlet?.status || '').trim().toLowerCase();

      if (voltage === null || current === null || power === null || energy === null) {
        continue;
      }

      validOutlets.push({
        number: outletNumber,
        voltage,
        current,
        power,
        energy,
        status: VALID_STATUSES.has(status) ? status : 'off',
        isOverPower: power > MAX_OUTLET_POWER_W,
      });
    }

    if (validOutlets.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'No valid outlet payloads were provided',
      });
    }

    const totalPowerW = validOutlets.reduce((sum, outlet) => sum + outlet.power, 0);
    const isTotalOverPower = totalPowerW > MAX_TOTAL_POWER_W;

    const outletRefs = new Map();
    const outletSnapshots = new Map();

    await Promise.all(validOutlets.map(async (outlet) => {
      const outletRef = db.doc(`users/${userId}/outlets/outlet${outlet.number}`);
      outletRefs.set(outlet.number, outletRef);

      const outletSnapshot = await outletRef.get();
      outletSnapshots.set(outlet.number, outletSnapshot.exists ? outletSnapshot.data() : {});
    }));

    const previousTotalSafety =
      (outletSnapshots.get(1) || outletSnapshots.get(2) || {}).safety || {};
    const lastTotalOverPowerAtMs = Number(previousTotalSafety.totalOverPowerAtMs || 0);
    const shouldDispatchTotalOverPower =
      isTotalOverPower &&
      (now - lastTotalOverPowerAtMs >= TOTAL_OVERPOWER_COMMAND_COOLDOWN_MS);

    const createSafetyNotification = async ({
      title,
      message,
      outlet,
      metadata,
    }) => db.collection(`users/${userId}/notifications`).add({
      type: 'cutoff',
      title,
      message,
      outlet: outlet ?? null,
      read: false,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      metadata: metadata || {},
    });

    // Update each outlet in a batch.
    const batch = db.batch();

    const dispatchedOutletIds = new Set();

    for (const outlet of validOutlets) {
      const { number, voltage, current, power, status, energy, isOverPower } = outlet;
      const outletRef = outletRefs.get(number);
      const previousOutletData = outletSnapshots.get(number) || {};
      const previousSafety = previousOutletData.safety || {};
      const lastOverPowerAtMs = Number(previousSafety.overPowerAtMs || 0);
      const shouldDispatchOverPower =
        isOverPower &&
        status === 'on' &&
        (now - lastOverPowerAtMs >= OVERPOWER_COMMAND_COOLDOWN_MS);
      const previousStatus = String(previousOutletData.status || 'off').trim().toLowerCase();
      const normalizedPreviousState = normalizeDetectionState(
        previousOutletData.detectionState,
        previousStatus === 'on' ? 'on' : 'off'
      );
      const isRunStarting = status === 'on' && normalizedPreviousState.sampleCount === 0;
      const isRunEnding = status === 'off' && normalizedPreviousState.sampleCount > 0;

      let detectionResult = null;
      if (isRunEnding) {
        detectionResult = detectApplianceFromRunState(normalizedPreviousState);
      }

      const nextDetectionState = updateDetectionState(normalizedPreviousState, {
        status,
        power,
        timestampMs,
      });

      if (!detectionResult && shouldEvaluateLive(nextDetectionState)) {
        detectionResult = detectApplianceFromRunState(nextDetectionState);
      }

      const outletSafety = {
        overPower: isOverPower,
        overPowerAtMs: isOverPower ? now : Number(previousSafety.overPowerAtMs || 0),
        overPowerW: isOverPower ? power : Number(previousSafety.overPowerW || 0),
        limitW: MAX_OUTLET_POWER_W,
        totalOverPower: isTotalOverPower,
        totalOverPowerAtMs: isTotalOverPower ? now : Number(previousTotalSafety.totalOverPowerAtMs || 0),
        totalOverPowerW: isTotalOverPower ? totalPowerW : Number(previousTotalSafety.totalOverPowerW || 0),
        totalLimitW: MAX_TOTAL_POWER_W,
      };

      const outletUpdate = {
        outletId: `outlet${number}`,
        outletNumber: number,
        voltage,
        current,
        power,
        status,
        energy,
        deviceId: normalizedDeviceId,
        detectionState: nextDetectionState,
        metricsUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        metricsUpdatedAtMs: now,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        safety: outletSafety,
      };

      if (isRunStarting) {
        outletUpdate.autoDetectedAppliance = '';
        outletUpdate.applianceDetection = admin.firestore.FieldValue.delete();
      }

      if (detectionResult) {
        outletUpdate.autoDetectedAppliance = detectionResult.appliance;
        outletUpdate.applianceDetection = {
          modelVersion: detectionResult.modelVersion,
          confidence: detectionResult.confidence,
          candidates: detectionResult.candidates,
          features: detectionResult.features,
          updatedAtMs: now,
        };
      } else if (isRunEnding) {
        outletUpdate.autoDetectedAppliance = '';
        outletUpdate.applianceDetection = admin.firestore.FieldValue.delete();
      }

      if (shouldDispatchOverPower) {
        await dispatchDeviceCommand({
          userId,
          deviceId: normalizedDeviceId,
          outletId: `outlet${number}`,
          action: 'off',
          reason: 'safety_overpower',
          source: 'system',
          metadata: {
            powerW: power,
            limitW: MAX_OUTLET_POWER_W,
          },
        });

        dispatchedOutletIds.add(number);

        await createSafetyNotification({
          title: '⚠️ Outlet Over-Power Cutoff',
          message: `Outlet ${number} exceeded ${MAX_OUTLET_POWER_W}W and was turned off.`,
          outlet: number,
          metadata: {
            powerW: power,
            limitW: MAX_OUTLET_POWER_W,
            type: 'outlet_overpower',
          },
        });

        logger.warn('Overpower detected; cutoff command dispatched', {
          userId,
          deviceId: normalizedDeviceId,
          outletNumber: number,
          powerW: power,
          limitW: MAX_OUTLET_POWER_W,
        });
      }

      batch.set(outletRef, outletUpdate, { merge: true });
    }

    if (shouldDispatchTotalOverPower) {
      const candidates = validOutlets
        .filter((entry) => entry.status === 'on')
        .sort((a, b) => b.power - a.power);

      const outletToCut = candidates.find((entry) => !dispatchedOutletIds.has(entry.number)) || null;

      if (outletToCut) {
        await dispatchDeviceCommand({
          userId,
          deviceId: normalizedDeviceId,
          outletId: `outlet${outletToCut.number}`,
          action: 'off',
          reason: 'safety_total_overpower',
          source: 'system',
          metadata: {
            totalPowerW,
            limitW: MAX_TOTAL_POWER_W,
            outletPowerW: outletToCut.power,
          },
        });

        await createSafetyNotification({
          title: '🚨 Total Power Limit',
          message: `Total load exceeded ${MAX_TOTAL_POWER_W}W. Outlet ${outletToCut.number} was turned off.`,
          outlet: outletToCut.number,
          metadata: {
            totalPowerW,
            limitW: MAX_TOTAL_POWER_W,
            outletPowerW: outletToCut.power,
            type: 'total_overpower',
          },
        });

        logger.warn('Total overpower detected; cutoff command dispatched', {
          userId,
          deviceId: normalizedDeviceId,
          totalPowerW,
          limitW: MAX_TOTAL_POWER_W,
          outletNumber: outletToCut.number,
        });
      }
    }

    // Keep mapping heartbeat fresh.
    batch.set(db.doc(`devices/${normalizedDeviceId}`), {
      userId,
      deviceId: normalizedDeviceId,
      lastMetricsAtMs: now,
      lastPayloadTimestampMs: timestampMs,
      lastSeenAtMs: now,
      lastSeenAt: admin.firestore.FieldValue.serverTimestamp(),
      health: {
        status: 'online',
        statusReason: 'telemetry_received',
        lastSeenAtMs: now,
        lastTelemetryAtMs: now,
        updatedAtMs: now,
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    batch.set(userRef, {
      deviceId: normalizedDeviceId,
      device: {
        deviceId: normalizedDeviceId,
        lastSeenAt: admin.firestore.FieldValue.serverTimestamp(),
      },
    }, { merge: true });

    // Commit batch write
    await batch.commit();

    logger.info('Outlet metrics updated', {
      userId,
      deviceId: normalizedDeviceId,
      outletsCount: validOutlets.length,
      source: resolvedDevice.source,
    });

    return res.status(200).json({ 
      success: true,
      message: 'Outlet metrics updated successfully',
      updatedOutlets: validOutlets.length,
    });

  } catch (error) {
    if (error instanceof DeviceRequestError) {
      return res.status(error.statusCode).json({
        success: false,
        error: error.message,
      });
    }

    logger.error('Error updating outlet metrics:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
}

module.exports = { updateOutletMetrics };