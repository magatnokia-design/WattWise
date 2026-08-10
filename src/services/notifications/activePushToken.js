// The Expo push token for *this* device, once registered.
//
// Kept in its own module so `authService` can unregister on logout without
// importing expo-notifications - pulling the native module into the auth path
// would load it on screens that never need push.
let activePushToken = null;

export const setActivePushToken = (token) => {
  activePushToken = token || null;
};

export const getActivePushToken = () => activePushToken;

export const clearActivePushToken = () => {
  activePushToken = null;
};
