const admin = require('firebase-admin');
const logger = require('firebase-functions/logger');
const { dispatchDeviceCommand } = require('../lib/deviceCommandDispatcher');
const { PENDING_STATUS_WINDOW_MS } = require('../lib/outletStatus');
const { normalizeThresholds } = require('../lib/powerSafety');
const { resolveUserContact, enqueueEmail } = require('../lib/mailQueue');

/**
 * Formats one outlet's readings for the alert email.
 *
 * The PZEM reports floats, and interpolating them raw printed
 * "234.1000061 V / 0 A / 0 W" in a safety email - which reads as a bug in the
 * measurement rather than an artefact of binary floating point. Rounded to the
 * precision the sensor actually resolves.
 */
// How many alerts the safety document keeps. It is the document both clients
// subscribe to for live readings, so an unbounded array would grow every
// realtime update forever. Ten is what getAlertHistory asks for by default.
const ALERT_HISTORY_LIMIT = 20;

const formatReading = (outlet) => {
  const value = (raw, places) => Number(raw || 0).toFixed(places);
  return `${value(outlet?.voltage, 1)} V / ${value(outlet?.current, 2)} A / `
    + `${value(outlet?.power, 1)} W`;
};

/**
 * Firestore trigger: Fires when power_safety document is written
 * Checks if safety stage changed
 * Creates high-priority notifications
 * Auto-cutoff if stage is 'cutoff' and autoProtectionEnabled
 */
async function handleSafetyAlerts(event) {
  // See the note in handleDailyReceiptEmails: v2 passes one event, not
  // (change, context). This threw on `context.params` every time - so the
  // auto-cutoff alert, the most safety-critical message the system sends, has
  // never reached anybody.
  const change = event.data;
  const context = { params: event.params || {} };

  try {
    const { userId } = context.params;
    
    // Get new and old data
    const newData = change.after.exists ? change.after.data() : null;
    const oldData = change.before.exists ? change.before.data() : null;

    // Skip if document deleted
    if (!newData) {
      return null;
    }

    const { currentStage, outlet1, outlet2 } = newData;
    const oldStage = oldData?.currentStage || 'normal';

    // The document carries two names for one setting, and until now this file
    // read the *other* one from everything else.
    //
    //   the UI toggle   -> protectionEnabled (falling back to autoProtectionEnabled)
    //   evaluateSafety  -> protectionEnabled !== false
    //   this trigger    -> autoProtectionEnabled, plain truthy, no default
    //
    // So a document with `protectionEnabled: true` and no
    // `autoProtectionEnabled` showed the switch on, computed the cutoff stage
    // correctly, announced "Power has been automatically cut off" - and never
    // opened the relay. The appliance kept running behind a message saying it
    // had been disconnected.
    //
    // Now matches evaluateSafety: either name, and absent means enabled. A
    // safety cutoff must not be skipped because a field was never written.
    const protectionEnabled = newData.protectionEnabled !== false
      && newData.autoProtectionEnabled !== false;

    // Check if stage changed
    if (currentStage === oldStage) {
      return null; // No change, skip
    }

    logger.info('Safety stage changed', { 
      userId, 
      oldStage, 
      newStage: currentStage 
    });

    const db = admin.firestore();

    // Determine alert level and message
    let title = 'Power Safety Alert';
    let message = '';
    let type = 'warning';

    switch (currentStage) {
      case 'warning':
        title = '⚠️ Power Warning';
        message = 'Power consumption approaching safety limits. Please check your appliances.';
        type = 'warning';
        break;

      case 'limit':
        title = '🔴 Safety Limit Reached';
        message = 'Power consumption has reached safety limits. Reduce load immediately.';
        type = 'high_usage';
        break;

      case 'cutoff':
        // The wording has to depend on what is about to happen. This branch
        // previously claimed the power had been cut off before the code that
        // does the cutting had run, and regardless of whether it would run at
        // all - so with protection disabled the user was told their outlets
        // were safe while the appliance carried on drawing.
        if (protectionEnabled) {
          title = '🚨 Auto-Cutoff Triggered';
          message = 'Power has been automatically cut off for your safety. Dangerous levels detected.';
        } else {
          title = '🚨 Cut-off Level Reached';
          message = 'Power reached the cut-off level, but auto cut-off is switched off, so '
            + 'nothing was disconnected. Switch the outlet off yourself, or turn auto cut-off '
            + 'on in Power Safety.';
        }
        type = 'cutoff';
        break;

      case 'normal':
        title = '✅ Back to Normal';
        message = 'Power consumption returned to safe levels.';
        type = 'device';
        break;

      default:
        return null;
    }

    // Create notification
    await db.collection(`users/${userId}/notifications`).add({
      type,
      title,
      message,
      outlet: null, // Affects all outlets
      read: false,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      metadata: {
        stage: currentStage,
        outlet1Voltage: outlet1?.voltage || 0,
        outlet1Current: outlet1?.current || 0,
        outlet1Power: outlet1?.power || 0,
        outlet2Voltage: outlet2?.voltage || 0,
        outlet2Current: outlet2?.current || 0,
        outlet2Power: outlet2?.power || 0,
      },
    });

    // Alert history. Both clients render this from
    // `power_safety/settings.alerts` via safetyService.getAlertHistory, and
    // **nothing had ever written that field** - so the panel read "No safety
    // alerts" while a notification and an email for the same event went out.
    // A reader with no writer, which is the same shape as the four dead
    // triggers and took a user noticing the contradiction to surface.
    //
    // serverTimestamp() is rejected inside an array, so the entry carries a
    // concrete Timestamp - getTimestampMs handles it via toDate().
    //
    // This write lands on the document this trigger watches. The stage is
    // unchanged by it, so the re-fire returns at the `currentStage === oldStage`
    // guard above rather than looping.
    const previousAlerts = Array.isArray(newData.alerts) ? newData.alerts : [];
    const alertEntry = {
      id: `${currentStage}_${Date.now()}`,
      type,
      title,
      message,
      stage: currentStage,
      outlet: null,
      timestamp: admin.firestore.Timestamp.now(),
    };

    await change.after.ref.set({
      alerts: [alertEntry, ...previousAlerts].slice(0, ALERT_HISTORY_LIMIT),
    }, { merge: true });

    const contact = await resolveUserContact(userId);
    if (contact?.email) {
      await enqueueEmail({
        toEmail: contact.email,
        subject: `WattWise safety alert: ${title}`,
        heading: title,
        intro: message,
        rows: [
          ['Stage', currentStage],
          ['Type', type],
          ['Outlet 1', formatReading(outlet1)],
          ['Outlet 2', formatReading(outlet2)],
        ],
        note:
          'Unplug whatever is on that outlet before switching it back on. If this keeps happening '
          + 'at normal load, your thresholds may be set tighter than your mains actually runs - '
          + 'Power Safety shows live readings against each limit. The firmware enforces 500 W per '
          + 'outlet regardless of what is configured.',
        tag: 'safety',
      });
    }

    logger.info('Safety alert created', { userId, stage: currentStage });

    // Auto-cutoff if stage is 'cutoff' and protection enabled
    if (currentStage === 'cutoff' && protectionEnabled) {
      // Cut only the outlets actually over their limit.
      //
      // This used to switch off both unconditionally and dispatch two commands
      // through Promise.all. The device fetches exactly one command per poll -
      // getDeviceCommand reads `devices/{id}.lastCommandId`, a single pointer
      // that dispatchDeviceCommand overwrites - so of two concurrent dispatches
      // only the later one is ever delivered. The other document is written,
      // never fetched, and times out.
      //
      // In practice that meant the cutoff switched off whichever outlet lost
      // the race. Observed: outlet2, sitting idle at 0.0 W, was disconnected
      // while outlet1 kept drawing 54 W behind an alert saying power had been
      // cut off. The wrong outlet, and the dangerous one left running.
      //
      // Cutting only the offending outlet is both better behaviour - an idle
      // outlet is not part of the problem - and one command in every realistic
      // case, so there is nothing to race.
      const thresholds = normalizeThresholds(newData.thresholds);

      const isOverLimit = (reading) => {
        const power = Number(reading?.power) || 0;
        const current = Number(reading?.current) || 0;
        const powerRatio = thresholds.powerMax > 0 ? power / thresholds.powerMax : 0;
        const currentRatio = thresholds.currentMax > 0 ? current / thresholds.currentMax : 0;
        return Math.max(powerRatio, currentRatio) >= 1;
      };

      const candidates = [
        { outletId: 'outlet1', number: 1, reading: outlet1 },
        { outletId: 'outlet2', number: 2, reading: outlet2 },
      ];

      const overLimit = candidates.filter((entry) => isOverLimit(entry.reading));

      // Nothing individually over means the combined draw tripped it, so the
      // heavier outlet is the one to shed. Cutting the idle one would achieve
      // nothing.
      const targets = overLimit.length > 0
        ? overLimit
        : [[...candidates].sort(
          (a, b) => (Number(b.reading?.power) || 0) - (Number(a.reading?.power) || 0)
        )[0]];

      logger.warn('Executing auto-cutoff', {
        userId,
        targets: targets.map((entry) => entry.outletId),
      });

      const batch = db.batch();

      // The pending marker processOutletToggle sets, for the same reason: the
      // device only learns about this when it next polls, and keeps posting
      // telemetry carrying its *current* relay state in the meantime. Without
      // it, updateOutletMetrics writes 'on' back over this within a second and
      // the outlets appear never to have been cut - which is indistinguishable
      // on screen from the cutoff not having run.
      const pendingUntilMs = Date.now() + PENDING_STATUS_WINDOW_MS;
      const logsRef = db.collection(`users/${userId}/history_logs`);

      targets.forEach((entry) => {
        batch.set(db.doc(`users/${userId}/outlets/${entry.outletId}`), {
          status: 'off',
          pendingStatus: 'off',
          pendingStatusUntilMs: pendingUntilMs,
          lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });

        batch.set(logsRef.doc(), {
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          outlet: entry.number,
          outletName: `Outlet ${entry.number}`,
          action: 'off',
          source: 'auto_cutoff',
          power: entry.reading?.power || 0,
        });
      });

      // Update lastCutoff timestamp
      batch.set(change.after.ref, {
        lastCutoff: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      await batch.commit();

      // Sequential, never Promise.all. Each dispatch moves the device's single
      // `lastCommandId` pointer, so concurrent dispatches silently discard all
      // but the last. Awaiting in turn does not make two commands deliverable -
      // the device still fetches one per poll - but it makes the ordering
      // deterministic instead of a race, and the last one written is the one
      // that gets through.
      //
      // Targets is one outlet in every realistic case. If it is ever two, the
      // second is the one delivered and the first is picked up by the firmware's
      // own 500 W per-outlet limit, which is enforced on the device regardless
      // of anything here.
      const dispatched = [];
      for (const entry of targets) {
        const command = await dispatchDeviceCommand({
          userId,
          outletId: entry.outletId,
          action: 'off',
          reason: 'safety_cutoff',
          source: 'safety_trigger',
          metadata: { stage: currentStage },
        });

        dispatched.push({
          outletId: entry.outletId,
          commandId: command.commandId,
          channel: command.channel,
        });
      }

      logger.info('Auto-cutoff executed', { userId, dispatched });
    }

    return null;

  } catch (error) {
    logger.error('Error handling safety alerts:', error);
    return null;
  }
}

module.exports = { handleSafetyAlerts };