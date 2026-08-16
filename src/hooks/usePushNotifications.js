// Push Notification Registration
import { useEffect, useRef, useState, useCallback } from 'react';
import { AppState } from 'react-native';

import { pushNotificationService } from '../services/notifications/pushNotificationService';
import { setActivePushToken } from '../services/notifications/activePushToken';
import { userService } from '../services/firebase/userService';

/**
 * Registers the signed-in account for push on this device and keeps the token
 * stored on the user document, where `handlePushNotifications` reads it.
 *
 * Registration is deliberately best-effort: a denied permission or an emulator
 * leaves the user on email plus in-app notifications rather than blocking the
 * app. `status` is exposed mainly so Settings can explain why push is off.
 */
export const usePushNotifications = (userId) => {
  const [status, setStatus] = useState('idle');
  // The account this device has already registered for, so a re-render or a
  // navigation change doesn't re-request the token every time.
  const registeredForRef = useRef(null);

  // Guards against two registrations overlapping - the mount effect and a
  // foreground retry can both fire within a tick of each other.
  const inFlightRef = useRef(false);

  const register = useCallback(async (uid) => {
    if (!uid || inFlightRef.current) return;
    if (registeredForRef.current === uid) return;

    inFlightRef.current = true;
    registeredForRef.current = uid;

    try {
      const result = await pushNotificationService.registerForPushNotifications();

      if (!result.success) {
        // Allow a later attempt - permission may be granted from OS settings.
        registeredForRef.current = null;
        setStatus(result.reason || 'unavailable');
        return;
      }

      const saved = await userService.savePushToken(uid, result.token);
      if (!saved.success) {
        registeredForRef.current = null;
        setStatus('save_failed');
        return;
      }

      setActivePushToken(result.token);
      setStatus('registered');
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    // Logging out clears the marker, so signing back in re-registers - the
    // token was removed from Firestore on the way out.
    if (!userId) {
      registeredForRef.current = null;
      setStatus('idle');
      return;
    }

    register(userId);
  }, [userId, register]);

  /*
   * Retry when the app comes back to the foreground.
   *
   * The comment above says permission "may be granted from OS settings", and
   * nothing acted on that: the effect only re-ran when `userId` changed, so a
   * user who granted permission in Android settings and returned to the app
   * stayed unregistered until they killed and reopened it.
   *
   * That is not a corner case - it is the normal path on Android 13+ once
   * canAskAgain is false, because then requestPermission() returns denied
   * without ever showing a prompt, and OS settings is the only way in. The
   * account keeps whatever stale token it had from a previous install, which
   * Expo accepts and the device never receives.
   */
  useEffect(() => {
    if (!userId) return undefined;

    const subscription = AppState.addEventListener('change', (nextState) => {
      // Only when the last attempt left nothing registered.
      if (nextState === 'active' && registeredForRef.current === null) {
        register(userId);
      }
    });

    return () => subscription.remove();
  }, [userId, register]);

  return { status };
};
