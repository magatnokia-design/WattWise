const admin = require('firebase-admin');
const logger = require('firebase-functions/logger');

const COMMAND_ACK_TIMEOUT_MS = 45000;

const normalizeAction = (action) => {
  const normalized = String(action || '').trim().toLowerCase();
  if (normalized === 'on' || normalized === 'off') return normalized;
  throw new Error('Invalid command action: expected on/off');
};

const buildCommandPayload = ({ commandId, action, outletId, reason, source, metadata }) => ({
  commandId,
  action,
  outletId: outletId || null,
  reason: reason || 'manual',
  source: source || 'app',
  metadata: metadata || {},
});

const resolveTargetDeviceId = async (db, userId, explicitDeviceId = null) => {
  const normalizedExplicit = String(explicitDeviceId || '').trim();
  if (normalizedExplicit) return normalizedExplicit;

  const userDoc = await db.doc(`users/${userId}`).get();
  if (!userDoc.exists) return userId;

  const data = userDoc.data() || {};
  const linkedDeviceId = String(data.device?.deviceId || data.deviceId || '').trim();
  return linkedDeviceId || userId;
};

const dispatchDeviceCommand = async ({
  userId,
  deviceId = null,
  action,
  outletId = null,
  reason = 'manual',
  source = 'app',
  metadata = {},
}) => {
  if (!userId) {
    throw new Error('Missing userId for device command dispatch');
  }

  const normalizedAction = normalizeAction(action);
  const db = admin.firestore();
  const targetDeviceId = await resolveTargetDeviceId(db, userId, deviceId);
  const commandRef = db.collection(`users/${userId}/device_commands`).doc();
  const issuedAtMs = Date.now();
  const deadlineAtMs = issuedAtMs + COMMAND_ACK_TIMEOUT_MS;

  const payload = buildCommandPayload({
    commandId: commandRef.id,
    action: normalizedAction,
    outletId,
    reason,
    source,
    metadata,
  });

  await commandRef.set(
    {
      ...payload,
      deviceId: targetDeviceId,
      issuedAt: admin.firestore.FieldValue.serverTimestamp(),
      issuedAtMs,
      delivery: {
        status: 'pending',
        lastAckStatus: 'pending',
        channel: 'pending',
        timeoutMs: COMMAND_ACK_TIMEOUT_MS,
        deadlineAtMs,
        timedOut: false,
      },
    },
    { merge: true }
  );

  let channel = 'firestore';

  try {
    const rtdb = admin.database();
    const commandPath = outletId
      ? `devices/${targetDeviceId}/commands/${outletId}`
      : `devices/${targetDeviceId}/commands/system`;

    await rtdb.ref(commandPath).set({
      ...payload,
      deviceId: targetDeviceId,
      issuedAt: issuedAtMs,
    });

    await rtdb.ref(`devices/${targetDeviceId}/commands/_last`).set({
      commandId: commandRef.id,
      action: normalizedAction,
      reason,
      outletId: outletId || null,
      deviceId: targetDeviceId,
      issuedAt: issuedAtMs,
    });

    channel = 'firestore+rtdb';
  } catch (error) {
    logger.warn('RTDB command dispatch failed; command kept in Firestore queue', {
      userId,
      targetDeviceId,
      outletId,
      reason,
      message: error?.message,
    });
  }

  await commandRef.set(
    {
      delivery: {
        status: 'pending',
        lastAckStatus: 'pending',
        channel,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
    },
    { merge: true }
  );

  await db.doc(`devices/${targetDeviceId}`).set(
    {
      userId,
      deviceId: targetDeviceId,
      // Queued, not overwritten.
      //
      // `lastCommandId` is a single pointer, and getDeviceCommand followed it -
      // so of two commands issued inside one poll interval, only the later one
      // was ever reachable. The earlier document was written, never fetched, and
      // timed out, which then emailed the user about a failure the system had
      // caused itself.
      //
      // Observed from the UI: switching both outlets off a second apart left
      // outlet 1 running at 54 W with a delivery-failure notification, and it
      // took a second press to actually turn it off. The same race cut the wrong
      // outlet during an auto-cutoff; that was worked around in handleSafetyAlerts
      // by dispatching sequentially, which made the ordering deterministic but
      // still delivered only the last command. This is the actual fix.
      //
      // arrayUnion is atomic per element, so concurrent dispatches both land
      // without a transaction, and no composite index is needed.
      pendingCommandIds: admin.firestore.FieldValue.arrayUnion(commandRef.id),
      // Retained: the clients read it for "last command ack", and a device
      // fetching one command at a time still reports against it.
      lastCommandId: commandRef.id,
      lastCommandIssuedAtMs: issuedAtMs,
      lastCommandDeadlineAtMs: deadlineAtMs,
      lastCommand: {
        ...payload,
        deviceId: targetDeviceId,
        issuedAtMs,
        deadlineAtMs,
        channel,
      },
      health: {
        status: 'online',
        statusReason: 'command_dispatched',
        lastCommandIssuedAtMs: issuedAtMs,
        lastCommandId: commandRef.id,
        lastCommandDeadlineAtMs: deadlineAtMs,
        updatedAtMs: issuedAtMs,
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return {
    commandId: commandRef.id,
    channel,
    action: normalizedAction,
    deviceId: targetDeviceId,
    outletId,
  };
};

module.exports = {
  dispatchDeviceCommand,
};
