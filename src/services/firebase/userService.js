import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from './config';

const DEFAULT_USER_PREFERENCES = {
  electricityRate: 0,
  currency: '₱',
  notificationsEnabled: true,
  darkMode: false,
  language: 'en',
};

const TOKEN_ROTATION_GRACE_MS = 15 * 60 * 1000;
const DEVICE_ONLINE_THRESHOLD_MS = 30 * 1000;
const DEVICE_DELAYED_THRESHOLD_MS = 3 * 60 * 1000;

const toEpochMs = (value) => {
  if (!value) return 0;

  if (typeof value?.toDate === 'function') {
    return value.toDate().getTime();
  }

  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;

  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const resolveDeviceHealthStatus = (lastSeenAtMs, nowMs = Date.now()) => {
  if (!lastSeenAtMs) return 'offline';
  const ageMs = Math.max(0, nowMs - lastSeenAtMs);
  if (ageMs <= DEVICE_ONLINE_THRESHOLD_MS) return 'online';
  if (ageMs <= DEVICE_DELAYED_THRESHOLD_MS) return 'delayed';
  return 'offline';
};

export const userService = {
  // Get user profile
  getUserProfile: async (userId) => {
    try {
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (userDoc.exists()) {
        return { success: true, data: userDoc.data() };
      }
      return { success: false, error: 'User not found' };
    } catch (error) {
      console.error('Error getting user profile:', error);
      return { success: false, error: error.message };
    }
  },

  // Create user profile (called after registration)
  createUserProfile: async (userId, userData) => {
    try {
      await setDoc(doc(db, 'users', userId), {
        uid: userId,
        email: userData.email,
        name: userData.name || '',
        createdAt: new Date(),
        lastLogin: new Date(),
        onboardingComplete: false,
        electricityRate: 0,
        monthlyBudget: 0,
        preferences: {
          notificationsEnabled: true,
          darkMode: false,
          language: 'en',
        },
      });
      return { success: true };
    } catch (error) {
      console.error('Error creating user profile:', error);
      return { success: false, error: error.message };
    }
  },

  // Update user profile
  updateUserProfile: async (userId, updates) => {
    try {
      await updateDoc(doc(db, 'users', userId), updates);
      return { success: true };
    } catch (error) {
      console.error('Error updating user profile:', error);
      return { success: false, error: error.message };
    }
  },

  // Update last login
  updateLastLogin: async (userId) => {
    try {
      await updateDoc(doc(db, 'users', userId), {
        lastLogin: new Date(),
      });
      return { success: true };
    } catch (error) {
      console.error('Error updating last login:', error);
      return { success: false, error: error.message };
    }
  },

  // Update onboarding status
  updateOnboardingStatus: async (userId, completed) => {
    try {
      await updateDoc(doc(db, 'users', userId), {
        onboardingComplete: completed,
      });
      return { success: true };
    } catch (error) {
      console.error('Error updating onboarding status:', error);
      return { success: false, error: error.message };
    }
  },

  // Update electricity rate
  updateElectricityRate: async (userId, rate) => {
    try {
      await updateDoc(doc(db, 'users', userId), {
        electricityRate: parseFloat(rate),
      });
      return { success: true };
    } catch (error) {
      console.error('Error updating electricity rate:', error);
      return { success: false, error: error.message };
    }
  },

  // Update monthly budget
  updateMonthlyBudget: async (userId, budget) => {
    try {
      await updateDoc(doc(db, 'users', userId), {
        monthlyBudget: parseFloat(budget),
      });
      return { success: true };
    } catch (error) {
      console.error('Error updating monthly budget:', error);
      return { success: false, error: error.message };
    }
  },

  // Update preferences
  updatePreferences: async (userId, preferences) => {
    try {
      await updateDoc(doc(db, 'users', userId), {
        preferences,
      });
      return { success: true };
    } catch (error) {
      console.error('Error updating preferences:', error);
      return { success: false, error: error.message };
    }
  },

  // Backward-compatible alias used by settings hooks
  getUserPreferences: async (userId) => {
    try {
      const profileResult = await userService.getUserProfile(userId);
      if (!profileResult.success) {
        return {
          success: true,
          data: { ...DEFAULT_USER_PREFERENCES },
        };
      }

      const profile = profileResult.data || {};
      const preferences = profile.preferences || {};

      return {
        success: true,
        data: {
          electricityRate: profile.electricityRate || DEFAULT_USER_PREFERENCES.electricityRate,
          currency: profile.currency || DEFAULT_USER_PREFERENCES.currency,
          notificationsEnabled: typeof profile.notificationsEnabled === 'boolean'
            ? profile.notificationsEnabled
            : (preferences.notificationsEnabled ?? DEFAULT_USER_PREFERENCES.notificationsEnabled),
          darkMode: typeof profile.darkMode === 'boolean'
            ? profile.darkMode
            : (preferences.darkMode ?? DEFAULT_USER_PREFERENCES.darkMode),
          language: profile.language || preferences.language || DEFAULT_USER_PREFERENCES.language,
        },
      };
    } catch (error) {
      console.error('Error getting user preferences:', error);
      return { success: false, error: error.message };
    }
  },

  // Backward-compatible alias used by settings hooks
  updateUserPreferences: async (userId, updates = {}) => {
    try {
      const updatePayload = {};

      if (Object.prototype.hasOwnProperty.call(updates, 'electricityRate')) {
        updatePayload.electricityRate = parseFloat(updates.electricityRate) || 0;
      }

      if (Object.prototype.hasOwnProperty.call(updates, 'currency')) {
        updatePayload.currency = updates.currency;
      }

      if (Object.prototype.hasOwnProperty.call(updates, 'notificationsEnabled')) {
        updatePayload['preferences.notificationsEnabled'] = updates.notificationsEnabled;
      }

      if (Object.prototype.hasOwnProperty.call(updates, 'notifications')) {
        updatePayload['preferences.notificationsEnabled'] = updates.notifications;
      }

      if (Object.prototype.hasOwnProperty.call(updates, 'darkMode')) {
        updatePayload['preferences.darkMode'] = updates.darkMode;
      }

      if (Object.prototype.hasOwnProperty.call(updates, 'language')) {
        updatePayload['preferences.language'] = updates.language;
      }

      if (Object.keys(updatePayload).length === 0) {
        return { success: true };
      }

      await setDoc(
        doc(db, 'users', userId),
        {
          uid: userId,
          ...updatePayload,
          lastLogin: new Date(),
        },
        { merge: true }
      );
      return { success: true };
    } catch (error) {
      console.error('Error updating user preferences:', error);
      return { success: false, error: error.message };
    }
  },

  // Link or update ESP32 device configuration for a user.
  updateDeviceConfig: async (userId, deviceConfig = {}) => {
    try {
      const deviceId = String(deviceConfig.deviceId || '').trim();
      const deviceToken = String(deviceConfig.deviceToken || '').trim();

      if (!deviceId) {
        return { success: false, error: 'Device ID is required' };
      }

      if (!deviceToken) {
        return { success: false, error: 'Device token is required' };
      }

      if (deviceToken.length < 8) {
        return { success: false, error: 'Device token must be at least 8 characters' };
      }

      const userRef = doc(db, 'users', userId);
      const userDoc = await getDoc(userRef);
      const existingUserData = userDoc.exists() ? (userDoc.data() || {}) : {};
      const previousDeviceId = userDoc.exists()
        ? String(existingUserData.device?.deviceId || existingUserData.deviceId || '').trim()
        : '';
      const previousToken = userDoc.exists()
        ? String(existingUserData.device?.token || existingUserData.deviceToken || '').trim()
        : '';

      const nowMs = Date.now();
      const sameDeviceRelink = previousDeviceId && previousDeviceId === deviceId;
      const isTokenRotated = sameDeviceRelink && previousToken && previousToken !== deviceToken;

      const previousTokenPayload = isTokenRotated
        ? {
            previousToken,
            previousTokenValidUntilMs: nowMs + TOKEN_ROTATION_GRACE_MS,
            tokenRotatedAtMs: nowMs,
          }
        : {
            previousToken: null,
            previousTokenValidUntilMs: null,
            tokenRotatedAtMs: null,
          };

      await setDoc(userRef, {
        uid: userId,
        deviceId,
        deviceToken,
        previousDeviceToken: previousTokenPayload.previousToken,
        previousDeviceTokenValidUntilMs: previousTokenPayload.previousTokenValidUntilMs,
        device: {
          deviceId,
          token: deviceToken,
          previousToken: previousTokenPayload.previousToken,
          previousTokenValidUntilMs: previousTokenPayload.previousTokenValidUntilMs,
          tokenRotatedAtMs: previousTokenPayload.tokenRotatedAtMs,
          linkedAt: userDoc.exists() ? (existingUserData.device?.linkedAt || new Date()) : new Date(),
          updatedAt: new Date(),
          active: true,
        },
        lastLogin: new Date(),
      }, { merge: true });

      await setDoc(doc(db, 'devices', deviceId), {
        userId,
        deviceId,
        deviceToken,
        previousDeviceToken: previousTokenPayload.previousToken,
        previousDeviceTokenValidUntilMs: previousTokenPayload.previousTokenValidUntilMs,
        tokenRotatedAtMs: previousTokenPayload.tokenRotatedAtMs,
        active: true,
        health: {
          status: 'online',
          statusReason: 'linked',
          linkedAtMs: nowMs,
          updatedAtMs: nowMs,
        },
        updatedAt: new Date(),
      }, { merge: true });

      if (previousDeviceId && previousDeviceId !== deviceId) {
        await deleteDoc(doc(db, 'devices', previousDeviceId));
      }

      return { success: true };
    } catch (error) {
      console.error('Error updating device config:', error);
      return { success: false, error: error.message };
    }
  },

  // Unlink ESP32 device from a user profile.
  clearDeviceConfig: async (userId) => {
    try {
      const userRef = doc(db, 'users', userId);
      const userDoc = await getDoc(userRef);
      const currentDeviceId = userDoc.exists()
        ? String(userDoc.data()?.device?.deviceId || userDoc.data()?.deviceId || '').trim()
        : '';

      await setDoc(userRef, {
        uid: userId,
        deviceId: null,
        deviceToken: null,
        previousDeviceToken: null,
        previousDeviceTokenValidUntilMs: null,
        device: null,
        lastLogin: new Date(),
      }, { merge: true });

      if (currentDeviceId) {
        await deleteDoc(doc(db, 'devices', currentDeviceId));
      }

      return { success: true };
    } catch (error) {
      console.error('Error clearing device config:', error);
      return { success: false, error: error.message };
    }
  },

  // Resolve current runtime health for a linked ESP32 device.
  getDeviceHealth: async (deviceId) => {
    try {
      const normalizedDeviceId = String(deviceId || '').trim();
      if (!normalizedDeviceId) {
        return {
          success: true,
          data: {
            status: 'not_linked',
            statusReason: 'not_linked',
            lastSeenAtMs: 0,
            lastAckStatus: '',
            lastMetricsAtMs: 0,
            lastAckAtMs: 0,
            lastCommandIssuedAtMs: 0,
            lastCommandTimeoutAtMs: 0,
          },
        };
      }

      const deviceDoc = await getDoc(doc(db, 'devices', normalizedDeviceId));
      if (!deviceDoc.exists()) {
        return {
          success: true,
          data: {
            status: 'unregistered',
            statusReason: 'mapping_missing',
            lastSeenAtMs: 0,
            lastAckStatus: '',
            lastMetricsAtMs: 0,
            lastAckAtMs: 0,
            lastCommandIssuedAtMs: 0,
            lastCommandTimeoutAtMs: 0,
          },
        };
      }

      const deviceData = deviceDoc.data() || {};
      const nowMs = Date.now();
      const lastMetricsAtMs = toEpochMs(deviceData.lastMetricsAtMs);
      const lastAckAtMs = toEpochMs(deviceData.lastAckAtMs);
      const lastCommandIssuedAtMs = toEpochMs(deviceData.lastCommandIssuedAtMs);
      const lastCommandTimeoutAtMs = toEpochMs(deviceData.lastCommandTimeoutAtMs);
      const healthLastSeenAtMs = toEpochMs(deviceData.health?.lastSeenAtMs);
      const fallbackLastSeenAtMs = toEpochMs(deviceData.lastSeenAtMs || deviceData.lastSeenAt);

      const lastSeenAtMs = Math.max(
        healthLastSeenAtMs,
        fallbackLastSeenAtMs,
        lastMetricsAtMs,
        lastAckAtMs,
        lastCommandIssuedAtMs
      );

      const computedStatus = resolveDeviceHealthStatus(lastSeenAtMs, nowMs);
      const backendStatus = String(deviceData.health?.status || '').trim().toLowerCase();
      const status = backendStatus && backendStatus !== 'online' ? backendStatus : computedStatus;

      return {
        success: true,
        data: {
          status,
          statusReason: String(deviceData.health?.statusReason || '').trim() || 'runtime_heartbeat',
          lastSeenAtMs,
          lastAckStatus: String(deviceData.lastAckStatus || '').trim().toLowerCase(),
          lastMetricsAtMs,
          lastAckAtMs,
          lastCommandIssuedAtMs,
          lastCommandTimeoutAtMs,
        },
      };
    } catch (error) {
      console.error('Error getting device health:', error);
      return { success: false, error: error.message };
    }
  },
};