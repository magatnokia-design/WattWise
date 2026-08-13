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
  matchNamedAppliance,
  isPlaceholderLabel,
} = require('../lib/applianceDetector');
const { dispatchDeviceCommand } = require('../lib/deviceCommandDispatcher');
const { resolveOutletStatus } = require('../lib/outletStatus');
const { deriveOutletEnergy } = require('../lib/energyAccounting');
const { evaluateSafety } = require('../lib/powerSafety');

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
      userData,
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

      // Learned signatures live on the user document, which device validation
      // already loaded - no extra read on this per-second telemetry path.
      const detectionOptions = { userProfiles: userData?.applianceProfiles };

      let detectionResult = null;
      // The run state the conclusions below are drawn from - the just-ended run
      // when the outlet is switching off, otherwise the run as it now stands.
      let evaluatedState = null;

      if (isRunEnding) {
        evaluatedState = normalizedPreviousState;
        detectionResult = detectApplianceFromRunState(normalizedPreviousState, detectionOptions);
      }

      const nextDetectionState = updateDetectionState(normalizedPreviousState, {
        status,
        power,
        timestampMs,
      });

      if (!evaluatedState && shouldEvaluateLive(nextDetectionState)) {
        evaluatedState = nextDetectionState;
        detectionResult = detectApplianceFromRunState(nextDetectionState, detectionOptions);
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

      // The device reports a lifetime cumulative meter reading, so `energy` is
      // derived here as today's usage. Everything downstream - the dashboard,
      // the nightly rollup, budgets - reads a real per-day number.
      const energyState = deriveOutletEnergy(previousOutletData, energy, timestampMs);

      // A toggle the device has not polled for yet must not be overwritten by
      // telemetry still reporting the old relay state.
      const statusResolution = resolveOutletStatus(previousOutletData, status, now);

      const outletUpdate = {
        outletId: `outlet${number}`,
        outletNumber: number,
        voltage,
        current,
        power,
        status: statusResolution.status,
        ...(statusResolution.clearPending
          ? {
            pendingStatus: admin.firestore.FieldValue.delete(),
            pendingStatusUntilMs: admin.firestore.FieldValue.delete(),
          }
          : {}),
        energy: energyState.energyTodayKwh,
        energyTodayKwh: energyState.energyTodayKwh,
        energyDateKey: energyState.energyDateKey,
        energyMeterKwh: energyState.energyMeterKwh,
        energyPreviousDayKwh: energyState.energyPreviousDayKwh,
        energyPreviousDateKey: energyState.energyPreviousDateKey,
        totalEnergy: energyState.totalEnergy,
        deviceId: normalizedDeviceId,
        detectionState: nextDetectionState,
        metricsUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        metricsUpdatedAtMs: now,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        safety: outletSafety,
      };

      // What the outlet claims to be, ignoring the "Outlet 1" placeholder - that
      // is a slot number, not an appliance, and treating it as a name would have
      // every run come back "changed".
      const rawApplianceName = String(previousOutletData.applianceName || '').trim();
      const namedAs = isPlaceholderLabel(rawApplianceName) ? '' : rawApplianceName;

      if (isRunStarting) {
        outletUpdate.autoDetectedAppliance = '';
        outletUpdate.applianceDetection = admin.firestore.FieldValue.delete();
        // A new run has proved nothing yet. Carrying the previous run's verdict
        // across would let a stale "confirmed" vouch for whatever got plugged in
        // next, which is precisely the failure this field exists to catch.
        outletUpdate.applianceIdentity = admin.firestore.FieldValue.delete();
      }

      if (detectionResult?.unsupported) {
        // Measured, scored against every profile, and matched by none. There is
        // no name to offer, but staying silent about it is what made an
        // out-of-scope load look identical to one still being measured.
        outletUpdate.autoDetectedAppliance = '';
        outletUpdate.applianceDetection = {
          modelVersion: detectionResult.modelVersion,
          confidence: 0,
          candidates: [],
          matchSource: 'none',
          unsupported: true,
          features: detectionResult.features,
          updatedAtMs: now,
        };
      } else if (detectionResult) {
        outletUpdate.autoDetectedAppliance = detectionResult.appliance;
        outletUpdate.applianceDetection = {
          modelVersion: detectionResult.modelVersion,
          confidence: detectionResult.confidence,
          candidates: detectionResult.candidates,
          matchSource: detectionResult.matchSource || 'generic',
          unsupported: false,
          features: detectionResult.features,
          updatedAtMs: now,
        };
      } else if (isRunEnding) {
        outletUpdate.autoDetectedAppliance = '';
        outletUpdate.applianceDetection = admin.firestore.FieldValue.delete();
      }

      // Whether the load matches the name on the outlet. Written here, once, so
      // both clients read the same verdict instead of each re-deriving it from
      // the raw fields - the phone compared the suggestion against the current
      // name and hid the prompt, the web did not, and the site went on offering
      // to accept a suggestion the user had already accepted on their phone.
      //
      // `suggestionPending` is that shared rule: offer a name when the outlet has
      // none, or when the measurements say the named appliance is no longer the
      // one running. Never when the identity is confirmed.
      if (evaluatedState) {
        const identity = matchNamedAppliance(
          evaluatedState,
          namedAs,
          userData?.applianceProfiles
        );

        const measuredAs = detectionResult?.appliance || '';
        const nameIsWrong = identity.state === 'changed';

        outletUpdate.applianceIdentity = {
          namedAs,
          measuredAs,
          state: identity.state,
          matchScore: identity.score,
          // The measured appliance was matched against one of this account's own
          // saved signatures rather than a generic wattage range - this is what
          // "WattWise recognised the appliance you plugged back in" means.
          recognised: detectionResult?.matchSource === 'learned',
          confidence: detectionResult?.confidence ?? null,
          // The run is outside what this system is built to monitor. Surfaced
          // here so a client can say so instead of showing a spinner forever.
          unsupported: detectionResult?.unsupported === true,
          suggestionPending: !!measuredAs && (nameIsWrong || !namedAs),
          updatedAtMs: now,
        };
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

    // Power safety. This is the only place with live readings and the user's
    // configured thresholds together, so the stage is derived here; writing it
    // is what lets handleSafetyAlerts notify and auto-cut off.
    const safetyRef = db.doc(`users/${userId}/power_safety/settings`);
    const safetySnapshot = await safetyRef.get();
    const safety = evaluateSafety({
      settings: safetySnapshot.exists ? safetySnapshot.data() : null,
      outlets: validOutlets,
      totalPowerW,
      nowMs: now,
    });

    if (safety.shouldWrite) {
      batch.set(safetyRef, {
        currentStage: safety.stage,
        stageReasons: safety.reasons,
        stageUpdatedAtMs: safety.stageChanged ? now : (safetySnapshot.data()?.stageUpdatedAtMs || now),
        lastReadingWriteMs: now,
        ...safety.readings,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    if (safety.stageChanged) {
      logger.info('Power safety stage changed', {
        userId,
        from: safety.previousStage,
        to: safety.stage,
        reasons: safety.reasons,
      });
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

    // Only touch the user document when the binding actually changed. Writing a
    // heartbeat here on every telemetry post (about once a second) made the user
    // doc permanently hot, so any transaction that reads it - notably
    // registerApplianceProfile - kept aborting under contention. The live
    // heartbeat already lives on devices/{deviceId} above.
    if (String(userData?.deviceId || '').trim() !== normalizedDeviceId) {
      batch.set(userRef, {
        deviceId: normalizedDeviceId,
        device: {
          deviceId: normalizedDeviceId,
          lastSeenAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      }, { merge: true });
    }

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