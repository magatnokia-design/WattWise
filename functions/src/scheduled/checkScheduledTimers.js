const admin = require('firebase-admin');
const logger = require('firebase-functions/logger');

/**
 * Scheduled function: Runs every minute
 * Checks for scheduled timers that need execution
 * Toggles outlets if time matches
 */
async function checkScheduledTimers() {
  try {
    const db = admin.firestore();
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const currentDay = now.getDay(); // 0 = Sunday, 6 = Saturday

    logger.info('Checking scheduled timers', { currentTime, currentDay });

    // Get all users
    const usersSnapshot = await db.collection('users').get();

    const promises = usersSnapshot.docs.map(async (userDoc) => {
      const userId = userDoc.id;

      try {
        // Get active scheduled timers for this user
        const schedulesSnapshot = await db
          .collection(`users/${userId}/schedules`)
          .where('active', '==', true)
          .where('type', '==', 'scheduled')
          .get();

        for (const scheduleDoc of schedulesSnapshot.docs) {
          const schedule = scheduleDoc.data();
          const { scheduledTime, scheduledDays, outlet, action } = schedule;

          // Check if time matches
          if (scheduledTime !== currentTime) {
            continue;
          }

          // Check if today is included in scheduled days
          if (!Array.isArray(scheduledDays) || !scheduledDays.includes(currentDay)) {
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
          const outletId = `outlet${outlet}`;
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
            lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });

          // Create activity log
          await db.collection(`users/${userId}/history_logs`).add({
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            outlet: parseInt(outlet),
            outletName: outletData.applianceName || `Outlet ${outlet}`,
            action: newStatus ? 'on' : 'off',
            source: 'schedule',
            power: outletData.power || 0,
          });

          // Update schedule lastTriggered
          await scheduleDoc.ref.set({
            lastTriggered: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });

          // TODO: Send command to ESP32
          // const rtdb = admin.database();
          // await rtdb.ref(`devices/${userId}/commands/${outletId}`).set({
          //   action: newStatus ? 'on' : 'off',
          //   timestamp: Date.now(),
          // });

          logger.info('Scheduled timer executed', { 
            userId, 
            scheduleId: scheduleDoc.id 
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