import { useState, useCallback, useEffect } from 'react';
import { scheduleService } from '../../../services/firebase';
import { auth } from '../../../services/firebase/config';

export const useSchedule = () => {
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Load schedules on mount with real-time listener
  useEffect(() => {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    const unsubscribe = scheduleService.subscribeToSchedules(
      userId,
      (schedulesData) => {
        setSchedules(schedulesData);
      },
      (err) => {
        setError(err.message);
        console.error('Schedule subscription error:', err);
      }
    );

    return () => unsubscribe();
  }, []);

  // Fetch schedules
  const fetchSchedules = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const userId = auth.currentUser?.uid;
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
  }, []);

  // Add schedule
  const addSchedule = useCallback(async (scheduleData) => {
    setError(null);
    
    try {
      const userId = auth.currentUser?.uid;
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
  }, []);

  // Delete schedule
  const deleteSchedule = useCallback(async (scheduleId) => {
    setError(null);
    
    try {
      const userId = auth.currentUser?.uid;
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
  }, []);

  // Toggle schedule active state
  const toggleSchedule = useCallback(async (scheduleId, active) => {
    setError(null);
    
    try {
      const userId = auth.currentUser?.uid;
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
  }, []);

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