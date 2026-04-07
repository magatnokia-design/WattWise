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

export const budgetService = {
  // Get current month budget
  getCurrentMonthBudget: async (userId) => {
    try {
      const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
      const budgetDoc = await getDoc(
        doc(db, 'users', userId, 'budget', currentMonth)
      );
      
      if (budgetDoc.exists()) {
        return { success: true, data: budgetDoc.data() };
      }
      
      // Return default structure if not exists
      return {
        success: true,
        data: {
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
        // Update existing
        await updateDoc(budgetRef, {
          monthlyBudget: parseFloat(amount),
          lastUpdated: new Date(),
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
};