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

// Shared so the one-shot read and the live listener always present the saved
// signatures identically.
// "Outlet 1"/"Outlet 2" are placeholder labels rather than appliances. Filtered
// on read as well as on write so any already stored by an earlier build stops
// showing up without needing a migration.
const isPlaceholderApplianceLabel = (label) => /^outlet\s*\d+$/i.test(String(label || '').trim());

const mapSavedAppliances = (userData = {}) => {
  const rawProfiles = userData?.applianceProfiles;
  if (!Array.isArray(rawProfiles)) return [];

  return rawProfiles
    .filter((profile) => {
      const label = String(profile?.label || '').trim();
      return label && !isPlaceholderApplianceLabel(label);
    })
    .map((profile) => ({
      label: String(profile.label).trim(),
      meanPower: Number(profile.meanPower) || 0,
      peakPower: Number(profile.peakPower) || 0,
      updatedAtMs: Number(profile.updatedAtMs) || 0,
    }));
};

const isSupportedOutletId = (outletId) => outletId === 'outlet1' || outletId === 'outlet2';

const sortOutletsByNumber = (outlets = []) => {
  return [...outlets].sort((a, b) => {
    const left = Number(a?.outletNumber || 0);
    const right = Number(b?.outletNumber || 0);
    return left - right;
  });
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

  clearAutoDetection: async (userId, outletIdOrNumber) => {
    try {
      if (!userId) {
        throw new Error('User not authenticated');
      }

      const normalizedOutletId = outletIdOrNumber
        ? normalizeOutletId(outletIdOrNumber)
        : null;
      const clearAutoDetectionCallable = httpsCallable(functions, 'clearAutoDetection');
      const payload = normalizedOutletId ? { outletId: normalizedOutletId } : {};
      const result = await clearAutoDetectionCallable(payload);

      if (!result?.data?.success) {
        throw new Error(result?.data?.error || 'Failed to clear auto detection');
      }

      return { success: true, data: result.data };
    } catch (error) {
      const code = normalizeFunctionErrorCode(error) || error?.code;
      const message = error?.details || error?.message || 'Failed to clear auto detection';

      console.error('Error clearing auto detection:', {
        code,
        message,
      });

      return { success: false, error: message, code };
    }
  },

  // Records the outlet's current run as a learned signature for this appliance
  // name ("confirm to learn"), so later runs match the user's own hardware
  // instead of the generic power ranges.

  // Learned appliance signatures live on the user document.
  getSavedAppliances: async (userId) => {
    try {
      if (!userId) {
        throw new Error('User not authenticated');
      }

      const userDoc = await getDoc(doc(db, 'users', userId));
      const data = userDoc.exists() ? userDoc.data() : {};

      return { success: true, data: mapSavedAppliances(data) };
    } catch (error) {
      console.error('Error loading saved appliances:', error);
      return { success: false, error: error.message, data: [] };
    }
  },

  // Live view of the learned signatures. Confirming a suggestion writes them
  // from a Cloud Function, so without a listener the Settings list only caught
  // up on the next app launch.
  subscribeToSavedAppliances: (userId, onChange, onError) => {
    if (!userId) {
      return () => {};
    }

    return onSnapshot(
      doc(db, 'users', userId),
      (snapshot) => {
        onChange(mapSavedAppliances(snapshot.exists() ? snapshot.data() : {}));
      },
      (error) => {
        console.error('Saved appliances subscription error:', error);
        if (onError) onError(error);
      }
    );
  },

  removeApplianceProfile: async (userId, label) => {
    try {
      if (!userId) {
        throw new Error('User not authenticated');
      }

      const normalizedLabel = String(label || '').trim();
      if (!normalizedLabel) {
        throw new Error('label is required');
      }

      const removeApplianceProfileCallable = httpsCallable(functions, 'removeApplianceProfile');
      const result = await removeApplianceProfileCallable({ label: normalizedLabel });

      if (!result?.data?.success) {
        throw new Error(result?.data?.error || 'Failed to remove saved appliance');
      }

      return { success: true, data: result.data };
    } catch (error) {
      const code = normalizeFunctionErrorCode(error) || error?.code;
      const message = error?.details || error?.message || 'Failed to remove saved appliance';

      console.error('Error removing saved appliance:', { code, message });

      return { success: false, error: message, code };
    }
  },

  /**
   * Renames a saved appliance signature, keeping the measurements behind it.
   *
   * Forgetting and re-teaching was the only way to correct a name, and it costs
   * the measured run - the detector then cannot recognise that appliance until
   * it has been run again. The callable also renames any outlet using the old
   * label, so the identity check keeps working.
   */
  renameApplianceProfile: async (userId, fromLabel, toLabel) => {
    try {
      if (!userId) {
        throw new Error('User not authenticated');
      }

      const from = String(fromLabel || '').trim();
      const to = String(toLabel || '').trim();

      if (!from) throw new Error('The appliance to rename is required');
      if (!to) throw new Error('Enter a new name');

      const renameApplianceProfileCallable = httpsCallable(functions, 'renameApplianceProfile');
      const result = await renameApplianceProfileCallable({ from, to });

      if (!result?.data?.success) {
        throw new Error(result?.data?.error || 'Failed to rename saved appliance');
      }

      return { success: true, data: result.data };
    } catch (error) {
      const code = normalizeFunctionErrorCode(error) || error?.code;
      const message = error?.details || error?.message || 'Failed to rename saved appliance';

      console.error('Error renaming saved appliance:', { code, message });

      return { success: false, error: message, code };
    }
  },

  // Backward-compatible alias used by dashboard hooks
  toggleOutlet: async (userId, outletIdOrNumber, status) => {
    return outletService.updateOutletStatus(userId, outletIdOrNumber, status);
  },

  // Names the appliance on an outlet and, when the run holds enough measured
  // data, teaches the detector that signature in the same call.
  updateApplianceName: async (userId, outletIdOrNumber, name, options = {}) => {
    try {
      const normalizedOutletId = normalizeOutletId(outletIdOrNumber);
      const normalizedSource = String(options.source || 'manual').trim().toLowerCase();
      const confidence = Number(options.confidencePercent);

      // Naming goes through the callable: it writes the selection metadata that
      // firestore.rules will not accept from the client, and records the learned
      // signature in the same round trip.
      const callable = httpsCallable(functions, 'registerApplianceProfile');
      const payload = {
        outletId: normalizedOutletId,
        applianceName: name,
        source: normalizedSource,
      };

      if (Number.isFinite(confidence)) {
        payload.confidencePercent = confidence;
      }

      if (options.modelVersion) {
        payload.modelVersion = String(options.modelVersion);
      }

      let result;
      try {
        result = await callable(payload);
      } catch (callableError) {
        // A brand-new account may not have its outlet documents yet.
        if (normalizeFunctionErrorCode(callableError) !== 'not-found') {
          throw callableError;
        }

        await outletService.ensureOutletsExist(userId);
        result = await callable(payload);
      }

      if (!result?.data?.success) {
        throw new Error(result?.data?.error || 'Failed to update appliance name');
      }

      return {
        success: true,
        learned: !!result.data.learned,
        learnError: result.data.learnError || null,
      };
    } catch (error) {
      const code = normalizeFunctionErrorCode(error) || error?.code;
      const message = error?.details || error?.message || 'Failed to update appliance name';

      console.error('Error updating appliance name:', { code, message });
      return { success: false, error: message, code };
    }
  },

  // Creates only the outlet documents that are missing. Safe to call on every
  // sign-in: initializeOutlets below overwrites without merge, which would wipe
  // appliance names, energy totals and detection state.
  ensureOutletsExist: async (userId) => {
    try {
      const created = [];

      for (const outletNumber of [1, 2]) {
        const outletId = `outlet${outletNumber}`;
        const outletRef = doc(db, 'users', userId, 'outlets', outletId);
        const snapshot = await getDoc(outletRef);

        if (snapshot.exists()) continue;

        await setDoc(outletRef, {
          outletNumber,
          status: 'off',
          applianceName: `Outlet ${outletNumber}`,
          voltage: 0,
          current: 0,
          power: 0,
          energy: 0,
          totalEnergy: 0,
          lastUpdated: new Date(),
          autoDetectedAppliance: '',
        });

        created.push(outletId);
      }

      return { success: true, created };
    } catch (error) {
      console.error('Error ensuring outlets exist:', error);
      return { success: false, error: error.message, created: [] };
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