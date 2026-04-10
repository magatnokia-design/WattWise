import { doc, getDoc, onSnapshot, collection, setDoc } from 'firebase/firestore';
import { db } from './config';

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
  // NOTE: In production, this should call a Cloud Function that sends command to ESP32
  updateOutletStatus: async (userId, outletId, status) => {
    try {
      const normalizedOutletId = normalizeOutletId(outletId);
      const outletRef = doc(db, 'users', userId, 'outlets', normalizedOutletId);
      const outletDoc = await getDoc(outletRef);
      const outletNumber = outletNumberFromId(normalizedOutletId);
      const outletData = outletDoc.exists() ? outletDoc.data() : {};
      
      const payload = {
        status: status ? 'on' : 'off',
        lastUpdated: new Date(),
      };

      if (!outletDoc.exists()) {
        payload.outletNumber = outletNumber || 0;
        payload.applianceName = `Outlet ${outletNumber || ''}`.trim();
      }

      // Update outlet status
      await setDoc(outletRef, payload, { merge: true });
      
      // Create history log
      const historyService = require('./historyService').historyService;
      await historyService.addActivityLog(userId, {
        outlet: outletNumber,
        outletName: outletData.applianceName || payload.applianceName || `Outlet ${outletNumber}`,
        action: status ? 'on' : 'off',
        source: 'manual',
        power: outletData.power || 0,
      });
      
      return { success: true };
    } catch (error) {
      console.error('Error updating outlet status:', error);
      return { success: false, error: error.message };
    }
  },

  // Backward-compatible alias used by dashboard hooks
  toggleOutlet: async (userId, outletIdOrNumber, status) => {
    return outletService.updateOutletStatus(userId, outletIdOrNumber, status);
  },

  // Update appliance name
  updateApplianceName: async (userId, outletIdOrNumber, name) => {
    try {
      const normalizedOutletId = normalizeOutletId(outletIdOrNumber);
      const outletNumber = outletNumberFromId(normalizedOutletId);
      await setDoc(
        doc(db, 'users', userId, 'outlets', normalizedOutletId),
        {
          outletNumber: outletNumber || 0,
          applianceName: name,
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