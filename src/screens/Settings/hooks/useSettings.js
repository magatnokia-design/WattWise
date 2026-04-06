// TODO: Connect to Firebase when backend is ready
import { useState, useCallback } from 'react';

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

  // TODO: Replace with Firebase fetch
  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      // Firebase fetch will go here
      setSettings(DEFAULT_SETTINGS);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // TODO: Replace with Firebase save
  const updateElectricityRate = useCallback(async (rate) => {
    try {
      // Firebase save will go here
      setSettings(prev => ({ ...prev, electricityRate: rate }));
    } catch (err) {
      setError(err.message);
    }
  }, []);

  // TODO: Replace with Firebase save
  const updateNotifications = useCallback(async (value) => {
    try {
      // Firebase save will go here
      setSettings(prev => ({ ...prev, notifications: value }));
    } catch (err) {
      setError(err.message);
    }
  }, []);

  // TODO: ESP32 device settings will go here
  const updateDeviceSettings = useCallback(async (deviceData) => {
    try {
      // ESP32 + Firebase save will go here
      console.log('Update device settings:', deviceData);
    } catch (err) {
      setError(err.message);
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