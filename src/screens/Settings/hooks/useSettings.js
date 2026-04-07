import { useState, useCallback, useEffect } from 'react';
import { userService } from '../../../services/firebase';
import { auth } from '../../../services/firebase/config';

const DEFAULT_SETTINGS = {
  electricityRate: 0,
  currency: '₱',
  notifications: true,
  darkMode: false,
};

export const useSettings = () => {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Load settings on mount
  useEffect(() => {
    fetchSettings();
  }, []);

  // Fetch settings
  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const userId = auth.currentUser?.uid;
      if (!userId) throw new Error('User not authenticated');

      const result = await userService.getUserPreferences(userId);

      if (!result.success) {
        throw new Error(result.error);
      }

      setSettings({
        electricityRate: result.data.electricityRate || 0,
        currency: result.data.currency || '₱',
        notifications: result.data.notificationsEnabled ?? true,
        darkMode: result.data.darkMode || false,
      });
    } catch (err) {
      setError(err.message);
      console.error('Error fetching settings:', err);
      setSettings(DEFAULT_SETTINGS);
    } finally {
      setLoading(false);
    }
  }, []);

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

  return {
    settings,
    loading,
    error,
    fetchSettings,
    updateElectricityRate,
    updateNotifications,
    updateDeviceSettings,
  };
};