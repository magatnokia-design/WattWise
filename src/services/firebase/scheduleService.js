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

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_LABEL_TO_INDEX = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

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

const normalizeScheduleDays = (rawDays = []) => {
  if (!Array.isArray(rawDays)) return [];

  return rawDays
    .map((day) => {
      if (typeof day === 'number' && day >= 0 && day <= 6) return day;
      if (typeof day === 'string') {
        const label = day.slice(0, 3);
        const normalizedLabel = label.charAt(0).toUpperCase() + label.slice(1).toLowerCase();
        return Object.prototype.hasOwnProperty.call(DAY_LABEL_TO_INDEX, normalizedLabel)
          ? DAY_LABEL_TO_INDEX[normalizedLabel]
          : null;
      }
      return null;
    })
    .filter((day) => Number.isInteger(day));
};

const normalizeDaysForUi = (rawDays = []) => {
  if (!Array.isArray(rawDays)) return [];

  return rawDays
    .map((day) => {
      if (typeof day === 'number' && day >= 0 && day <= 6) return DAY_LABELS[day];
      if (typeof day === 'string') {
        const label = day.slice(0, 3);
        return label.charAt(0).toUpperCase() + label.slice(1).toLowerCase();
      }
      return null;
    })
    .filter(Boolean);
};

const normalizeScheduleData = (scheduleId, scheduleData = {}) => {
  const isCountdown = scheduleData.type === 'countdown';
  const rawDays = scheduleData.days || scheduleData.scheduledDays || [];

  return {
    id: scheduleId,
    ...scheduleData,
    type: scheduleData.type || (scheduleData.countdownDuration ? 'countdown' : 'scheduled'),
    outlet: String(scheduleData.outlet ?? '1'),
    action: scheduleData.action || 'ON',
    active: scheduleData.active ?? true,
    days: normalizeDaysForUi(rawDays),
    countdownTime: isCountdown
      ? (scheduleData.countdownTime || secondsToClock(scheduleData.countdownRemaining ?? scheduleData.countdownDuration))
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
      const scheduleDays = normalizeScheduleDays(timerData.days || timerData.scheduledDays || []);
      const docRef = await addDoc(schedulesRef, {
        outlet: timerData.outlet,
        type: 'scheduled',
        active: true,
        scheduledTime: timerData.time,
        days: scheduleDays,
        scheduledDays: scheduleDays,
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
      const scheduleDays = normalizeScheduleDays(scheduleData?.days || []);

      const payload = {
        outlet: String(scheduleData?.outlet ?? '1'),
        type: isCountdown ? 'countdown' : 'scheduled',
        action: scheduleData?.action || 'ON',
        active: scheduleData?.active ?? true,
        days: scheduleDays,
        scheduledDays: scheduleDays,
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