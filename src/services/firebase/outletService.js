import { doc, getDoc, onSnapshot, collection, setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './config';

const normalizeOutletId = (outletIdOrNumber) => {
  if (typeof outletIdOrNumber === 'number') {
    return `outlet${outletIdOrNumber}`;
  }

  if (typeof outletIdOrNumber === 'string') {
    if (outletIdOrNumber.startsWith('outlet')) {
      return outletIdOrNumber;
    }
    if (/^\d+$/.test(outletIdOrNumber)) {
      return `outlet${outletIdOrNumber}`;
    }
  }

  return outletIdOrNumber;
};

const mapOutletDocToUiOutlet = (outletId, data = {}) => {
  const parsedOutletNumber = Number(String(outletId).replace('outlet', ''));
  const outletNumber = Number.isNaN(parsedOutletNumber)
    ? data.outletNumber
    : parsedOutletNumber;
  const isOn = typeof data.isOn === 'boolean' ? data.isOn : data.status === 'on';

  return {
    id: outletId,
    outletId,
    ...data,
    outletNumber,
    isOn,
  };
};

const outletNumberFromId = (outletId) => {
  const outletNumber = Number(String(outletId).replace('outlet', ''));
  return Number.isNaN(outletNumber) ? null : outletNumber;
};

export const outletService = {
  // Get outlet data
  getOutletData: async (userId, outletId) => {
    try {
      const normalizedOutletId = normalizeOutletId(outletId);
      const outletDoc = await getDoc(
        doc(db, 'users', userId, 'outlets', normalizedOutletId)
      );
      if (outletDoc.exists()) {
        return { success: true, data: outletDoc.data() };
      }
      return { success: false, error: 'Outlet not found' };
    } catch (error) {
      console.error('Error getting outlet data:', error);
      return { success: false, error: error.message };
    }
  },

  // Get both outlets data
  getAllOutlets: async (userId) => {
    try {
      const outlet1 = await outletService.getOutletData(userId, 'outlet1');
      const outlet2 = await outletService.getOutletData(userId, 'outlet2');
      
      return {
        success: true,
        data: {
          outlet1: outlet1.success ? outlet1.data : null,
          outlet2: outlet2.success ? outlet2.data : null,
        },
      };
    } catch (error) {
      console.error('Error getting all outlets:', error);
      return { success: false, error: error.message };
    }
  },

  // Backward-compatible list format expected by older hooks
  getOutlets: async (userId) => {
    try {
      const result = await outletService.getAllOutlets(userId);
      if (!result.success) return result;

      const outlets = Object.entries(result.data || {})
        .filter(([, outletData]) => !!outletData)
        .map(([outletId, outletData]) => mapOutletDocToUiOutlet(outletId, outletData));

      return { success: true, data: outlets };
    } catch (error) {
      console.error('Error getting outlets:', error);
      return { success: false, error: error.message };
    }
  },

  // Real-time listener for outlet data
  subscribeToOutlet: (userId, outletId, onUpdate, onError) => {
    const normalizedOutletId = normalizeOutletId(outletId);
    const outletRef = doc(db, 'users', userId, 'outlets', normalizedOutletId);
    
    return onSnapshot(
      outletRef,
      (doc) => {
        if (doc.exists()) {
          onUpdate(doc.data());
        }
      },
      (error) => {
        console.error('Error in outlet listener:', error);
        if (onError) onError(error);
      }
    );
  },

  // Real-time listener for both outlets
  subscribeToAllOutlets: (userId, onUpdate, onError) => {
    if (!userId) {
      const error = new Error('User not authenticated');
      if (onError) onError(error);
      return () => {};
    }

    const outletsRef = collection(db, 'users', userId, 'outlets');
    
    return onSnapshot(
      outletsRef,
      (snapshot) => {
        const outlets = {};
        snapshot.forEach((doc) => {
          outlets[doc.id] = doc.data();
        });
        onUpdate(outlets);
      },
      (error) => {
        console.error('Error in outlets listener:', error);
        if (onError) onError(error);
      }
    );
  },

  // Backward-compatible listener shape expected by older hooks
  subscribeToOutlets: (userId, onUpdate, onError) => {
    return outletService.subscribeToAllOutlets(
      userId,
      (outletsMap) => {
        const outlets = Object.entries(outletsMap || {}).map(([outletId, outletData]) =>
          mapOutletDocToUiOutlet(outletId, outletData)
        );
        onUpdate(outlets);
      },
      onError
    );
  },

  // Update outlet status (toggle ON/OFF)
  // ✅ NOW USES CLOUD FUNCTION - Server handles outlet update + history log
  updateOutletStatus: async (userId, outletId, status) => {
    try {
      const normalizedOutletId = normalizeOutletId(outletId);
      const normalizedStatus = !!status;
      
      // Call Cloud Function to process outlet toggle
      const processOutletToggle = httpsCallable(functions, 'processOutletToggle');
      const result = await processOutletToggle({
        outletId: normalizedOutletId,
        status: normalizedStatus,  // boolean: true = on, false = off
      });

      if (!result.data.success) {
        throw new Error(result.data.error || 'Failed to toggle outlet');
      }
      
      return { success: true };
    } catch (error) {
      const code = typeof error?.code === 'string'
        ? error.code.replace('functions/', '')
        : error?.code;
      const message = error?.details || error?.message || 'Failed to toggle outlet';

      console.error('Error updating outlet status:', {
        code,
        message,
      });

      return { success: false, error: message, code };
    }
  },

  // Backward-compatible alias used by dashboard hooks
  toggleOutlet: async (userId, outletIdOrNumber, status) => {
    return outletService.updateOutletStatus(userId, outletIdOrNumber, status);
  },

  // Update appliance name
  // ✅ DIRECT WRITE ALLOWED - Security rules permit user writes to applianceName
  updateApplianceName: async (userId, outletIdOrNumber, name, options = {}) => {
    try {
      const normalizedOutletId = normalizeOutletId(outletIdOrNumber);
      const outletNumber = outletNumberFromId(normalizedOutletId);
      const normalizedSource = String(options.source || 'manual').trim().toLowerCase();
      const confidence = Number(options.confidencePercent);
      const selectionPayload = {
        name,
        source: normalizedSource,
        selectedAt: new Date(),
        acceptedSuggestion: normalizedSource === 'auto_suggestion',
      };

      if (Number.isFinite(confidence)) {
        selectionPayload.confidencePercent = confidence;
      }

      if (options.modelVersion) {
        selectionPayload.modelVersion = String(options.modelVersion);
      }

      await setDoc(
        doc(db, 'users', userId, 'outlets', normalizedOutletId),
        {
          outletNumber: outletNumber || 0,
          applianceName: name,
          applianceSelection: selectionPayload,
          lastUpdated: new Date(),
        },
        { merge: true }
      );
      return { success: true };
    } catch (error) {
      console.error('Error updating appliance name:', error);
      return { success: false, error: error.message };
    }
  },

  // Initialize outlets (called once after user registration)
  // ✅ DIRECT WRITE ALLOWED - Initial setup before rules lock down
  initializeOutlets: async (userId) => {
    try {
      const outlet1Ref = doc(db, 'users', userId, 'outlets', 'outlet1');
      const outlet2Ref = doc(db, 'users', userId, 'outlets', 'outlet2');

      await setDoc(outlet1Ref, {
        outletNumber: 1,
        status: 'off',
        applianceName: 'Outlet 1',
        voltage: 0,
        current: 0,
        power: 0,
        energy: 0,
        totalEnergy: 0,
        lastUpdated: new Date(),
        autoDetectedAppliance: '',
      });

      await setDoc(outlet2Ref, {
        outletNumber: 2,
        status: 'off',
        applianceName: 'Outlet 2',
        voltage: 0,
        current: 0,
        power: 0,
        energy: 0,
        totalEnergy: 0,
        lastUpdated: new Date(),
        autoDetectedAppliance: '',
      });

      return { success: true };
    } catch (error) {
      console.error('Error initializing outlets:', error);
      return { success: false, error: error.message };
    }
  },
};