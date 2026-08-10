import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { COLORS } from '../../constants/colors';

// Safety cutoffs matter even while the user is staring at the app, so a
// notification that arrives in the foreground is still shown rather than
// swallowed. Registered at module load, which is what expo-notifications
// expects - it must be set before the first notification can arrive.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Must match the `channelId` that functions/src/lib/pushSender.js sends.
// Android drops notifications addressed to a channel that does not exist.
const ANDROID_CHANNEL_ID = 'default';

// EAS injects the project ID into the manifest at build time; `easConfig` is
// the fallback shape used by some dev-client builds.
const resolveProjectId = () =>
  Constants?.expoConfig?.extra?.eas?.projectId ||
  Constants?.easConfig?.projectId ||
  null;

export const pushNotificationService = {
  // Android needs the channel to exist before the first notification lands, and
  // creating it is idempotent, so this runs on every registration.
  configureAndroidChannel: async () => {
    if (Platform.OS !== 'android') return;

    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: 'WattWise alerts',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: COLORS.primary,
    });
  },

  // Returns true only once the user has actually granted permission. On Android
  // 13+ this is what surfaces the POST_NOTIFICATIONS prompt.
  requestPermission: async () => {
    const existing = await Notifications.getPermissionsAsync();
    if (existing.granted) return true;

    // Don't nag: if the user has explicitly denied and the OS won't ask again,
    // requesting a second time silently resolves to denied anyway.
    if (!existing.canAskAgain) return false;

    const requested = await Notifications.requestPermissionsAsync();
    return requested.granted;
  },

  /**
   * Full registration: permission -> Expo push token.
   *
   * Returns `{ success, token, reason }` rather than throwing, so a device that
   * can't do push (emulator, denied permission) degrades to email plus in-app
   * notifications instead of breaking sign-in.
   */
  registerForPushNotifications: async () => {
    // Push tokens can't be issued to emulators or simulators.
    if (!Device.isDevice) {
      return { success: false, reason: 'not_a_physical_device' };
    }

    try {
      await pushNotificationService.configureAndroidChannel();

      const granted = await pushNotificationService.requestPermission();
      if (!granted) {
        return { success: false, reason: 'permission_denied' };
      }

      const projectId = resolveProjectId();
      if (!projectId) {
        return { success: false, reason: 'missing_project_id' };
      }

      const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
      if (!token) {
        return { success: false, reason: 'no_token_returned' };
      }

      return { success: true, token };
    } catch (error) {
      console.error('Push registration failed:', error);
      return { success: false, reason: 'error', error: error.message };
    }
  },
};
