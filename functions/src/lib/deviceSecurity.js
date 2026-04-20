const MAX_TIMESTAMP_SKEW_MS = 15000;

class DeviceRequestError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = 'DeviceRequestError';
    this.statusCode = statusCode;
  }
}

const parseIncomingTimestampMs = (rawValue) => {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) return NaN;

  // Support both Unix seconds and milliseconds.
  if (parsed > 0 && parsed < 1e12) return parsed * 1000;
  return parsed;
};

const assertFreshTimestamp = (timestampMs, nowMs = Date.now()) => {
  if (!timestampMs || Number.isNaN(timestampMs)) {
    throw new DeviceRequestError(400, 'Invalid timestamp');
  }

  if (Math.abs(nowMs - timestampMs) > MAX_TIMESTAMP_SKEW_MS) {
    throw new DeviceRequestError(400, 'Invalid or stale timestamp');
  }
};

const parseMetric = (value, min, max) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < min || parsed > max) return null;
  return parsed;
};

const toEpochMs = (value) => {
  if (!value) return 0;

  if (typeof value?.toDate === 'function') {
    return value.toDate().getTime();
  }

  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;

  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const getRegisteredDeviceIds = (userData = {}) => {
  const ids = new Set();

  [
    userData.deviceId,
    userData.device?.deviceId,
    userData.esp32?.deviceId,
  ].forEach((value) => {
    const normalized = String(value || '').trim();
    if (normalized) ids.add(normalized);
  });

  return ids;
};

const addValidToken = (tokens, tokenValue) => {
  const normalized = String(tokenValue || '').trim();
  if (normalized) tokens.add(normalized);
};

const addGraceToken = (tokens, tokenValue, validUntilMs, nowMs) => {
  const expiresAtMs = toEpochMs(validUntilMs);
  if (!expiresAtMs || expiresAtMs <= nowMs) return;
  addValidToken(tokens, tokenValue);
};

const getRegisteredDeviceTokens = (userData = {}, resolvedDevice = {}, nowMs = Date.now()) => {
  const tokens = new Set();

  addValidToken(tokens, resolvedDevice.mappedToken);
  addGraceToken(
    tokens,
    resolvedDevice.mappedPreviousToken,
    resolvedDevice.mappedPreviousTokenValidUntilMs,
    nowMs
  );

  addValidToken(tokens, userData.deviceToken);
  addValidToken(tokens, userData.device?.token);
  addValidToken(tokens, userData.esp32?.token);

  addGraceToken(
    tokens,
    userData.previousDeviceToken || userData.device?.previousToken,
    userData.previousDeviceTokenValidUntilMs || userData.device?.previousTokenValidUntilMs,
    nowMs
  );

  return tokens;
};

const resolveUserByDeviceId = async (db, deviceId) => {
  const deviceRef = db.doc(`devices/${deviceId}`);
  const deviceDoc = await deviceRef.get();
  if (deviceDoc.exists) {
    const deviceData = deviceDoc.data() || {};
    const userId = String(deviceData.userId || '').trim();

    if (userId) {
      return {
        userId,
        mappedToken: String(deviceData.deviceToken || deviceData.token || '').trim() || null,
        mappedPreviousToken: String(deviceData.previousDeviceToken || deviceData.previousToken || '').trim() || null,
        mappedPreviousTokenValidUntilMs: toEpochMs(
          deviceData.previousDeviceTokenValidUntilMs || deviceData.previousTokenValidUntilMs
        ),
        source: 'devices_collection',
      };
    }
  }

  const lookupFields = ['deviceId', 'device.deviceId', 'esp32.deviceId'];
  let matchedUserDoc = null;

  for (const fieldPath of lookupFields) {
    const snapshot = await db
      .collection('users')
      .where(fieldPath, '==', deviceId)
      .limit(2)
      .get();

    if (snapshot.empty) continue;

    if (snapshot.size > 1) {
      throw new DeviceRequestError(409, `Ambiguous device assignment for field: ${fieldPath}`);
    }

    if (matchedUserDoc && matchedUserDoc.id !== snapshot.docs[0].id) {
      throw new DeviceRequestError(409, 'Ambiguous device assignment across user fields');
    }

    matchedUserDoc = snapshot.docs[0];
  }

  if (!matchedUserDoc) return null;

  return {
    userId: matchedUserDoc.id,
    mappedToken: null,
    source: 'users_collection',
  };
};

const validateDeviceRequest = async ({
  db,
  deviceId,
  requestToken,
  requireToken = true,
}) => {
  const normalizedDeviceId = String(deviceId || '').trim();
  if (!normalizedDeviceId) {
    throw new DeviceRequestError(400, 'Missing deviceId');
  }

  const resolvedDevice = await resolveUserByDeviceId(db, normalizedDeviceId);
  if (!resolvedDevice?.userId) {
    throw new DeviceRequestError(403, 'Device is not registered to any user');
  }

  const userId = resolvedDevice.userId;
  const userRef = db.doc(`users/${userId}`);
  const userDoc = await userRef.get();

  if (!userDoc.exists) {
    throw new DeviceRequestError(404, 'Registered device user profile not found');
  }

  const userData = userDoc.data() || {};
  const registeredDeviceIds = getRegisteredDeviceIds(userData);
  if (registeredDeviceIds.size > 0 && !registeredDeviceIds.has(normalizedDeviceId)) {
    throw new DeviceRequestError(403, 'Device is not linked to this user profile');
  }

  const normalizedToken = String(requestToken || '').trim();
  const expectedTokens = getRegisteredDeviceTokens(userData, resolvedDevice, Date.now());

  if (requireToken && expectedTokens.size === 0) {
    throw new DeviceRequestError(412, 'Device token is not configured. Link the ESP32 token in app settings.');
  }

  if (expectedTokens.size > 0 && !normalizedToken) {
    throw new DeviceRequestError(401, 'Missing device token');
  }

  if (expectedTokens.size > 0 && !expectedTokens.has(normalizedToken)) {
    throw new DeviceRequestError(401, 'Invalid device token');
  }

  return {
    userId,
    userRef,
    userData,
    resolvedDevice,
    normalizedDeviceId,
    normalizedToken,
  };
};

const enforceMetricsRateAndReplayGuards = async ({
  db,
  normalizedDeviceId,
  timestampMs,
  nowMs,
  minIntervalMs = 700,
}) => {
  const deviceRef = db.doc(`devices/${normalizedDeviceId}`);
  const deviceDoc = await deviceRef.get();
  const deviceData = deviceDoc.exists ? (deviceDoc.data() || {}) : {};

  const lastMetricsAtMs = Number(deviceData.lastMetricsAtMs || 0);
  if (lastMetricsAtMs && (nowMs - lastMetricsAtMs) < minIntervalMs) {
    throw new DeviceRequestError(429, 'Too many device updates. Slow down metric uploads.');
  }

  const lastPayloadTimestampMs = Number(deviceData.lastPayloadTimestampMs || 0);
  if (lastPayloadTimestampMs && timestampMs <= lastPayloadTimestampMs) {
    throw new DeviceRequestError(409, 'Replay or out-of-order device payload rejected');
  }
};

module.exports = {
  DeviceRequestError,
  MAX_TIMESTAMP_SKEW_MS,
  parseIncomingTimestampMs,
  assertFreshTimestamp,
  parseMetric,
  validateDeviceRequest,
  enforceMetricsRateAndReplayGuards,
};
