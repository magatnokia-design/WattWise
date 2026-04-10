import { userService } from './userService';
import { outletService } from './outletService';
import { safetyService } from './safetyService';
import { budgetService } from './budgetService';

/**
 * Initialization Service
 * Orchestrates creation of all Firestore documents for new users
 */
export const initializationService = {
  /**
   * Initialize all user data after registration
   * Creates: user profile, outlets, power_safety, budget
   */
  initializeNewUser: async (userId, userData) => {
    try {
      console.log('Starting user initialization for:', userId);

      // 1. Create user profile
      const profileResult = await userService.createUserProfile(userId, userData);
      if (!profileResult.success) {
        throw new Error(`Failed to create user profile: ${profileResult.error}`);
      }
      console.log('✓ User profile created');

      // 2. Initialize outlets (outlet1, outlet2)
      const outletsResult = await outletService.initializeOutlets(userId);
      if (!outletsResult.success) {
        throw new Error(`Failed to initialize outlets: ${outletsResult.error}`);
      }
      console.log('✓ Outlets initialized');

      // 3. Initialize power safety settings
      const safetyResult = await safetyService.initializePowerSafety(userId);
      if (!safetyResult.success) {
        throw new Error(`Failed to initialize power safety: ${safetyResult.error}`);
      }
      console.log('✓ Power safety initialized');

      // 4. Initialize budget for current month
      const budgetResult = await budgetService.initializeBudget(userId);
      if (!budgetResult.success) {
        throw new Error(`Failed to initialize budget: ${budgetResult.error}`);
      }
      console.log('✓ Budget initialized');

      console.log('User initialization complete ✓');
      return { success: true };
    } catch (error) {
      console.error('Error initializing user data:', error);
      return { success: false, error: error.message };
    }
  },
};