const admin = require('firebase-admin');
const logger = require('firebase-functions/logger');
const { dispatchDeviceCommand } = require('../lib/deviceCommandDispatcher');
const { getTemplateId, resolveUserContact, sendBrevoTemplateEmail } = require('../lib/brevoEmail');

/**
 * Firestore trigger: Fires when power_safety document is written
 * Checks if safety stage changed
 * Creates high-priority notifications
 * Auto-cutoff if stage is 'cutoff' and autoProtectionEnabled
 */
async function handleSafetyAlerts(change, context) {
  try {
    const { userId } = context.params;
    
    // Get new and old data
    const newData = change.after.exists ? change.after.data() : null;
    const oldData = change.before.exists ? change.before.data() : null;

    // Skip if document deleted
    if (!newData) {
      return null;
    }

    const { currentStage, autoProtectionEnabled, outlet1, outlet2 } = newData;
    const oldStage = oldData?.currentStage || 'normal';

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
        title = '🚨 Auto-Cutoff Triggered';
        message = 'Power has been automatically cut off for your safety. Dangerous levels detected.';
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

    const contact = await resolveUserContact(userId);
    if (contact?.email) {
      await sendBrevoTemplateEmail({
        toEmail: contact.email,
        toName: contact.name,
        templateId: getTemplateId('safety'),
        params: {
          title,
          message,
          stage: currentStage,
          type,
          outlet1Voltage: outlet1?.voltage || 0,
          outlet1Current: outlet1?.current || 0,
          outlet1Power: outlet1?.power || 0,
          outlet2Voltage: outlet2?.voltage || 0,
          outlet2Current: outlet2?.current || 0,
          outlet2Power: outlet2?.power || 0,
        },
        tags: ['safety'],
      });
    }

    logger.info('Safety alert created', { userId, stage: currentStage });

    // Auto-cutoff if stage is 'cutoff' and protection enabled
    if (currentStage === 'cutoff' && autoProtectionEnabled) {
      logger.warn('Executing auto-cutoff', { userId });

      const batch = db.batch();

      // Turn off both outlets
      const outlet1Ref = db.doc(`users/${userId}/outlets/outlet1`);
      const outlet2Ref = db.doc(`users/${userId}/outlets/outlet2`);

      batch.set(outlet1Ref, {
        status: 'off',
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      batch.set(outlet2Ref, {
        status: 'off',
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      // Create activity logs
      const logsRef = db.collection(`users/${userId}/history_logs`);
      
      batch.set(logsRef.doc(), {
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        outlet: 1,
        outletName: 'Outlet 1',
        action: 'off',
        source: 'auto_cutoff',
        power: outlet1?.power || 0,
      });

      batch.set(logsRef.doc(), {
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        outlet: 2,
        outletName: 'Outlet 2',
        action: 'off',
        source: 'auto_cutoff',
        power: outlet2?.power || 0,
      });

      // Update lastCutoff timestamp
      batch.set(change.after.ref, {
        lastCutoff: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      await batch.commit();

      const [outlet1Command, outlet2Command] = await Promise.all([
        dispatchDeviceCommand({
          userId,
          outletId: 'outlet1',
          action: 'off',
          reason: 'safety_cutoff',
          source: 'safety_trigger',
          metadata: { stage: currentStage },
        }),
        dispatchDeviceCommand({
          userId,
          outletId: 'outlet2',
          action: 'off',
          reason: 'safety_cutoff',
          source: 'safety_trigger',
          metadata: { stage: currentStage },
        }),
      ]);

      logger.info('Auto-cutoff executed', {
        userId,
        outlet1CommandId: outlet1Command.commandId,
        outlet1Channel: outlet1Command.channel,
        outlet2CommandId: outlet2Command.commandId,
        outlet2Channel: outlet2Command.channel,
      });
    }

    return null;

  } catch (error) {
    logger.error('Error handling safety alerts:', error);
    return null;
  }
}

module.exports = { handleSafetyAlerts };