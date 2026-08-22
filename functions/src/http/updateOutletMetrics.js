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
  MODEL_VERSION,
  normalizeDetectionState,
  updateDetectionState,
  shouldEvaluateLive,
  detectApplianceFromRunState,
  matchNamedAppliance,
  buildApplianceIdentity,
  isPlaceholderLabel,
  resolveOutletLogName,
} = require('../lib/applianceDetector');
const { updateChargingState, describeSettledCharge } = require('../lib/chargingState');
const { createNotification } = require('../lib/notifications');
const { dispatchDeviceCommand } = require('../lib/deviceCommandDispatcher');
const { resolveOutletStatus, isUncommandedStatusChange } = require('../lib/outletStatus');
const { deriveOutletEnergy } = require('../lib/energyAccounting');
const { evaluateSafety } = require('../lib/powerSafety');
const { evaluateRelayFault } = require('../lib/relayFault');

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
    // Relay positions the device reports that WattWise never asked for; written
    // to history after the loop so they ride the same batch.
    const uncommandedChanges = [];
    // Charges that finished on this post. Notified after the batch commits, so
    // a failed write never produces a notification about state that was not
    // saved - the next sample would then report it a second time.
    const chargeCompletions = [];
    // Outlets whose relay has stopped opening, and outlets where that has just
    // recovered. Same after-the-commit discipline as chargeCompletions.
    const relayFaultEvents = [];

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
      // `power` is passed so the day's peak is a maximum over every telemetry
      // sample. It used to be reconstructed in the nightly rollup from event
      // logs, which only exist when someone pressed something.
      const energyState = deriveOutletEnergy(previousOutletData, energy, timestampMs, power, voltage);

      // A toggle the device has not polled for yet must not be overwritten by
      // telemetry still reporting the old relay state.
      const statusResolution = resolveOutletStatus(previousOutletData, status, now);

      // The Activity log promises "every switch, wherever it came from", and a
      // power-cycle went straight past it: the ESP32 returns with both relays
      // open - correct, that is the module's default - and two outlets changed
      // state with nothing written, because only commands write history.
      if (isUncommandedStatusChange(previousOutletData, status)) {
        uncommandedChanges.push({
          number,
          outletName: resolveOutletLogName(previousOutletData, number),
          action: statusResolution.status,
          power,
        });
      }

      // Reports a finished charge; never acts on one. See chargingState.js -
      // nothing downstream of this reads it except the notification below and
      // the card on each client.
      const nextChargingState = updateChargingState(previousOutletData.chargingState, {
        status: statusResolution.status,
        powerW: power,
        timestampMs: now,
      });

      if (nextChargingState.justSettled) {
        chargeCompletions.push({
          number,
          peakW: nextChargingState.peakW,
          powerW: power,
        });
      }

      // The third reconciliation: the device says the relay is open, and the
      // meter on that same outlet says current is flowing. Both were already
      // being written to this document and neither was ever compared with the
      // other, so a contact that welded shut looked identical to a healthy
      // outlet in every log the system kept.
      const relayFault = evaluateRelayFault({
        previous: previousOutletData,
        status: statusResolution.status,
        powerW: power,
        pendingHonoured: statusResolution.pendingHonoured,
        nowMs: now,
      });

      if (relayFault.justTripped || relayFault.justCleared) {
        relayFaultEvents.push({
          number,
          outletName: resolveOutletLogName(previousOutletData, number),
          tripped: relayFault.justTripped,
          observedW: relayFault.observedW,
        });
      }

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
        peakPowerTodayW: energyState.peakPowerTodayW,
        peakPowerTodayAtMs: energyState.peakPowerTodayAtMs,
        peakPowerPreviousDayW: energyState.peakPowerPreviousDayW,
        peakPowerPreviousDayAtMs: energyState.peakPowerPreviousDayAtMs,
        totalEnergy: energyState.totalEnergy,
        deviceId: normalizedDeviceId,
        detectionState: nextDetectionState,
        chargingState: {
          state: nextChargingState.state,
          peakW: nextChargingState.peakW,
          runStartedAtMs: nextChargingState.runStartedAtMs,
          settledSinceMs: nextChargingState.settledSinceMs,
          aboveSinceMs: nextChargingState.aboveSinceMs,
          notifiedAtMs: nextChargingState.notifiedAtMs,
          lastSampleAtMs: nextChargingState.lastSampleAtMs,
        },
        metricsUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        metricsUpdatedAtMs: now,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        safety: outletSafety,
        relayFault: {
          state: relayFault.state,
          firstSeenAtMs: relayFault.firstSeenAtMs,
          observedW: relayFault.observedW,
          confirmedAtMs: relayFault.confirmedAtMs,
        },
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

      // Over the hardware limit is out of scope by definition on a low-voltage
      // system, and the answer cannot come from the detector even in principle.
      // The firmware opens the relay after OVERPOWER_GRACE_MS (3 s) while posting
      // every METRICS_INTERVAL_ACTIVE_MS (1.5 s), so a run like this is two or
      // three samples long against a MIN_SAMPLE_COUNT of 4:
      // detectApplianceFromRunState returns at its sample guard and never reaches
      // the branch that sets `unsupported`. So the one state built to say "this
      // is outside what WattWise monitors" was unreachable for precisely the
      // appliances most obviously outside it - an iron, a kettle, a microwave all
      // read "Detecting..." indefinitely, which is indistinguishable from a
      // measurement still in progress. It only ever fired in the 230-500 W band.
      //
      // No sampling is required to know a 1030 W load is not a laptop charger.
      const outOfScopeByPower = isOverPower;

      if (detectionResult?.unsupported || outOfScopeByPower) {
        // Measured, scored against every profile, and matched by none. There is
        // no name to offer, but staying silent about it is what made an
        // out-of-scope load look identical to one still being measured.
        outletUpdate.autoDetectedAppliance = '';
        outletUpdate.applianceDetection = {
          modelVersion: detectionResult?.modelVersion || MODEL_VERSION,
          confidence: 0,
          candidates: [],
          matchSource: 'none',
          unsupported: true,
          // Why it is out of scope, so the clients can say "draws too much" for
          // the over-power case rather than the vaguer "not recognised".
          unsupportedReason: detectionResult?.unsupported ? 'no_match' : 'over_power',
          ...(outOfScopeByPower ? { measuredPowerW: Number(power.toFixed(1)) } : {}),
          features: detectionResult?.features || null,
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

        outletUpdate.applianceIdentity = {
          ...buildApplianceIdentity(identity, detectionResult, namedAs),
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

    // A relay moved without WattWise ordering it - a power-cycle is the ordinary
    // cause, and the ESP32 booting with both relays open is correct behaviour.
    // The log records what happened rather than claiming to know why.
    for (const change of uncommandedChanges) {
      batch.set(db.collection(`users/${userId}/history_logs`).doc(), {
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        outlet: change.number,
        outletName: change.outletName,
        action: change.action,
        source: 'device',
        power: change.power,
      });
    }

    // Logged as its own event rather than folded into the switch history: the
    // outlet did not change state, which is exactly the complaint.
    for (const event of relayFaultEvents) {
      batch.set(db.collection(`users/${userId}/history_logs`).doc(), {
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        outlet: event.number,
        outletName: event.outletName,
        action: event.tripped ? 'relay_fault' : 'relay_recovered',
        source: 'device',
        power: event.observedW,
      });
    }

    // Commit batch write
    await batch.commit();

    // Says what it measured and leaves the decision alone: no relay is touched
    // here. A charger left plugged in keeps drawing its standby watts, and the
    // user is the one who decides whether that matters.
    for (const completion of chargeCompletions) {
      await createNotification({
        userId,
        type: 'charge',
        title: '🔋 Charging looks finished',
        message: `Outlet ${completion.number}: ${describeSettledCharge(completion)}`,
        outlet: completion.number,
        metadata: {
          type: 'charge_complete',
          peakPowerW: completion.peakW,
          restingPowerW: completion.powerW,
        },
      });
    }

    // Deliberately blunt, and deliberately tells the user to do the one thing
    // WattWise cannot do for them. Every other safety notification this system
    // sends can end with "the outlet was switched off"; this is the one that
    // cannot, because the relay is the thing that failed.
    for (const event of relayFaultEvents) {
      await createNotification({
        userId,
        type: event.tripped ? 'safety' : 'system',
        title: event.tripped ? '⚠️ Outlet is not switching off' : '✅ Outlet is switching again',
        message: event.tripped
          ? `Outlet ${event.number} was switched off but is still drawing `
            + `${event.observedW.toFixed(1)} W. The relay may be stuck closed. `
            + 'Unplug the appliance at the wall - WattWise cannot cut this outlet.'
          : `Outlet ${event.number} responded to a switch-off and is now drawing no power.`,
        outlet: event.number,
        metadata: {
          type: event.tripped ? 'relay_stuck_closed' : 'relay_recovered',
          observedPowerW: event.observedW,
        },
      });
    }

    if (relayFaultEvents.some((event) => event.tripped)) {
      logger.error('Relay did not open', {
        userId,
        deviceId: normalizedDeviceId,
        outlets: relayFaultEvents.filter((e) => e.tripped).map((e) => e.number),
      });
    }

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