import {
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
} from 'firebase/firestore';
import { db } from './config';

export const comparisonService = {
  // Get all comparison data (last 6 months)
  getAllComparisons: async (userId, limitCount = 6) => {
    try {
      const comparisonRef = collection(db, 'users', userId, 'reference_comparison');
      const q = query(
        comparisonRef,
        orderBy('month', 'desc'),
        limit(limitCount)
      );

      const snapshot = await getDocs(q);
      const comparisons = [];
      snapshot.forEach((doc) => {
        comparisons.push({ id: doc.id, ...doc.data() });
      });

      return { success: true, data: comparisons };
    } catch (error) {
      console.error('Error getting comparisons:', error);
      return { success: false, error: error.message };
    }
  },

  // Get comparison for specific month
  getComparisonByMonth: async (userId, month) => {
    try {
      const comparisonDoc = await getDoc(
        doc(db, 'users', userId, 'reference_comparison', month)
      );
      
      if (comparisonDoc.exists()) {
        return { success: true, data: comparisonDoc.data() };
      }
      return { success: false, error: 'No comparison data for this month' };
    } catch (error) {
      console.error('Error getting comparison by month:', error);
      return { success: false, error: error.message };
    }
  },

  // Backward-compatible alias used by hooks
  getMonthData: async (userId, month) => {
    try {
      const comparisonDoc = await getDoc(
        doc(db, 'users', userId, 'reference_comparison', month)
      );

      if (!comparisonDoc.exists()) {
        return { success: false, error: 'No comparison data for this month' };
      }

      const docData = comparisonDoc.data() || {};
      return {
        success: true,
        data: {
          totalKWh: docData.totalKWh ?? docData.previousBillKWh ?? 0,
          totalCost: docData.totalCost ?? docData.previousBillCost ?? 0,
          outlet1KWh: docData.outlet1KWh ?? docData.outlet1Energy ?? 0,
          outlet2KWh: docData.outlet2KWh ?? docData.outlet2Energy ?? 0,
          month: docData.month || month,
          ...docData,
        },
      };
    } catch (error) {
      console.error('Error getting month data:', error);
      return { success: false, error: error.message };
    }
  },

  // Add previous bill data
  addPreviousBillData: async (userId, month, billData) => {
    try {
      await setDoc(
        doc(db, 'users', userId, 'reference_comparison', month),
        {
          month,
          previousBillKWh: parseFloat(billData.kWh),
          previousBillCost: parseFloat(billData.cost),
          outlet1Energy: parseFloat(billData.outlet1 || 0),
          outlet2Energy: parseFloat(billData.outlet2 || 0),
          notes: billData.notes || '',
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      );
      return { success: true };
    } catch (error) {
      console.error('Error adding previous bill data:', error);
      return { success: false, error: error.message };
    }
  },

  // Update previous bill data
  updatePreviousBillData: async (userId, month, billData) => {
    try {
      await updateDoc(
        doc(db, 'users', userId, 'reference_comparison', month),
        {
          previousBillKWh: parseFloat(billData.kWh),
          previousBillCost: parseFloat(billData.cost),
          outlet1Energy: parseFloat(billData.outlet1 || 0),
          outlet2Energy: parseFloat(billData.outlet2 || 0),
          notes: billData.notes || '',
          updatedAt: new Date(),
        }
      );
      return { success: true };
    } catch (error) {
      console.error('Error updating previous bill data:', error);
      return { success: false, error: error.message };
    }
  },

  // Backward-compatible alias used by hooks
  saveMonthData: async (userId, month, monthData) => {
    try {
      await setDoc(
        doc(db, 'users', userId, 'reference_comparison', month),
        {
          month,
          totalKWh: parseFloat(monthData.totalKWh || 0),
          totalCost: parseFloat(monthData.totalCost || 0),
          outlet1KWh: parseFloat(monthData.outlet1KWh || 0),
          outlet2KWh: parseFloat(monthData.outlet2KWh || 0),
          updatedAt: new Date(),
        },
        { merge: true }
      );
      return { success: true };
    } catch (error) {
      console.error('Error saving month data:', error);
      return { success: false, error: error.message };
    }
  },

  // Delete comparison data
  deleteComparison: async (userId, month) => {
    try {
      await deleteDoc(
        doc(db, 'users', userId, 'reference_comparison', month)
      );
      return { success: true };
    } catch (error) {
      console.error('Error deleting comparison:', error);
      return { success: false, error: error.message };
    }
  },
};