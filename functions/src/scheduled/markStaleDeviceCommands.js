const admin = require('firebase-admin');
const logger = require('firebase-functions/logger');

const COMMAND_ACK_TIMEOUT_MS = 45000;
const MAX_STALE_COMMANDS_PER_USER = 30;

const TERMINAL_ACK_STATUS = new Set(['executed', 'failed', 'rejected', 'timeout']);

// What deviceCommandDispatcher writes into delivery.status when it queues a
// command. Kept as a named constant because the sweep below now filters on it:
// if the dispatcher's literal ever changes, this one has to change with it or
// the sweep silently stops finding anything.
const PENDING_DELIVERY_STATUS = 'pending';

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

      // Only commands still waiting on the device.
      //
      // Without this filter the query fetched the newest 30 commands older than
      // the cutoff on every run, whatever state they were in, and the loop below
      // discarded nearly all of them as already terminal. Cheap while a user has
      // little history and permanently expensive afterwards: once an account
      // holds 30+ commands it costs a flat 30 reads a minute, about 173,000 reads
      // a day across four accounts, which is over the free allowance on its own.
      //
      // Safe to filter on. deviceCommandDispatcher has written
      // delivery.status: 'pending' since the collection's first commit
      // (53c64bc), and it is the only thing that creates these documents - the
      // ack and poll handlers only update ones that already exist - so no
      // command can be missing the field and be skipped by this.
      //
      // Requires the composite index (delivery.status ASC, issuedAtMs DESC) in
      // firestore.indexes.json. Deploy the index and let it finish building
      // before deploying this function, or every run throws.
      const staleCandidates = await commandsRef
        .where('delivery.status', '==', PENDING_DELIVERY_STATUS)
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
            // Timed out, so it is never going to be delivered. Left in the queue
            // it would be re-offered on every poll and hold up everything behind
            // it - this sweeper is the only thing that clears commands the device
            // never polled for at all.
            pendingCommandIds: admin.firestore.FieldValue.arrayRemove(commandId),
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
