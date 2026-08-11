import { doc, getDoc, setDoc, updateDoc, collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from './config';

const monthLabelFromKey = (monthKey) => {
  const date = new Date(`${monthKey}-01T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return { month: monthKey, year: '' };
  }

  return {
    month: date.toLocaleString('en-US', { month: 'short' }),
    year: String(date.getFullYear()),
  };
};

/**
 * The budget the user set is mirrored onto the user document by
 * setMonthlyBudget, which makes it the durable source when a given month's
 * budget document does not exist or predates the setting.
 */
const readProfileMonthlyBudget = async (userId) => {
  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (!userDoc.exists()) return 0;

    const parsed = Number(userDoc.data()?.monthlyBudget);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch (error) {
    console.error('Error reading profile monthly budget:', error);
    return 0;
  }
};

export const budgetService = {
  // Get current month budget
  getCurrentMonthBudget: async (userId) => {
    try {
      const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
      const budgetDoc = await getDoc(
        doc(db, 'users', userId, 'budget', currentMonth)
      );

      if (budgetDoc.exists()) {
        const data = budgetDoc.data() || {};

        // A month document can exist (created by spending rollups) without ever
        // carrying the budget the user set, so fall back to the profile value.
        if (!Number(data.monthlyBudget)) {
          const carriedBudget = await readProfileMonthlyBudget(userId);
          if (carriedBudget > 0) {
            return { success: true, data: { ...data, monthlyBudget: carriedBudget } };
          }
        }

        return { success: true, data };
      }

      // No document for this month yet. The budget the user set is stored on the
      // user profile too, so carry it forward instead of reporting zero - a new
      // month must not silently wipe the configured budget.
      const carriedBudget = await readProfileMonthlyBudget(userId);

      return {
        success: true,
        data: {
          month: currentMonth,
          monthlyBudget: carriedBudget,
          currentSpending: 0,
          outlet1Spending: 0,
          outlet2Spending: 0,
          dailyAverage: 0,
          projectedTotal: 0,
          lastUpdated: new Date(),
          alerts: [],
          thresholds: {
            fifty: false,
            seventyFive: false,
            ninety: false,
            hundred: false,
          },
        },
      };
    } catch (error) {
      console.error('Error getting budget:', error);
      return { success: false, error: error.message };
    }
  },

  // Get budget for specific month
  getBudgetByMonth: async (userId, month) => {
    try {
      const budgetDoc = await getDoc(
        doc(db, 'users', userId, 'budget', month)
      );
      
      if (budgetDoc.exists()) {
        return { success: true, data: budgetDoc.data() };
      }
      return { success: false, error: 'No budget data for this month' };
    } catch (error) {
      console.error('Error getting budget by month:', error);
      return { success: false, error: error.message };
    }
  },

  // Backward-compatible alias used by hooks
  getBudgetHistory: async (userId, limitCount = 3) => {
    try {
      const budgetRef = collection(db, 'users', userId, 'budget');
      const q = query(budgetRef, orderBy('month', 'desc'), limit(limitCount));
      const snapshot = await getDocs(q);

      const history = [];
      snapshot.forEach((budgetDoc) => {
        const data = budgetDoc.data() || {};
        const monthKey = data.month || budgetDoc.id;
        const labels = monthLabelFromKey(monthKey);

        history.push({
          id: budgetDoc.id,
          month: labels.month,
          year: labels.year,
          spent: Number(data.currentSpending || 0),
          budget: Number(data.monthlyBudget || 0),
        });
      });

      return { success: true, data: history };
    } catch (error) {
      console.error('Error getting budget history:', error);
      return { success: false, error: error.message };
    }
  },

  // Set monthly budget
  setMonthlyBudget: async (userId, amount) => {
    try {
      const currentMonth = new Date().toISOString().slice(0, 7);
      const budgetRef = doc(db, 'users', userId, 'budget', currentMonth);
      
      // Check if document exists
      const budgetDoc = await getDoc(budgetRef);
      
      if (budgetDoc.exists()) {
        const nextBudget = parseFloat(amount);
        const previousBudget = Number(budgetDoc.data()?.monthlyBudget) || 0;

        // A changed budget makes the old alert flags meaningless: they record
        // that spending crossed 50/75/90/100% of a *different* figure.
        // handleBudgetAlerts skips any threshold whose flag is already true, so
        // leaving them set silences every alert for the rest of the month -
        // which is exactly what happened after the flags were burned against a
        // budget that has since been lowered.
        //
        // Only on an actual change: re-saving the same amount should not
        // re-send alerts the user has already had.
        const budgetChanged = nextBudget !== previousBudget;

        await updateDoc(budgetRef, {
          monthlyBudget: nextBudget,
          lastUpdated: new Date(),
          ...(budgetChanged
            ? {
              thresholds: {
                fifty: false,
                seventyFive: false,
                ninety: false,
                hundred: false,
              },
            }
            : {}),
        });
      } else {
        // Create new
        await setDoc(budgetRef, {
          month: currentMonth,
          monthlyBudget: parseFloat(amount),
          currentSpending: 0,
          outlet1Spending: 0,
          outlet2Spending: 0,
          dailyAverage: 0,
          projectedTotal: 0,
          lastUpdated: new Date(),
          alerts: [],
          thresholds: {
            fifty: false,
            seventyFive: false,
            ninety: false,
            hundred: false,
          },
        });
      }
      
      // Also upsert user document to avoid missing-doc update errors
      await setDoc(
        doc(db, 'users', userId),
        {
          uid: userId,
          monthlyBudget: parseFloat(amount),
          lastLogin: new Date(),
        },
        { merge: true }
      );
      
      return { success: true };
    } catch (error) {
      console.error('Error setting monthly budget:', error);
      return { success: false, error: error.message };
    }
  },

  // Update budget spending (server-side in production)
  updateBudgetSpending: async (userId, month, spendingData) => {
    try {
      const budgetRef = doc(db, 'users', userId, 'budget', month);
      await updateDoc(budgetRef, {
        ...spendingData,
        lastUpdated: new Date(),
      });
      return { success: true };
    } catch (error) {
      console.error('Error updating budget spending:', error);
      return { success: false, error: error.message };
    }
  },

  // Initialize budget for new user (called once after registration)
  // Creates the current month's budget document only when it is missing, and
  // carries the configured budget forward so a new month does not read as zero.
  // Safe to call on every sign-in, unlike initializeBudget which overwrites.
  ensureCurrentMonthBudget: async (userId) => {
    try {
      const currentMonth = new Date().toISOString().slice(0, 7);
      const budgetRef = doc(db, 'users', userId, 'budget', currentMonth);
      const snapshot = await getDoc(budgetRef);

      if (snapshot.exists()) {
        return { success: true, created: false };
      }

      const carriedBudget = await readProfileMonthlyBudget(userId);

      await setDoc(budgetRef, {
        month: currentMonth,
        monthlyBudget: carriedBudget,
        currentSpending: 0,
        outlet1Spending: 0,
        outlet2Spending: 0,
        dailyAverage: 0,
        projectedTotal: 0,
        lastUpdated: new Date(),
        alerts: [],
        thresholds: {
          fifty: false,
          seventyFive: false,
          ninety: false,
          hundred: false,
        },
      });

      return { success: true, created: true };
    } catch (error) {
      console.error('Error ensuring current month budget:', error);
      return { success: false, error: error.message };
    }
  },

  initializeBudget: async (userId) => {
    try {
      const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
      await setDoc(doc(db, 'users', userId, 'budget', currentMonth), {
        month: currentMonth,
        monthlyBudget: 0,
        currentSpending: 0,
        outlet1Spending: 0,
        outlet2Spending: 0,
        dailyAverage: 0,
        projectedTotal: 0,
        lastUpdated: new Date(),
        alerts: [],
        thresholds: {
          fifty: false,
          seventyFive: false,
          ninety: false,
          hundred: false,
        },
      });
      return { success: true };
    } catch (error) {
      console.error('Error initializing budget:', error);
      return { success: false, error: error.message };
    }
  },

};