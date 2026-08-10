// Push Notification Registration
import { useEffect, useRef, useState } from 'react';

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

  useEffect(() => {
    // Logging out clears the marker, so signing back in re-registers - the
    // token was removed from Firestore on the way out.
    if (!userId) {
      registeredForRef.current = null;
      setStatus('idle');
      return;
    }

    if (registeredForRef.current === userId) return;
    registeredForRef.current = userId;

    let cancelled = false;

    const register = async () => {
      const result = await pushNotificationService.registerForPushNotifications();
      if (cancelled) return;

      if (!result.success) {
        // Allow a later attempt - permission may be granted from OS settings.
        registeredForRef.current = null;
        setStatus(result.reason || 'unavailable');
        return;
      }

      const saved = await userService.savePushToken(userId, result.token);
      if (cancelled) return;

      if (!saved.success) {
        registeredForRef.current = null;
        setStatus('save_failed');
        return;
      }

      setActivePushToken(result.token);
      setStatus('registered');
    };

    register();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return { status };
};
