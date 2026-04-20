const admin = require('firebase-admin');
const logger = require('firebase-functions/logger');
const {
  DeviceRequestError,
  parseIncomingTimestampMs,
  assertFreshTimestamp,
  validateDeviceRequest,
} = require('../lib/deviceSecurity');

const ALLOWED_ACK_STATUS = new Set(['delivered', 'executed', 'failed', 'rejected']);

const resolveDeliveryStateFromAck = (ackStatus) => {
  if (ackStatus === 'executed') return 'completed';
  if (ackStatus === 'delivered') return 'delivered';
  return 'failed';
};

const resolveHealthStatusFromAck = (ackStatus) => {
  if (ackStatus === 'executed' || ackStatus === 'delivered') return 'online';
  return 'degraded';
};

async function ackDeviceCommand(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const {
      deviceId,
      commandId,
      status,
      details,
      timestamp,
      deviceToken,
    } = req.body || {};

    const normalizedStatus = String(status || '').trim().toLowerCase();
    const normalizedCommandId = String(commandId || '').trim();
    const requestToken = String(req.get('x-device-token') || deviceToken || '').trim();
    const timestampMs = parseIncomingTimestampMs(timestamp);
    const now = Date.now();

    if (!deviceId || !normalizedCommandId || !normalizedStatus) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: deviceId, commandId, status',
      });
    }

    if (!ALLOWED_ACK_STATUS.has(normalizedStatus)) {
      return res.status(400).json({
        success: false,
        error: `Invalid ack status. Allowed: ${Array.from(ALLOWED_ACK_STATUS).join(', ')}`,
      });
    }

    assertFreshTimestamp(timestampMs, now);

    const db = admin.firestore();
    const {
      userId,
      normalizedDeviceId,
    } = await validateDeviceRequest({
      db,
      deviceId,
      requestToken,
      requireToken: true,
    });

    const commandRef = db.doc(`users/${userId}/device_commands/${normalizedCommandId}`);
    const commandDoc = await commandRef.get();

    if (!commandDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Command not found',
      });
    }

    const commandData = commandDoc.data() || {};
    const commandDeviceId = String(commandData.deviceId || '').trim();
    const wasTimedOut = !!commandData.delivery?.timedOut;

    if (commandDeviceId && commandDeviceId !== normalizedDeviceId) {
      return res.status(403).json({
        success: false,
        error: 'Command does not belong to this device',
      });
    }

    await commandRef.set({
      acknowledgment: {
        status: normalizedStatus,
        details: details || null,
        deviceId: normalizedDeviceId,
        commandId: normalizedCommandId,
        deviceTimestampMs: timestampMs,
        receivedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      delivery: {
        ...(commandData.delivery || {}),
        status: resolveDeliveryStateFromAck(normalizedStatus),
        lastAckStatus: normalizedStatus,
        acknowledgedAt: admin.firestore.FieldValue.serverTimestamp(),
        timedOut: false,
        lateAck: wasTimedOut,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      ...(normalizedStatus === 'executed'
        ? { executedAt: admin.firestore.FieldValue.serverTimestamp() }
        : {}),
    }, { merge: true });

    await db.doc(`devices/${normalizedDeviceId}`).set({
      userId,
      deviceId: normalizedDeviceId,
      lastAckAtMs: now,
      lastAckCommandId: normalizedCommandId,
      lastAckStatus: normalizedStatus,
      lastSeenAtMs: now,
      lastSeenAt: admin.firestore.FieldValue.serverTimestamp(),
      health: {
        status: resolveHealthStatusFromAck(normalizedStatus),
        statusReason: `ack_${normalizedStatus}`,
        lastSeenAtMs: now,
        lastAckAtMs: now,
        lastAckStatus: normalizedStatus,
        updatedAtMs: now,
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    try {
      const rtdb = admin.database();
      await rtdb.ref(`devices/${normalizedDeviceId}/acks/${normalizedCommandId}`).set({
        commandId: normalizedCommandId,
        status: normalizedStatus,
        details: details || null,
        deviceTimestampMs: timestampMs,
        receivedAtMs: now,
      });
    } catch (rtdbError) {
      logger.warn('Ack mirrored only to Firestore (RTDB mirror failed)', {
        userId,
        normalizedDeviceId,
        normalizedCommandId,
        message: rtdbError?.message,
      });
    }

    logger.info('Device command acknowledged', {
      userId,
      deviceId: normalizedDeviceId,
      commandId: normalizedCommandId,
      status: normalizedStatus,
    });

    return res.status(200).json({
      success: true,
      message: 'Command acknowledgement recorded',
      commandId: normalizedCommandId,
      status: normalizedStatus,
    });
  } catch (error) {
    if (error instanceof DeviceRequestError) {
      return res.status(error.statusCode).json({
        success: false,
        error: error.message,
      });
    }

    logger.error('Error acknowledging command:', {
      message: error?.message,
      stack: error?.stack,
    });

    return res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
}

module.exports = { ackDeviceCommand };
