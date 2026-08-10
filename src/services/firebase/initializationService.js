import { doc, getDoc } from 'firebase/firestore';
import { db } from './config';
import { userService } from './userService';
import { outletService } from './outletService';
import { safetyService } from './safetyService';
import { budgetService } from './budgetService';

/**
 * Initialization Service
 * Orchestrates creation of the Firestore documents every account needs.
 */

// Guards against several screens triggering the same repair concurrently.
const inFlight = new Map();

const ensureUserProfile = async (userId, userData) => {
  const snapshot = await getDoc(doc(db, 'users', userId));
  if (snapshot.exists()) {
    return { success: true, created: false };
  }

  const result = await userService.createUserProfile(userId, userData || {});
  return { ...result, created: result.success };
};

export const initializationService = {
  /**
   * Brings an account up to the current expected shape, creating only what is
   * missing. Safe to run on every sign-in.
   *
   * Registration writes these documents from the client, so an account can be
   * left half-built by a crash, a dropped connection, or a user created outside
   * the app. Repairing on sign-in means a broken account heals itself instead of
   * presenting an app with no outlets. It also creates each new month's budget
   * document, which would otherwise only appear when the user opened Budget.
   */
  ensureUserInitialized: async (userId, userData = {}) => {
    if (!userId) {
      return { success: false, error: 'User not authenticated' };
    }

    if (inFlight.has(userId)) {
      return inFlight.get(userId);
    }

    const task = (async () => {
      const repaired = [];

      try {
        const profile = await ensureUserProfile(userId, userData);
        if (!profile.success) {
          throw new Error(`user profile: ${profile.error}`);
        }
        if (profile.created) repaired.push('profile');

        const outlets = await outletService.ensureOutletsExist(userId);
        if (!outlets.success) {
          throw new Error(`outlets: ${outlets.error}`);
        }
        repaired.push(...outlets.created);

        // Already a merge write, so it only fills in absent fields.
        const safety = await safetyService.initializePowerSafety(userId);
        if (!safety.success) {
          throw new Error(`power safety: ${safety.error}`);
        }

        const budget = await budgetService.ensureCurrentMonthBudget(userId);
        if (!budget.success) {
          throw new Error(`budget: ${budget.error}`);
        }
        if (budget.created) repaired.push('budget');

        if (repaired.length > 0) {
          console.log('Account initialization repaired:', repaired.join(', '));
        }

        return { success: true, repaired };
      } catch (error) {
        console.error('Error ensuring user initialization:', error);
        return { success: false, error: error.message, repaired };
      } finally {
        inFlight.delete(userId);
      }
    })();

    inFlight.set(userId, task);
    return task;
  },

  /**
   * Initialize all user data after registration.
   * Delegates to ensureUserInitialized so registration and self-repair cannot
   * drift apart as new per-account documents are added.
   */
  initializeNewUser: async (userId, userData) => {
    return initializationService.ensureUserInitialized(userId, userData);
  },
};
