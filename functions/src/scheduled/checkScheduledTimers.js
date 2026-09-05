const admin = require('firebase-admin');
const logger = require('firebase-functions/logger');
const { dispatchDeviceCommand } = require('../lib/deviceCommandDispatcher');
const { createNotification } = require('../lib/notifications');
const { getManilaTimeString, getManilaWeekday } = require('../lib/manilaTime');
const { resolveOutletLogName } = require('../lib/applianceDetector');
const { resolveLogPower } = require('../lib/historyLog');
const { toMillis, countdownRemainingSeconds } = require('../lib/countdownClock');

const DAY_LABEL_TO_INDEX = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

const normalizeScheduleDays = (rawDays = []) => {
  if (!Array.isArray(rawDays)) return [];

  return rawDays
    .map((day) => {
      if (typeof day === 'number' && day >= 0 && day <= 6) return day;
      if (typeof day === 'string') {
        const normalized = day.slice(0, 3).toLowerCase();
        return Object.prototype.hasOwnProperty.call(DAY_LABEL_TO_INDEX, normalized)
          ? DAY_LABEL_TO_INDEX[normalized]
          : null;
      }
      return null;
    })
    .filter((day) => Number.isInteger(day));
};

const normalizeOutletId = (outlet) => {
  const outletString = String(outlet || '').trim();
  if (!outletString) return null;
  return outletString.startsWith('outlet') ? outletString : `outlet${outletString}`;
};

/**
 * Scheduled function: Runs every minute
 * Checks for scheduled timers that need execution
 * Toggles outlets if time matches
 */
async function checkScheduledTimers() {
  try {
    const db = admin.firestore();
    const now = new Date();
    // Schedules are stored as Manila wall-clock ("07:00"). The runtime clock is
    // UTC, so these must be converted explicitly - using now.getHours() here
    // fired every schedule 8 hours late and matched the wrong weekday.
    const currentTime = getManilaTimeString(now);
    const currentDay = getManilaWeekday(now); // 0 = Sunday, 6 = Saturday

    logger.info('Checking scheduled timers', { currentTime, currentDay });

    // Get all users
    const usersSnapshot = await db.collection('users').get();

    const promises = usersSnapshot.docs.map(async (userDoc) => {
      const userId = userDoc.id;

      try {
        // Get active fixed-time schedules for this user.
        const schedulesSnapshot = await db
          .collection(`users/${userId}/schedules`)
          .where('active', '==', true)
          .where('type', '==', 'scheduled')
          .get();

        for (const scheduleDoc of schedulesSnapshot.docs) {
          const schedule = scheduleDoc.data();
          const { scheduledTime, scheduledDays, days, outlet, action } = schedule;

          // Check if time matches
          if (scheduledTime !== currentTime) {
            continue;
          }

          // Check if today is included in scheduled days.
          const normalizedDays = normalizeScheduleDays(scheduledDays || days || []);
          if (!normalizedDays.includes(currentDay)) {
            continue;
          }

          // Check if already triggered in the last minute (prevent duplicate execution)
          const lastTriggered = schedule.lastTriggered?.toDate();
          if (lastTriggered && (now - lastTriggered) < 60000) {
            continue;
          }

          logger.info('Executing scheduled timer', { 
            userId, 
            scheduleId: scheduleDoc.id, 
            outlet, 
            action 
          });

          // Update outlet status
          const outletId = normalizeOutletId(outlet);
          if (!outletId) {
            logger.warn('Invalid outlet value in schedule', { userId, scheduleId: scheduleDoc.id, outlet });
            continue;
          }

          const outletRef = db.doc(`users/${userId}/outlets/${outletId}`);
          const outletDoc = await outletRef.get();

          if (!outletDoc.exists) {
            logger.warn('Outlet not found', { userId, outletId });
            continue;
          }

          const outletData = outletDoc.data();
          const newStatus = action.toLowerCase() === 'on';

          await outletRef.set({
            status: newStatus ? 'on' : 'off',
            // So a late device report of this state is not logged a second
            // time as an uncommanded change. See outletStatus.js.
            lastCommandedStatus: newStatus ? 'on' : 'off',
            lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });

          // Create activity log
          const outletNumber = parseInt(String(outletId).replace('outlet', ''), 10);

          // Id minted up front so it can ride along in the command metadata -
          // an unacknowledged schedule needs marking on the row it wrote.
          const historyRef = db.collection(`users/${userId}/history_logs`).doc();
          await historyRef.set({
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            outlet: Number.isNaN(outletNumber) ? null : outletNumber,
            outletName: resolveOutletLogName(outletData, outletNumber),
            action: newStatus ? 'on' : 'off',
            source: 'schedule',
            power: resolveLogPower(newStatus, outletData),
          });

          // Update schedule lastTriggered
          await scheduleDoc.ref.set({
            lastTriggered: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });

          const commandResult = await dispatchDeviceCommand({
            userId,
            outletId,
            action: newStatus ? 'on' : 'off',
            reason: 'scheduled_timer',
            source: 'scheduler',
            metadata: {
              scheduleId: scheduleDoc.id,
              scheduleType: 'scheduled',
              historyLogId: historyRef.id,
            },
          });

          await createNotification({
            userId,
            type: 'schedule',
            title: `Schedule turned ${newStatus ? 'on' : 'off'} ${outletData.applianceName || `Outlet ${outletNumber}`}`,
            message: `Your ${scheduledTime} schedule ran and switched the outlet ${newStatus ? 'on' : 'off'}.`,
            outlet: Number.isNaN(outletNumber) ? null : outletNumber,
            metadata: {
              scheduleId: scheduleDoc.id,
              scheduleType: 'scheduled',
              action: newStatus ? 'on' : 'off',
            },
          });

          logger.info('Scheduled timer executed', {
            userId,
            scheduleId: scheduleDoc.id,
            commandId: commandResult.commandId,
            commandChannel: commandResult.channel,
          });
        }

        // Get active countdown schedules for this user.
        const countdownSnapshot = await db
          .collection(`users/${userId}/schedules`)
          .where('active', '==', true)
          .where('type', '==', 'countdown')
          .get();

        for (const scheduleDoc of countdownSnapshot.docs) {
          const schedule = scheduleDoc.data();
          const { outlet, action } = schedule;
          // Shared with the clients through countdownClock.js. Measuring from
          // countdownDuration + countdownStartedAt is what lets a paused timer
          // resume correctly without this job knowing pausing exists.
          const remainingSeconds = countdownRemainingSeconds(schedule, now.getTime());

          // Unreadable, not expired. Firing on a document we cannot read would
          // switch an outlet on no evidence.
          if (remainingSeconds === null) {
            continue;
          }

          // Keep remaining value fresh for clients.
          await scheduleDoc.ref.set({ countdownRemaining: remainingSeconds }, { merge: true });

          if (remainingSeconds > 0) {
            continue;
          }

          const lastTriggeredMs = toMillis(schedule.lastTriggered);
          if (lastTriggeredMs && (now.getTime() - lastTriggeredMs) < 60000) {
            continue;
          }

          const outletId = normalizeOutletId(outlet);
          if (!outletId) {
            logger.warn('Invalid outlet value in countdown schedule', { userId, scheduleId: scheduleDoc.id, outlet });
            continue;
          }

          const outletRef = db.doc(`users/${userId}/outlets/${outletId}`);
          const outletDoc = await outletRef.get();
          if (!outletDoc.exists) {
            logger.warn('Outlet not found for countdown schedule', { userId, outletId });
            continue;
          }

          const outletData = outletDoc.data();
          const newStatus = String(action || 'ON').toLowerCase() === 'on';
          const outletNumber = parseInt(String(outletId).replace('outlet', ''), 10);

          await outletRef.set({
            status: newStatus ? 'on' : 'off',
            // So a late device report of this state is not logged a second
            // time as an uncommanded change. See outletStatus.js.
            lastCommandedStatus: newStatus ? 'on' : 'off',
            lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });

          const historyRef = db.collection(`users/${userId}/history_logs`).doc();
          await historyRef.set({
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            outlet: Number.isNaN(outletNumber) ? null : outletNumber,
            outletName: resolveOutletLogName(outletData, outletNumber),
            action: newStatus ? 'on' : 'off',
            source: 'countdown',
            power: resolveLogPower(newStatus, outletData),
          });

          await scheduleDoc.ref.set({
            active: false,
            countdownRemaining: 0,
            lastTriggered: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });

          const commandResult = await dispatchDeviceCommand({
            userId,
            outletId,
            action: newStatus ? 'on' : 'off',
            reason: 'countdown_timer',
            source: 'scheduler',
            metadata: {
              scheduleId: scheduleDoc.id,
              scheduleType: 'countdown',
              historyLogId: historyRef.id,
            },
          });

          await createNotification({
            userId,
            type: 'schedule',
            title: `Timer turned ${newStatus ? 'on' : 'off'} ${outletData.applianceName || `Outlet ${outletNumber}`}`,
            message: `Your countdown finished and switched the outlet ${newStatus ? 'on' : 'off'}.`,
            outlet: Number.isNaN(outletNumber) ? null : outletNumber,
            metadata: {
              scheduleId: scheduleDoc.id,
              scheduleType: 'countdown',
              action: newStatus ? 'on' : 'off',
            },
          });

          logger.info('Countdown timer executed', {
            userId,
            scheduleId: scheduleDoc.id,
            outletId,
            action: newStatus ? 'on' : 'off',
            commandId: commandResult.commandId,
            commandChannel: commandResult.channel,
          });
        }

      } catch (userError) {
        logger.error('Error processing user schedules', { userId, error: userError });
      }
    });

    await Promise.all(promises);

    logger.info('Scheduled timers check completed');
    return { success: true };

  } catch (error) {
    logger.error('Error checking scheduled timers:', error);
    throw error;
  }
}

module.exports = { checkScheduledTimers };