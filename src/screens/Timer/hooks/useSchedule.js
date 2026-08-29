import { useState, useCallback, useEffect, useRef } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { scheduleService } from '../../../services/firebase';
import { auth } from '../../../services/firebase/config';
import { useLoadOutcome } from '../../../hooks/useLoadTracker';
import {
  isUnconfirmedEmpty,
  UNREACHABLE_READ_RESULT,
  UNCONFIRMED_GRACE_MS,
} from '../../../utils/connectivity';

export const useSchedule = () => {
  const [userId, setUserId] = useState(null);
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // `schedules` being empty is not on its own evidence that the user has no
  // timers - it is also what an unread collection looks like. This says which.
  const load = useLoadOutcome();

  // Pending decision on a listener snapshot that was empty and came from the
  // cache. Cancelled the moment the server confirms anything.
  const unconfirmedTimer = useRef(null);
  const clearUnconfirmed = useCallback(() => {
    if (unconfirmedTimer.current) {
      clearTimeout(unconfirmedTimer.current);
      unconfirmedTimer.current = null;
    }
  }, []);

  // Track auth changes so listeners attach even when user loads after mount.
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setUserId(user?.uid || null);
      if (!user) {
        setSchedules([]);
      }
    });

    return unsubscribeAuth;
  }, []);

  // Load schedules with a real-time listener once we have a user.
  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    setError(null);

    const unsubscribe = scheduleService.subscribeToSchedules(
      userId,
      (schedulesData, meta) => {
        setSchedules(schedulesData);
        setLoading(false);

        // An empty snapshot served from an unfilled cache is not an answer, and
        // the listener reports it through this success path rather than the
        // error one below. Held for a moment rather than acted on, because the
        // first snapshot comes from the cache even when the server is about to
        // answer - see UNCONFIRMED_GRACE_MS.
        if (isUnconfirmedEmpty(schedulesData.length, meta)) {
          if (!unconfirmedTimer.current) {
            unconfirmedTimer.current = setTimeout(() => {
              unconfirmedTimer.current = null;
              load.failed(UNREACHABLE_READ_RESULT);
            }, UNCONFIRMED_GRACE_MS);
          }
          return;
        }

        clearUnconfirmed();
        load.succeeded();
      },
      (err) => {
        setError(err.message);
        setLoading(false);
        clearUnconfirmed();
        load.failed(err);
        console.error('Schedule subscription error:', err);
      }
    );

    return () => {
      clearUnconfirmed();
      unsubscribe();
    };
  }, [userId]);

  // Fetch schedules
  const fetchSchedules = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      if (!userId) throw new Error('User not authenticated');

      const result = await scheduleService.getSchedules(userId);

      if (!result.success) {
        throw new Error(result.error);
      }

      setSchedules(result.data);
      load.succeeded();
    } catch (err) {
      setError(err.message);
      // Ends the load without conceding that the user has no timers.
      load.failed(err);
      console.error('Error fetching schedules:', err);
    } finally {
      setLoading(false);
    }
    // The individual callbacks, not `load` - the hook returns a fresh object
    // each render, so depending on it would rebuild this callback every time.
  }, [userId, load.succeeded, load.failed]);

  // Add schedule
  const addSchedule = useCallback(async (scheduleData) => {
    setError(null);
    
    try {
      if (!userId) throw new Error('User not authenticated');

      const result = await scheduleService.createSchedule(userId, scheduleData);

      // Passed through rather than thrown. A pending write has been applied to
      // the local cache and is queued for the server, which is a different
      // outcome from a rejected one and the screen words it differently.
      if (result.pending) {
        return result;
      }

      if (!result.success) {
        throw new Error(result.error);
      }

      return { success: true };
    } catch (err) {
      setError(err.message);
      console.error('Error adding schedule:', err);
      return { success: false, error: err.message };
    }
  }, [userId]);

  // Delete schedule
  const deleteSchedule = useCallback(async (scheduleId) => {
    setError(null);
    
    try {
      if (!userId) throw new Error('User not authenticated');

      const result = await scheduleService.deleteSchedule(userId, scheduleId);

      // Passed through rather than thrown. A pending write has been applied to
      // the local cache and is queued for the server, which is a different
      // outcome from a rejected one and the screen words it differently.
      if (result.pending) {
        return result;
      }

      if (!result.success) {
        throw new Error(result.error);
      }

      return { success: true };
    } catch (err) {
      setError(err.message);
      console.error('Error deleting schedule:', err);
      return { success: false, error: err.message };
    }
  }, [userId]);

  // Toggle schedule active state
  const toggleSchedule = useCallback(async (scheduleId, active) => {
    setError(null);
    
    try {
      if (!userId) throw new Error('User not authenticated');

      const result = await scheduleService.updateSchedule(userId, scheduleId, { active });

      // Passed through rather than thrown. A pending write has been applied to
      // the local cache and is queued for the server, which is a different
      // outcome from a rejected one and the screen words it differently.
      if (result.pending) {
        return result;
      }

      if (!result.success) {
        throw new Error(result.error);
      }

      return { success: true };
    } catch (err) {
      setError(err.message);
      console.error('Error toggling schedule:', err);
      return { success: false, error: err.message };
    }
  }, [userId]);

  return {
    schedules,
    loading,
    error,
    // "No Timers Yet" is a claim about the account and needs a read that
    // returned; `showOfflineState` covers the case where none did.
    showEmptyState: load.showEmptyState,
    showOfflineState: load.showOfflineState,
    fetchSchedules,
    addSchedule,
    deleteSchedule,
    toggleSchedule,
  };
};