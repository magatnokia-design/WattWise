const admin = require('firebase-admin');
const logger = require('firebase-functions/logger');
const {
  DeviceRequestError,
  parseIncomingTimestampMs,
  assertFreshTimestamp,
  validateDeviceRequest,
} = require('../lib/deviceSecurity');

const TERMINAL_ACK_STATUS = new Set(['executed', 'failed', 'rejected', 'timeout']);

/**
 * HTTP endpoint for ESP32 to poll the latest command.
 * POST /getDeviceCommand
 * Body: {
 *   deviceId: string,
 *   deviceToken?: string,
 *   timestamp: number,
 *   lastCommandId?: string
 * }
 */
async function getDeviceCommand(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const {
      deviceId,
      deviceToken,
      timestamp,
      lastCommandId,
    } = req.body || {};

    const requestToken = String(req.get('x-device-token') || deviceToken || '').trim();
    const timestampMs = parseIncomingTimestampMs(timestamp);
    const now = Date.now();

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

    const deviceRef = db.doc(`devices/${normalizedDeviceId}`);
    const deviceDoc = await deviceRef.get();
    const deviceData = deviceDoc.exists ? (deviceDoc.data() || {}) : {};

    const latestCommandId = String(deviceData.lastCommandId || '').trim();
    const latestCommandIssuedAtMs = Number(deviceData.lastCommandIssuedAtMs || 0);
    const lastAckCommandId = String(deviceData.lastAckCommandId || '').trim();
    const clientLastCommandId = String(lastCommandId || '').trim();

    if (!latestCommandId || latestCommandId === lastAckCommandId || latestCommandId === clientLastCommandId) {
      return res.status(200).json({
        success: true,
        hasCommand: false,
      });
    }

    const commandRef = db.doc(`users/${userId}/device_commands/${latestCommandId}`);
    const commandDoc = await commandRef.get();

    if (!commandDoc.exists) {
      return res.status(200).json({
        success: true,
        hasCommand: false,
      });
    }

    const commandData = commandDoc.data() || {};
    const commandDeviceId = String(commandData.deviceId || '').trim();
    if (commandDeviceId && commandDeviceId !== normalizedDeviceId) {
      return res.status(403).json({
        success: false,
        error: 'Command does not belong to this device',
      });
    }

    const delivery = commandData.delivery || {};
    const ackStatus = String(delivery.lastAckStatus || commandData.acknowledgment?.status || '').trim().toLowerCase();
    if (TERMINAL_ACK_STATUS.has(ackStatus)) {
      return res.status(200).json({
        success: true,
        hasCommand: false,
      });
    }

    const deadlineAtMs = Number(delivery.deadlineAtMs || 0);
    if (deadlineAtMs && now > deadlineAtMs) {
      await commandRef.set({
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

      await deviceRef.set({
        lastCommandTimeoutId: latestCommandId,
        lastCommandTimeoutAtMs: now,
        health: {
          status: 'degraded',
          statusReason: 'command_timeout',
          lastSeenAtMs: Number(deviceData.lastSeenAtMs || 0) || now,
          lastCommandTimeoutAtMs: now,
          updatedAtMs: now,
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      return res.status(200).json({
        success: true,
        hasCommand: false,
      });
    }

    return res.status(200).json({
      success: true,
      hasCommand: true,
      command: {
        commandId: latestCommandId,
        action: String(commandData.action || '').trim().toLowerCase(),
        outletId: String(commandData.outletId || '').trim(),
        reason: String(commandData.reason || '').trim(),
        source: String(commandData.source || '').trim(),
        issuedAtMs: Number(commandData.issuedAtMs || latestCommandIssuedAtMs || now),
      },
    });
  } catch (error) {
    if (error instanceof DeviceRequestError) {
      return res.status(error.statusCode).json({
        success: false,
        error: error.message,
      });
    }

    logger.error('Error getting device command:', {
      message: error?.message,
      stack: error?.stack,
    });

    return res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
}

module.exports = { getDeviceCommand };