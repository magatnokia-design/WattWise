import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from './config';

const getSafetyRef = (userId) => doc(db, 'users', userId, 'power_safety', 'current');

const getDefaultSafetyData = () => ({
  currentStage: 'normal',
  protectionEnabled: true,
  autoProtectionEnabled: true,
  thresholds: {
    voltage: { min: 200, max: 250 },
    current: { max: 10 },
    power: { max: 2000 },
  },
  outlet1: {
    voltage: 0,
    current: 0,
    power: 0,
  },
  outlet2: {
    voltage: 0,
    current: 0,
    power: 0,
  },
  alerts: [],
  lastCutoff: null,
  lastUpdated: new Date(),
});

const normalizeThresholds = (rawThresholds = {}) => {
  if (rawThresholds?.voltage || rawThresholds?.current || rawThresholds?.power) {
    return {
      voltage: {
        min: Number(rawThresholds?.voltage?.min ?? 200),
        max: Number(rawThresholds?.voltage?.max ?? 250),
      },
      current: {
        max: Number(rawThresholds?.current?.max ?? 10),
      },
      power: {
        max: Number(rawThresholds?.power?.max ?? 2000),
      },
    };
  }

  return {
    voltage: {
      min: Number(rawThresholds?.voltageMin ?? 200),
      max: Number(rawThresholds?.voltageMax ?? 250),
    },
    current: {
      max: Number(rawThresholds?.currentMax ?? 10),
    },
    power: {
      max: Number(rawThresholds?.powerMax ?? 2000),
    },
  };
};

const normalizeSafetyData = (rawData = {}) => {
  const defaults = getDefaultSafetyData();
  const thresholds = normalizeThresholds(rawData.thresholds || rawData);
  const protectionEnabled = typeof rawData.protectionEnabled === 'boolean'
    ? rawData.protectionEnabled
    : (typeof rawData.autoProtectionEnabled === 'boolean'
      ? rawData.autoProtectionEnabled
      : defaults.protectionEnabled);

  return {
    ...defaults,
    ...rawData,
    thresholds,
    protectionEnabled,
    autoProtectionEnabled: protectionEnabled,
    outlet1: {
      ...defaults.outlet1,
      ...(rawData.outlet1 || {}),
    },
    outlet2: {
      ...defaults.outlet2,
      ...(rawData.outlet2 || {}),
    },
    alerts: Array.isArray(rawData.alerts) ? rawData.alerts : [],
  };
};

const getTimestampMs = (value) => {
  if (!value) return 0;
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
};

export const safetyService = {
  // Get power safety data
  getPowerSafety: async (userId) => {
    try {
      const safetyRef = getSafetyRef(userId);
      const safetyDoc = await getDoc(safetyRef);
      
      if (safetyDoc.exists()) {
        return { success: true, data: normalizeSafetyData(safetyDoc.data()) };
      }

      const defaultData = getDefaultSafetyData();
      await setDoc(safetyRef, defaultData, { merge: true });

      return {
        success: true,
        data: defaultData,
      };
    } catch (error) {
      console.error('Error getting power safety:', error);
      return { success: false, error: error.message };
    }
  },

  // Backward-compatible alias used by hooks
  getSafetyData: async (userId) => {
    return safetyService.getPowerSafety(userId);
  },

  // Real-time listener for power safety
  subscribeToPowerSafety: (userId, onUpdate, onError) => {
    const safetyRef = getSafetyRef(userId);
    
    return onSnapshot(
      safetyRef,
      (safetyDoc) => {
        if (safetyDoc.exists()) {
          onUpdate(normalizeSafetyData(safetyDoc.data()));
        } else {
          onUpdate(getDefaultSafetyData());
        }
      },
      (error) => {
        console.error('Error in power safety listener:', error);
        if (onError) onError(error);
      }
    );
  },

  // Backward-compatible alias used by hooks
  subscribeToSafetyData: (userId, onUpdate, onError) => {
    return safetyService.subscribeToPowerSafety(userId, onUpdate, onError);
  },

  // Backward-compatible alert history getter used by hooks
  getAlertHistory: async (userId, limitCount = 10) => {
    try {
      const safetyResult = await safetyService.getPowerSafety(userId);
      if (!safetyResult.success) return safetyResult;

      const alerts = [...(safetyResult.data.alerts || [])]
        .sort((a, b) => getTimestampMs(b.timestamp) - getTimestampMs(a.timestamp))
        .slice(0, limitCount)
        .map((alert, index) => ({
          id: alert.id || `alert_${index}`,
          type: alert.type || 'warning',
          title: alert.title || 'Safety Alert',
          message: alert.message || 'Safety threshold reached.',
          outlet: alert.outlet || null,
          timestamp: alert.timestamp || new Date(),
          ...alert,
        }));

      return { success: true, data: alerts };
    } catch (error) {
      console.error('Error getting alert history:', error);
      return { success: false, error: error.message };
    }
  },

  // Update auto protection setting
  updateAutoProtection: async (userId, enabled) => {
    try {
      const safetyRef = getSafetyRef(userId);
      await setDoc(safetyRef, {
        protectionEnabled: enabled,
        autoProtectionEnabled: enabled,
        lastUpdated: new Date(),
      }, { merge: true });
      return { success: true };
    } catch (error) {
      console.error('Error updating auto protection:', error);
      return { success: false, error: error.message };
    }
  },

  // Update safety thresholds
  updateThresholds: async (userId, updates) => {
    try {
      const safetyRef = getSafetyRef(userId);
      const payload = {
        lastUpdated: new Date(),
      };

      if (Object.prototype.hasOwnProperty.call(updates || {}, 'protectionEnabled')) {
        payload.protectionEnabled = !!updates.protectionEnabled;
        payload.autoProtectionEnabled = !!updates.protectionEnabled;
      }

      if (Object.prototype.hasOwnProperty.call(updates || {}, 'thresholds')) {
        payload.thresholds = normalizeThresholds(updates.thresholds);
      } else if (updates?.voltage || updates?.current || updates?.power || updates?.voltageMin || updates?.voltageMax || updates?.currentMax || updates?.powerMax) {
        payload.thresholds = normalizeThresholds(updates);
      }

      await setDoc(safetyRef, payload, { merge: true });
      return { success: true };
    } catch (error) {
      console.error('Error updating thresholds:', error);
      return { success: false, error: error.message };
    }
  },

  // Initialize power safety (called once after user registration)
  initializePowerSafety: async (userId) => {
    try {
      await setDoc(getSafetyRef(userId), getDefaultSafetyData(), { merge: true });
      return { success: true };
    } catch (error) {
      console.error('Error initializing power safety:', error);
      return { success: false, error: error.message };
    }
  },
};