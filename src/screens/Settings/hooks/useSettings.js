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
  notifications: true,
  darkMode: false,
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchSettings = useCallback(async (currentUserId) => {
    if (!currentUserId) {
      setSettings(DEFAULT_SETTINGS);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [preferencesResult, profileResult, budgetResult, outletsResult] = await Promise.all([
        userService.getUserPreferences(currentUserId),
        userService.getUserProfile(currentUserId),
        budgetService.getCurrentMonthBudget(currentUserId),
        outletService.getAllOutlets(currentUserId),
      ]);

      if (!preferencesResult.success) {
        throw new Error(preferencesResult.error);
      }

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
        electricityRate: preferencesResult.data.electricityRate || 0,
        currency: preferencesResult.data.currency || '₱',
        notifications: preferencesResult.data.notificationsEnabled ?? true,
        darkMode: preferencesResult.data.darkMode || false,
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
      setError(err.message);
      console.error('Error fetching settings:', err);
      setSettings(DEFAULT_SETTINGS);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load settings once auth is available and refresh on auth changes.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      fetchSettings(user?.uid || null);
    });

    return unsubscribe;
  }, [fetchSettings]);

  // Update electricity rate
  const updateElectricityRate = useCallback(async (rate) => {
    setError(null);
    
    try {
      const userId = auth.currentUser?.uid;
      if (!userId) throw new Error('User not authenticated');

      const result = await userService.updateUserPreferences(userId, {
        electricityRate: parseFloat(rate)
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      setSettings(prev => ({ ...prev, electricityRate: parseFloat(rate) }));
      return { success: true };
    } catch (err) {
      setError(err.message);
      console.error('Error updating electricity rate:', err);
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

  return {
    settings,
    loading,
    error,
    fetchSettings,
    updateElectricityRate,
    updateNotifications,
    updateDeviceSettings,
    clearDeviceSettings,
    updateOutletName,
  };
};