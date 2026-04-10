import { useState, useCallback, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { scheduleService } from '../../../services/firebase';
import { auth } from '../../../services/firebase/config';

export const useSchedule = () => {
  const [userId, setUserId] = useState(null);
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

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
      (schedulesData) => {
        setSchedules(schedulesData);
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
        console.error('Schedule subscription error:', err);
      }
    );

    return () => unsubscribe();
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
    } catch (err) {
      setError(err.message);
      console.error('Error fetching schedules:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // Add schedule
  const addSchedule = useCallback(async (scheduleData) => {
    setError(null);
    
    try {
      if (!userId) throw new Error('User not authenticated');

      const result = await scheduleService.createSchedule(userId, scheduleData);

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
    fetchSchedules,
    addSchedule,
    deleteSchedule,
    toggleSchedule,
  };
};