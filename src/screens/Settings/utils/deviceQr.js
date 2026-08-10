/**
 * Parses the QR payload printed on / flashed to an ESP32 unit.
 *
 * Three encodings are accepted so the same scanner works regardless of how the
 * code was produced:
 *   1. JSON      {"deviceId":"ESP32_ROOM_A","token":"abc..."}
 *   2. URI       wattwise://device?deviceId=ESP32_ROOM_A&token=abc...
 *   3. Delimited ESP32_ROOM_A|abc...
 *
 * Returns { success, deviceId, token } or { success: false, error }.
 */

// Mirrors the minimum length enforced by the manual entry modal.
const MIN_TOKEN_LENGTH = 8;
const MAX_FIELD_LENGTH = 128;

const clean = (value) => String(value ?? '').trim().slice(0, MAX_FIELD_LENGTH);

const buildResult = (rawDeviceId, rawToken) => {
  const deviceId = clean(rawDeviceId);
  const token = clean(rawToken);

  if (!deviceId) {
    return { success: false, error: 'This QR code has no device ID.' };
  }

  if (!token) {
    return { success: false, error: 'This QR code has no device token.' };
  }

  if (token.length < MIN_TOKEN_LENGTH) {
    return { success: false, error: 'The device token in this QR code is too short.' };
  }

  return { success: true, deviceId, token };
};

const parseQueryString = (query) => {
  const params = {};

  String(query || '')
    .split('&')
    .forEach((pair) => {
      if (!pair) return;
      const [key, ...rest] = pair.split('=');
      if (!key) return;
      try {
        params[decodeURIComponent(key).toLowerCase()] = decodeURIComponent(rest.join('='));
      } catch {
        // A malformed escape sequence should not abort the whole scan.
        params[key.toLowerCase()] = rest.join('=');
      }
    });

  return params;
};

export const parseDeviceQrPayload = (raw) => {
  const value = String(raw ?? '').trim();

  if (!value) {
    return { success: false, error: 'Empty QR code.' };
  }

  // 1. JSON
  if (value.startsWith('{')) {
    try {
      const parsed = JSON.parse(value);
      return buildResult(
        parsed.deviceId ?? parsed.device_id ?? parsed.id,
        parsed.token ?? parsed.deviceToken ?? parsed.device_token
      );
    } catch {
      return { success: false, error: 'This QR code is not valid WattWise data.' };
    }
  }

  // 2. URI with query parameters
  if (value.includes('?') && value.includes('=')) {
    const params = parseQueryString(value.slice(value.indexOf('?') + 1));
    return buildResult(
      params.deviceid ?? params.device_id ?? params.id,
      params.token ?? params.devicetoken ?? params.device_token
    );
  }

  // 3. Delimited pair
  const separator = ['|', ',', ';'].find((candidate) => value.includes(candidate));
  if (separator) {
    const [deviceId, token] = value.split(separator);
    return buildResult(deviceId, token);
  }

  return {
    success: false,
    error: 'Unrecognised QR code. Scan the code supplied with your WattWise device.',
  };
};

export const DEVICE_QR_MIN_TOKEN_LENGTH = MIN_TOKEN_LENGTH;
