const admin = require('firebase-admin');
const logger = require('firebase-functions/logger');

/**
 * Scheduled function: Runs daily at midnight (00:00)
 * Aggregates previous day's energy usage
 * Creates history_daily document
 * Updates monthly budget spending
 */
async function processDailyRollup() {
  try {
    const db = admin.firestore();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const yesterdayEnd = new Date(yesterday);
    yesterdayEnd.setHours(23, 59, 59, 999);

    const dateString = yesterday.toISOString().split('T')[0]; // YYYY-MM-DD
    const monthString = dateString.substring(0, 7); // YYYY-MM

    logger.info('Starting daily rollup', { date: dateString });

    // Get all users
    const usersSnapshot = await db.collection('users').get();

    const promises = usersSnapshot.docs.map(async (userDoc) => {
      const userId = userDoc.id;
      const userData = userDoc.data();
      const electricityRate = userData.electricityRate || 0;

      try {
        // Get all activity logs for yesterday
        const logsSnapshot = await db
          .collection(`users/${userId}/history_logs`)
          .where('timestamp', '>=', yesterday)
          .where('timestamp', '<=', yesterdayEnd)
          .get();

        // Get outlet energy readings
        const outlet1Doc = await db.doc(`users/${userId}/outlets/outlet1`).get();
        const outlet2Doc = await db.doc(`users/${userId}/outlets/outlet2`).get();

        const outlet1Energy = outlet1Doc.exists ? (outlet1Doc.data().energy || 0) : 0;
        const outlet2Energy = outlet2Doc.exists ? (outlet2Doc.data().energy || 0) : 0;
        const totalEnergy = outlet1Energy + outlet2Energy;

        // Calculate peak power from logs
        let peakPower = 0;
        let peakHour = 0;

        logsSnapshot.forEach((logDoc) => {
          const logData = logDoc.data();
          if (logData.power > peakPower) {
            peakPower = logData.power;
            const timestamp = logData.timestamp?.toDate() || new Date();
            peakHour = timestamp.getHours();
          }
        });

        // Calculate cost
        const cost = totalEnergy * electricityRate;

        // Create history_daily document
        const dailyRef = db.doc(`users/${userId}/history_daily/${dateString}`);
        await dailyRef.set({
          date: dateString,
          outlet1Energy,
          outlet2Energy,
          totalEnergy,
          cost,
          peakPower,
          peakHour,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Update monthly budget
        const budgetRef = db.doc(`users/${userId}/budget/${monthString}`);
        const budgetDoc = await budgetRef.get();

        const currentSpending = budgetDoc.exists 
          ? (budgetDoc.data().currentSpending || 0) 
          : 0;
        const outlet1Spending = budgetDoc.exists 
          ? (budgetDoc.data().outlet1Spending || 0) 
          : 0;
        const outlet2Spending = budgetDoc.exists 
          ? (budgetDoc.data().outlet2Spending || 0) 
          : 0;

        const outlet1Cost = outlet1Energy * electricityRate;
        const outlet2Cost = outlet2Energy * electricityRate;

        await budgetRef.set({
          month: monthString,
          currentSpending: currentSpending + cost,
          outlet1Spending: outlet1Spending + outlet1Cost,
          outlet2Spending: outlet2Spending + outlet2Cost,
          lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });

        // Reset daily energy counters
        if (outlet1Doc.exists) {
          await db.doc(`users/${userId}/outlets/outlet1`).set({
            energy: 0,
            lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });
        }

        if (outlet2Doc.exists) {
          await db.doc(`users/${userId}/outlets/outlet2`).set({
            energy: 0,
            lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });
        }

        logger.info('Daily rollup completed for user', { 
          userId, 
          totalEnergy, 
          cost 
        });

      } catch (userError) {
        logger.error('Error processing user rollup', { userId, error: userError });
      }
    });

    await Promise.all(promises);

    logger.info('Daily rollup completed for all users');
    return { success: true, processedUsers: usersSnapshot.size };

  } catch (error) {
    logger.error('Error in daily rollup:', error);
    throw error;
  }
}

module.exports = { processDailyRollup };