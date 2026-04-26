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

const isSupportedOutletId = (outletId) => outletId === 'outlet1' || outletId === 'outlet2';

const sortOutletsByNumber = (outlets = []) => {
  return [...outlets].sort((a, b) => {
    const left = Number(a?.outletNumber || 0);
    const right = Number(b?.outletNumber || 0);
    return left - right;
  });
};

const isPermissionDeniedError = (error) => {
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  return code.includes('permission-denied') || message.includes('insufficient permissions');
};

const TRANSIENT_FUNCTION_ERROR_CODES = new Set([
  'internal',
  'unavailable',
  'deadline-exceeded',
  'unknown',
]);

const normalizeFunctionErrorCode = (error) => {
  if (typeof error?.code !== 'string') return null;
  return error.code.replace('functions/', '').trim().toLowerCase();
};

const delayMs = (durationMs) => new Promise((resolve) => setTimeout(resolve, durationMs));

const didOutletStatusPersist = async (userId, outletIdOrNumber, expectedStatus) => {
  try {
    const normalizedOutletId = normalizeOutletId(outletIdOrNumber);
    const outletSnapshot = await getDoc(doc(db, 'users', userId, 'outlets', normalizedOutletId));
    if (!outletSnapshot.exists()) return false;

    const outletData = outletSnapshot.data() || {};
    return String(outletData.status || '').toLowerCase() === (expectedStatus ? 'on' : 'off');
  } catch {
    return false;
  }
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
        .filter(([outletId, outletData]) => isSupportedOutletId(outletId) && !!outletData)
        .map(([outletId, outletData]) => mapOutletDocToUiOutlet(outletId, outletData));

      return { success: true, data: sortOutletsByNumber(outlets) };
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
        const outlets = Object.entries(outletsMap || {})
          .filter(([outletId]) => isSupportedOutletId(outletId))
          .map(([outletId, outletData]) => mapOutletDocToUiOutlet(outletId, outletData));
        onUpdate(sortOutletsByNumber(outlets));
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

      // Retry transient callable failures; mobile networks can drop the response
      // even when the server-side toggle already completed.
      const processOutletToggle = httpsCallable(functions, 'processOutletToggle');
      const maxAttempts = 2;
      let lastError = null;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const result = await processOutletToggle({
            outletId: normalizedOutletId,
            status: normalizedStatus,
          });

          if (!result?.data?.success) {
            throw new Error(result?.data?.error || 'Failed to toggle outlet');
          }

          return { success: true };
        } catch (callableError) {
          lastError = callableError;
          const normalizedCode = normalizeFunctionErrorCode(callableError);

          // If server likely succeeded but client missed response, reconcile by state.
          const persisted = await didOutletStatusPersist(userId, normalizedOutletId, normalizedStatus);
          if (persisted) {
            console.warn('Toggle callable failed but Firestore status already updated:', {
              outletId: normalizedOutletId,
              code: normalizedCode,
              message: callableError?.message,
            });
            return { success: true };
          }

          const shouldRetry = TRANSIENT_FUNCTION_ERROR_CODES.has(normalizedCode);
          if (!shouldRetry || attempt >= maxAttempts) {
            throw callableError;
          }

          await delayMs(350 * attempt);
        }
      }

      throw lastError || new Error('Failed to toggle outlet');
    } catch (error) {
      const code = normalizeFunctionErrorCode(error) || error?.code;
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

  // Update appliance name.
  // If stricter rules reject metadata fields, retry with a minimal payload.
  updateApplianceName: async (userId, outletIdOrNumber, name, options = {}) => {
    try {
      const normalizedOutletId = normalizeOutletId(outletIdOrNumber);
      const outletNumber = outletNumberFromId(normalizedOutletId);
      const resolvedOutletNumber = outletNumber || 0;
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

      const outletRef = doc(db, 'users', userId, 'outlets', normalizedOutletId);
      const outletSnapshot = await getDoc(outletRef);

      if (!outletSnapshot.exists()) {
        await setDoc(outletRef, {
          outletNumber: resolvedOutletNumber,
          status: 'off',
          applianceName: name,
          voltage: 0,
          current: 0,
          power: 0,
          energy: 0,
          totalEnergy: 0,
          lastUpdated: new Date(),
          autoDetectedAppliance: '',
        });

        return { success: true };
      }

      try {
        await setDoc(
          outletRef,
          {
            outletNumber: resolvedOutletNumber,
            applianceName: name,
            applianceSelection: selectionPayload,
            lastUpdated: new Date(),
          },
          { merge: true }
        );
      } catch (writeError) {
        if (!isPermissionDeniedError(writeError)) {
          throw writeError;
        }

        await setDoc(
          outletRef,
          {
            outletNumber: resolvedOutletNumber,
            applianceName: name,
            lastUpdated: new Date(),
          },
          { merge: true }
        );
      }

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