import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from './config';

const DEFAULT_USER_PREFERENCES = {
  electricityRate: 0,
  currency: '₱',
  notificationsEnabled: true,
  darkMode: false,
  language: 'en',
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
};