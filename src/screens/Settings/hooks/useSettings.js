import { useState, useCallback, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { userService, budgetService, outletService } from '../../../services/firebase';
import { auth } from '../../../services/firebase/config';

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

      const authUser = auth.currentUser;

      setSettings({
        electricityRate: preferencesResult.data.electricityRate || 0,
        currency: preferencesResult.data.currency || '₱',
        notifications: preferencesResult.data.notificationsEnabled ?? true,
        darkMode: preferencesResult.data.darkMode || false,
        monthlyBudget: Number(budgetData.monthlyBudget || profileData.monthlyBudget || 0),
        profileName: profileData.name || authUser?.displayName || 'User',
        email: profileData.email || authUser?.email || '',
        outlet1Name: outletsData.outlet1?.applianceName || 'Outlet 1',
        outlet2Name: outletsData.outlet2?.applianceName || 'Outlet 2',
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

  // Update device settings (for future ESP32 integration)
  const updateDeviceSettings = useCallback(async (deviceData) => {
    setError(null);
    
    try {
      const userId = auth.currentUser?.uid;
      if (!userId) throw new Error('User not authenticated');

      // TODO: ESP32 integration - send command to Firebase for ESP32 to read
      console.log('Update device settings:', deviceData);
      return { success: true };
    } catch (err) {
      setError(err.message);
      console.error('Error updating device settings:', err);
      return { success: false, error: err.message };
    }
  }, []);

  const updateOutletName = useCallback(async (outletNumber, newName) => {
    setError(null);

    try {
      const userId = auth.currentUser?.uid;
      if (!userId) throw new Error('User not authenticated');

      const sanitizedName = String(newName || '').trim();
      if (!sanitizedName) {
        throw new Error('Outlet name is required');
      }

      const result = await outletService.updateApplianceName(userId, outletNumber, sanitizedName);

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
    updateOutletName,
  };
};