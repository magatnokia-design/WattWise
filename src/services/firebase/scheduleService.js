import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
} from 'firebase/firestore';
import { db } from './config';

const secondsToClock = (totalSeconds) => {
  const safeSeconds = Number.isFinite(totalSeconds) ? Math.max(0, totalSeconds) : 0;
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const clockToSeconds = (clockValue) => {
  if (!clockValue || typeof clockValue !== 'string') return 0;
  const [hours, minutes, seconds] = clockValue.split(':').map((value) => parseInt(value, 10) || 0);
  return (hours * 3600) + (minutes * 60) + seconds;
};

const normalizeScheduleData = (scheduleId, scheduleData = {}) => {
  const isCountdown = scheduleData.type === 'countdown';

  return {
    id: scheduleId,
    ...scheduleData,
    type: scheduleData.type || (scheduleData.countdownDuration ? 'countdown' : 'scheduled'),
    outlet: String(scheduleData.outlet ?? '1'),
    action: scheduleData.action || 'ON',
    active: scheduleData.active ?? true,
    days: scheduleData.days || scheduleData.scheduledDays || [],
    countdownTime: isCountdown
      ? (scheduleData.countdownTime || secondsToClock(scheduleData.countdownDuration))
      : scheduleData.countdownTime,
    scheduledTime: !isCountdown
      ? (scheduleData.scheduledTime || scheduleData.time || null)
      : scheduleData.scheduledTime,
  };
};

export const scheduleService = {
  // Get all schedules
  getSchedules: async (userId, filters = {}) => {
    try {
      const schedulesRef = collection(db, 'users', userId, 'schedules');
      let q = query(schedulesRef, orderBy('createdAt', 'desc'));

      // Apply filters
      if (filters.outlet && filters.outlet !== 'all') {
        q = query(
          schedulesRef,
          where('outlet', '==', parseInt(filters.outlet)),
          orderBy('createdAt', 'desc')
        );
      }

      if (filters.type && filters.type !== 'all') {
        q = query(
          schedulesRef,
          where('type', '==', filters.type),
          orderBy('createdAt', 'desc')
        );
      }

      const snapshot = await getDocs(q);
      const schedules = [];
      snapshot.forEach((scheduleDoc) => {
        schedules.push(normalizeScheduleData(scheduleDoc.id, scheduleDoc.data()));
      });

      return { success: true, data: schedules };
    } catch (error) {
      console.error('Error getting schedules:', error);
      return { success: false, error: error.message };
    }
  },

  // Real-time listener for schedules
  subscribeToSchedules: (userId, onUpdate, onError) => {
    const schedulesRef = collection(db, 'users', userId, 'schedules');
    const q = query(schedulesRef, orderBy('createdAt', 'desc'));

    return onSnapshot(
      q,
      (snapshot) => {
        const schedules = [];
        snapshot.forEach((scheduleDoc) => {
          schedules.push(normalizeScheduleData(scheduleDoc.id, scheduleDoc.data()));
        });
        onUpdate(schedules);
      },
      (error) => {
        console.error('Error in schedules listener:', error);
        if (onError) onError(error);
      }
    );
  },

  // Get single schedule
  getSchedule: async (userId, scheduleId) => {
    try {
      const scheduleDoc = await getDoc(
        doc(db, 'users', userId, 'schedules', scheduleId)
      );
      if (scheduleDoc.exists()) {
        return { success: true, data: { id: scheduleDoc.id, ...scheduleDoc.data() } };
      }
      return { success: false, error: 'Schedule not found' };
    } catch (error) {
      console.error('Error getting schedule:', error);
      return { success: false, error: error.message };
    }
  },

  // Add countdown timer
  addCountdownTimer: async (userId, timerData) => {
    try {
      const schedulesRef = collection(db, 'users', userId, 'schedules');
      const docRef = await addDoc(schedulesRef, {
        outlet: timerData.outlet,
        type: 'countdown',
        active: true,
        countdownDuration: timerData.duration,
        countdownRemaining: timerData.duration,
        countdownStartedAt: new Date(),
        action: timerData.action,
        createdAt: new Date(),
        lastTriggered: null,
      });
      return { success: true, id: docRef.id };
    } catch (error) {
      console.error('Error adding countdown timer:', error);
      return { success: false, error: error.message };
    }
  },

  // Add scheduled timer
  addScheduledTimer: async (userId, timerData) => {
    try {
      const schedulesRef = collection(db, 'users', userId, 'schedules');
      const docRef = await addDoc(schedulesRef, {
        outlet: timerData.outlet,
        type: 'scheduled',
        active: true,
        scheduledTime: timerData.time,
        scheduledDays: timerData.days,
        action: timerData.action,
        createdAt: new Date(),
        lastTriggered: null,
      });
      return { success: true, id: docRef.id };
    } catch (error) {
      console.error('Error adding scheduled timer:', error);
      return { success: false, error: error.message };
    }
  },

  // Backward-compatible create API used by hooks
  createSchedule: async (userId, scheduleData) => {
    try {
      const isCountdown = scheduleData?.type === 'countdown';
      const countdownTime = scheduleData?.countdownTime || '00:00:00';

      const payload = {
        outlet: String(scheduleData?.outlet ?? '1'),
        type: isCountdown ? 'countdown' : 'scheduled',
        action: scheduleData?.action || 'ON',
        active: scheduleData?.active ?? true,
        days: Array.isArray(scheduleData?.days) ? scheduleData.days : [],
        scheduledDays: Array.isArray(scheduleData?.days) ? scheduleData.days : [],
        countdownTime: isCountdown ? countdownTime : null,
        countdownDuration: isCountdown ? clockToSeconds(countdownTime) : null,
        countdownRemaining: isCountdown ? clockToSeconds(countdownTime) : null,
        countdownStartedAt: isCountdown ? new Date() : null,
        scheduledTime: !isCountdown ? (scheduleData?.scheduledTime || '00:00') : null,
        createdAt: new Date(),
        lastTriggered: null,
      };

      const schedulesRef = collection(db, 'users', userId, 'schedules');
      const createdDoc = await addDoc(schedulesRef, payload);
      return { success: true, id: createdDoc.id };
    } catch (error) {
      console.error('Error creating schedule:', error);
      return { success: false, error: error.message };
    }
  },

  // Update schedule (toggle active/inactive)
  updateSchedule: async (userId, scheduleId, updates) => {
    try {
      await updateDoc(
        doc(db, 'users', userId, 'schedules', scheduleId),
        updates
      );
      return { success: true };
    } catch (error) {
      console.error('Error updating schedule:', error);
      return { success: false, error: error.message };
    }
  },

  // Delete schedule
  deleteSchedule: async (userId, scheduleId) => {
    try {
      await deleteDoc(doc(db, 'users', userId, 'schedules', scheduleId));
      return { success: true };
    } catch (error) {
      console.error('Error deleting schedule:', error);
      return { success: false, error: error.message };
    }
  },

  // Toggle schedule active status
  toggleScheduleActive: async (userId, scheduleId, active) => {
    try {
      await updateDoc(
        doc(db, 'users', userId, 'schedules', scheduleId),
        { active }
      );
      return { success: true };
    } catch (error) {
      console.error('Error toggling schedule:', error);
      return { success: false, error: error.message };
    }
  },
};