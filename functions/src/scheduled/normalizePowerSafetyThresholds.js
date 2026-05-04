const admin = require('firebase-admin');
const logger = require('firebase-functions/logger');

const MAX_POWER_W = 500;
const BATCH_LIMIT = 400;

const getRawPowerMax = (rawData = {}) => {
  if (rawData?.thresholds?.power?.max != null) {
    return Number(rawData.thresholds.power.max);
  }
  if (rawData?.powerMax != null) {
    return Number(rawData.powerMax);
  }
  return NaN;
};

async function normalizePowerSafetyThresholds() {
  const db = admin.firestore();
  const usersSnapshot = await db.collection('users').get();

  let batch = db.batch();
  let batchCount = 0;
  let updatedUsers = 0;

  for (const userDoc of usersSnapshot.docs) {
    const userId = userDoc.id;
    const safetyRef = db.doc(`users/${userId}/power_safety/settings`);
    const safetyDoc = await safetyRef.get();
    if (!safetyDoc.exists) {
      continue;
    }

    const powerMax = getRawPowerMax(safetyDoc.data());
    if (!Number.isFinite(powerMax) || powerMax <= MAX_POWER_W) {
      continue;
    }

    batch.set(
      safetyRef,
      {
        'thresholds.power.max': MAX_POWER_W,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    updatedUsers += 1;
    batchCount += 1;

    if (batchCount >= BATCH_LIMIT) {
      await batch.commit();
      batch = db.batch();
      batchCount = 0;
    }
  }

  if (batchCount > 0) {
    await batch.commit();
  }

  logger.info('Power safety thresholds normalized', {
    updatedUsers,
    maxPowerW: MAX_POWER_W,
  });

  return { success: true, updatedUsers };
}

module.exports = { normalizePowerSafetyThresholds };
