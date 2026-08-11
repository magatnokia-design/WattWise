import { useState, useCallback, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { userService, budgetService, outletService } from '../../../services/firebase';
import { auth } from '../../../services/firebase/config';

const toConfidencePercent = (rawConfidence) => {
  const parsed = Number(rawConfidence);
  if (!Number.isFinite(parsed)) return null;
  if (parsed > 1) return Math.max(0, Math.min(100, Math.round(parsed)));
  return Math.max(0, Math.min(100, Math.round(parsed * 100)));
};

const DEFAULT_SETTINGS = {
  electricityRate: 0,
  currency: '₱',
  rateProfileId: null,
  notifications: true,
  monthlyBudget: 0,
  profileName: 'User',
  email: '',
  outlet1Name: 'Outlet 1',
  outlet2Name: 'Outlet 2',
  outlet1SuggestedName: '',
  outlet2SuggestedName: '',
  outlet1SuggestionConfidence: null,
  outlet2SuggestionConfidence: null,
  esp32DeviceId: '',
  esp32DeviceToken: '',
  esp32Linked: false,
  esp32TokenSet: false,
  esp32HealthStatus: 'not_linked',
  esp32HealthReason: '',
  esp32LastSeenAtMs: 0,
  esp32LastAckStatus: '',
  esp32LastCommandTimeoutAtMs: 0,
};

export const useSettings = () => {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [savedAppliances, setSavedAppliances] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchSettings = useCallback(async (requestedUserId) => {
    // Called two ways, and they pass different things:
    //
    //   the auth listener  -> fetchSettings(user?.uid || null)
    //   the screen's focus -> fetchSettings()
    //
    // Treating both as "no user" made every return to the Settings tab reset
    // the screen to defaults. Real data loaded on first open, then navigating
    // to any other tab and back blanked the name, email, rate, budget and
    // device into "--" and "Not linked" - the account looked wiped, while
    // Firestore still held all of it.
    //
    // `undefined` means the caller did not say, so resolve the signed-in user.
    // An explicit `null` still means signed out, which is the only case that
    // should clear the screen.
    const currentUserId = requestedUserId === undefined
      ? (auth.currentUser?.uid || null)
      : requestedUserId;

    if (!currentUserId) {
      setSettings(DEFAULT_SETTINGS);
      setSavedAppliances([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [
        preferencesResult,
        profileResult,
        budgetResult,
        outletsResult,
        savedAppliancesResult,
      ] = await Promise.all([
        userService.getUserPreferences(currentUserId),
        userService.getUserProfile(currentUserId),
        budgetService.getCurrentMonthBudget(currentUserId),
        outletService.getAllOutlets(currentUserId),
        outletService.getSavedAppliances(currentUserId),
      ]);

      setSavedAppliances(savedAppliancesResult.success ? savedAppliancesResult.data : []);

      // Degrades like every other read here rather than throwing. A failed
      // preferences read used to blow up the whole load, and the catch below
      // reset every field to defaults - so one transient failure blanked the
      // name, email, rate, budget and device ID that four *successful* reads
      // had just returned. The screen looked like the account had been wiped.
      if (!preferencesResult.success) {
        setError(preferencesResult.error || 'Could not load your preferences.');
      }

      const preferencesData = preferencesResult.success
        ? (preferencesResult.data || {})
        : {};
      const profileData = profileResult.success ? (profileResult.data || {}) : {};
      const budgetData = budgetResult.success ? (budgetResult.data || {}) : {};
      const outletsData = outletsResult.success ? (outletsResult.data || {}) : {};
      const outlet1Name = outletsData.outlet1?.applianceName || 'Outlet 1';
      const outlet2Name = outletsData.outlet2?.applianceName || 'Outlet 2';
      const outlet1SuggestedName = String(outletsData.outlet1?.autoDetectedAppliance || '').trim();
      const outlet2SuggestedName = String(outletsData.outlet2?.autoDetectedAppliance || '').trim();
      const outlet1SuggestionConfidence = toConfidencePercent(outletsData.outlet1?.applianceDetection?.confidence);
      const outlet2SuggestionConfidence = toConfidencePercent(outletsData.outlet2?.applianceDetection?.confidence);
      const deviceId = String(profileData.device?.deviceId || profileData.deviceId || '').trim();
      const deviceToken = String(profileData.device?.token || profileData.deviceToken || '').trim();
      const deviceHealthResult = await userService.getDeviceHealth(deviceId);
      const deviceHealth = deviceHealthResult.success ? (deviceHealthResult.data || {}) : {};

      const authUser = auth.currentUser;

      setSettings({
        electricityRate: preferencesData.electricityRate || 0,
        currency: preferencesData.currency || '₱',
        rateProfileId: preferencesData.rateProfileId || null,
        supplyRates: preferencesData.supplyRates || null,
        hasSupplyRates: preferencesData.hasSupplyRates === true,
        notifications: preferencesData.notificationsEnabled ?? true,
        monthlyBudget: Number(budgetData.monthlyBudget || profileData.monthlyBudget || 0),
        profileName: profileData.name || authUser?.displayName || 'User',
        email: profileData.email || authUser?.email || '',
        outlet1Name,
        outlet2Name,
        outlet1SuggestedName,
        outlet2SuggestedName,
        outlet1SuggestionConfidence,
        outlet2SuggestionConfidence,
        esp32DeviceId: deviceId,
        esp32DeviceToken: deviceToken,
        esp32Linked: !!deviceId,
        esp32TokenSet: !!deviceToken,
        esp32HealthStatus: String(deviceHealth.status || '').trim() || (deviceId ? 'offline' : 'not_linked'),
        esp32HealthReason: String(deviceHealth.statusReason || '').trim(),
        esp32LastSeenAtMs: Number(deviceHealth.lastSeenAtMs || 0),
        esp32LastAckStatus: String(deviceHealth.lastAckStatus || '').trim(),
        esp32LastCommandTimeoutAtMs: Number(deviceHealth.lastCommandTimeoutAtMs || 0),
      });
    } catch (err) {
      // Deliberately keeps whatever is already on screen. Blanking to defaults
      // on a failed refresh is worse than showing slightly stale values: it
      // reads as "your account is empty" rather than "this refresh failed",
      // and the data was correct a second earlier. Sign-out clears state via
      // the !currentUserId branch above, which is the only case that should.
      setError(err.message);
      console.error('Error fetching settings:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load settings once auth is available and refresh on auth changes. Saved
  // appliances additionally stay subscribed: they are written by a Cloud
  // Function when a suggestion is confirmed, and Settings stays mounted as a
  // tab, so a one-shot read only caught up on the next app launch.
  useEffect(() => {
    let unsubscribeSavedAppliances = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (unsubscribeSavedAppliances) {
        unsubscribeSavedAppliances();
        unsubscribeSavedAppliances = null;
      }

      fetchSettings(user?.uid || null);

      if (user?.uid) {
        unsubscribeSavedAppliances = outletService.subscribeToSavedAppliances(
          user.uid,
          setSavedAppliances
        );
      }
    });

    return () => {
      if (unsubscribeSavedAppliances) unsubscribeSavedAppliances();
      unsubscribeAuth();
    };
  }, [fetchSettings]);

  // Saves the PELCO III Block 1 rates that every peso figure in the app is
  // priced against.
  const updateSupplyRates = useCallback(async (rates) => {
    setError(null);

    try {
      const userId = auth.currentUser?.uid;
      if (!userId) throw new Error('User not authenticated');

      const result = await userService.updateSupplyRates(userId, rates);
      if (!result.success) {
        throw new Error(result.error || 'Unable to save rates');
      }

      setSettings((prev) => ({
        ...prev,
        supplyRates: result.data,
        hasSupplyRates: true,
      }));

      return { success: true };
    } catch (err) {
      setError(err.message);
      console.error('Error updating supply rates:', err);
      return { success: false, error: err.message };
    }
  }, []);

  const updateRateProfile = useCallback(async (rateProfileId) => {
    setError(null);

    try {
      const userId = auth.currentUser?.uid;
      if (!userId) throw new Error('User not authenticated');

      const result = await userService.updateUserPreferences(userId, {
        rateProfileId: rateProfileId || null,
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      setSettings((prev) => ({
        ...prev,
        rateProfileId: rateProfileId || null,
      }));

      return { success: true };
    } catch (err) {
      setError(err.message);
      console.error('Error updating rate profile:', err);
      return { success: false, error: err.message };
    }
  }, []);

  // Update notifications
  const updateNotifications = useCallback(async (value) => {
    setError(null);
    
    try {
      const userId = auth.currentUser?.uid;
      if (!userId) throw new Error('User not authenticated');

      const result = await userService.updateUserPreferences(userId, {
        notificationsEnabled: value
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      setSettings(prev => ({ ...prev, notifications: value }));
      return { success: true };
    } catch (err) {
      setError(err.message);
      console.error('Error updating notifications:', err);
      return { success: false, error: err.message };
    }
  }, []);

  // Update ESP32 device settings
  const updateDeviceSettings = useCallback(async (deviceData) => {
    setError(null);
    
    try {
      const userId = auth.currentUser?.uid;
      if (!userId) throw new Error('User not authenticated');

      const result = await userService.updateDeviceConfig(userId, {
        deviceId: String(deviceData?.deviceId || '').trim(),
        deviceToken: String(deviceData?.deviceToken || '').trim(),
      });

      if (!result.success) {
        throw new Error(result.error || 'Unable to save device settings');
      }

      setSettings((prev) => ({
        ...prev,
        esp32DeviceId: String(deviceData?.deviceId || '').trim(),
        esp32DeviceToken: String(deviceData?.deviceToken || '').trim(),
        esp32Linked: !!String(deviceData?.deviceId || '').trim(),
        esp32TokenSet: !!String(deviceData?.deviceToken || '').trim(),
        esp32HealthStatus: 'online',
        esp32HealthReason: 'linked',
        esp32LastSeenAtMs: Date.now(),
        esp32LastAckStatus: prev.esp32LastAckStatus,
        esp32LastCommandTimeoutAtMs: prev.esp32LastCommandTimeoutAtMs,
      }));

      return { success: true };
    } catch (err) {
      setError(err.message);
      console.error('Error updating device settings:', err);
      return { success: false, error: err.message };
    }
  }, []);

  const clearDeviceSettings = useCallback(async () => {
    setError(null);

    try {
      const userId = auth.currentUser?.uid;
      if (!userId) throw new Error('User not authenticated');

      const result = await userService.clearDeviceConfig(userId);
      if (!result.success) {
        throw new Error(result.error || 'Unable to clear device settings');
      }

      setSettings((prev) => ({
        ...prev,
        esp32DeviceId: '',
        esp32DeviceToken: '',
        esp32Linked: false,
        esp32TokenSet: false,
        esp32HealthStatus: 'not_linked',
        esp32HealthReason: '',
        esp32LastSeenAtMs: 0,
        esp32LastAckStatus: '',
        esp32LastCommandTimeoutAtMs: 0,
      }));

      return { success: true };
    } catch (err) {
      setError(err.message);
      console.error('Error clearing device settings:', err);
      return { success: false, error: err.message };
    }
  }, []);

  const updateOutletName = useCallback(async (outletNumber, newName, options = {}) => {
    setError(null);

    try {
      const userId = auth.currentUser?.uid;
      if (!userId) throw new Error('User not authenticated');

      const sanitizedName = String(newName || '').trim();
      if (!sanitizedName) {
        throw new Error('Outlet name is required');
      }

      const result = await outletService.updateApplianceName(userId, outletNumber, sanitizedName, options);

      if (!result.success) {
        throw new Error(result.error);
      }

      setSettings((prev) => ({
        ...prev,
        outlet1Name: outletNumber === 1 ? sanitizedName : prev.outlet1Name,
        outlet2Name: outletNumber === 2 ? sanitizedName : prev.outlet2Name,
      }));

      return { success: true };
    } catch (err) {
      setError(err.message);
      console.error('Error updating outlet name:', err);
      return { success: false, error: err.message };
    }
  }, []);

  const clearOutletDetection = useCallback(async (outletNumber) => {
    setError(null);

    try {
      const userId = auth.currentUser?.uid;
      if (!userId) throw new Error('User not authenticated');

      const normalizedOutletNumber = outletNumber === 1 || outletNumber === 2
        ? outletNumber
        : null;
      const result = await outletService.clearAutoDetection(userId, normalizedOutletNumber);

      if (!result.success) {
        throw new Error(result.error || 'Unable to clear auto detection');
      }

      const clearAll = !normalizedOutletNumber;

      setSettings((prev) => ({
        ...prev,
        outlet1SuggestedName: clearAll || normalizedOutletNumber === 1 ? '' : prev.outlet1SuggestedName,
        outlet2SuggestedName: clearAll || normalizedOutletNumber === 2 ? '' : prev.outlet2SuggestedName,
        outlet1SuggestionConfidence: clearAll || normalizedOutletNumber === 1 ? null : prev.outlet1SuggestionConfidence,
        outlet2SuggestionConfidence: clearAll || normalizedOutletNumber === 2 ? null : prev.outlet2SuggestionConfidence,
      }));

      return { success: true };
    } catch (err) {
      setError(err.message);
      console.error('Error clearing outlet detection:', err);
      return { success: false, error: err.message };
    }
  }, []);

  // Remove one learned appliance signature. Goes through a callable because
  // applianceProfiles lives on the user document, which the client cannot write.
  const removeSavedAppliance = useCallback(async (label) => {
    setError(null);

    try {
      const userId = auth.currentUser?.uid;
      if (!userId) throw new Error('User not authenticated');

      const result = await outletService.removeApplianceProfile(userId, label);
      if (!result.success) {
        throw new Error(result.error || 'Unable to remove saved appliance');
      }

      setSavedAppliances((previous) => previous.filter(
        (appliance) => appliance.label.toLowerCase() !== String(label || '').trim().toLowerCase()
      ));

      return { success: true };
    } catch (err) {
      setError(err.message);
      console.error('Error removing saved appliance:', err);
      return { success: false, error: err.message };
    }
  }, []);

  return {
    settings,
    savedAppliances,
    loading,
    error,
    fetchSettings,
    updateSupplyRates,
    updateRateProfile,
    updateNotifications,
    updateDeviceSettings,
    clearDeviceSettings,
    updateOutletName,
    clearOutletDetection,
    removeSavedAppliance,
  };
};