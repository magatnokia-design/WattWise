const admin = require('firebase-admin');
const logger = require('firebase-functions/logger');

const COMMAND_ACK_TIMEOUT_MS = 45000;
const MAX_STALE_COMMANDS_PER_USER = 30;

const TERMINAL_ACK_STATUS = new Set(['executed', 'failed', 'rejected', 'timeout']);

async function markStaleDeviceCommands() {
  const db = admin.firestore();
  const now = Date.now();
  const cutoffMs = now - COMMAND_ACK_TIMEOUT_MS;

  let usersProcessed = 0;
  let timedOutCount = 0;

  try {
    const usersSnapshot = await db.collection('users').get();
    usersProcessed = usersSnapshot.size;

    const userTasks = usersSnapshot.docs.map(async (userDoc) => {
      const userId = userDoc.id;
      const commandsRef = db.collection(`users/${userId}/device_commands`);

      const staleCandidates = await commandsRef
        .where('issuedAtMs', '<=', cutoffMs)
        .orderBy('issuedAtMs', 'desc')
        .limit(MAX_STALE_COMMANDS_PER_USER)
        .get();

      if (staleCandidates.empty) {
        return;
      }

      const batch = db.batch();
      let hasWrites = false;

      staleCandidates.forEach((commandDoc) => {
        const commandData = commandDoc.data() || {};
        const delivery = commandData.delivery || {};

        const ackStatus = String(delivery.lastAckStatus || commandData.acknowledgment?.status || '')
          .trim()
          .toLowerCase();

        if (TERMINAL_ACK_STATUS.has(ackStatus)) {
          return;
        }

        const deadlineAtMs = Number(delivery.deadlineAtMs || (Number(commandData.issuedAtMs || 0) + COMMAND_ACK_TIMEOUT_MS));
        if (!deadlineAtMs || now <= deadlineAtMs) {
          return;
        }

        batch.set(commandDoc.ref, {
          delivery: {
            ...delivery,
            status: 'failed',
            lastAckStatus: 'timeout',
            timedOut: true,
            timedOutAtMs: now,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          acknowledgment: {
            ...(commandData.acknowledgment || {}),
            status: 'failed',
            details: 'Command timed out waiting for device acknowledgement',
            receivedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
        }, { merge: true });

        const commandId = commandDoc.id;
        const deviceId = String(commandData.deviceId || '').trim();
        if (deviceId) {
          batch.set(db.doc(`devices/${deviceId}`), {
            userId,
            deviceId,
            lastCommandTimeoutId: commandId,
            lastCommandTimeoutAtMs: now,
            health: {
              status: 'degraded',
              statusReason: 'command_timeout',
              lastCommandTimeoutAtMs: now,
              updatedAtMs: now,
            },
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });
        }

        timedOutCount += 1;
        hasWrites = true;
      });

      if (hasWrites) {
        await batch.commit();
      }
    });

    await Promise.all(userTasks);

    logger.info('Stale device command sweep completed', {
      usersProcessed,
      timedOutCount,
      cutoffMs,
    });

    return {
      success: true,
      usersProcessed,
      timedOutCount,
    };
  } catch (error) {
    logger.error('Error marking stale device commands', {
      message: error?.message,
      stack: error?.stack,
      usersProcessed,
      timedOutCount,
    });
    throw error;
  }
}

module.exports = { markStaleDeviceCommands };
