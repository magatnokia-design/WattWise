const admin = require('firebase-admin');
const logger = require('firebase-functions/logger');
const { HttpsError } = require('firebase-functions/v2/https');
const {
  normalizeUserProfiles,
  mergeSignatureIntoProfiles,
  isPlaceholderLabel,
} = require('../lib/applianceDetector');

const VALID_OUTLET_IDS = ['outlet1', 'outlet2'];
const MAX_LABEL_LENGTH = 40;

const normalizeLabel = (value) => String(value || '').trim().slice(0, MAX_LABEL_LENGTH);

/**
 * Renames a learned appliance signature, keeping its measurements.
 *
 * Until now `Forget` was the only action on a saved signature, so correcting a
 * name meant deleting the signature and re-teaching it - which throws away the
 * run it was measured from and leaves the detector unable to recognise that
 * appliance until it has been run again. A rename is a label change; there is no
 * reason for it to cost the measurements.
 *
 * Any outlet currently named after the signature is renamed with it. That is not
 * a convenience: `matchNamedAppliance` looks the outlet's name up in the saved
 * profiles, so a signature renamed on its own would leave the outlet pointing at
 * a label that no longer exists, and every run would come back `unknown` - the
 * appliance identity check would quietly stop working rather than fail.
 */
async function renameApplianceProfile(request) {
  try {
    const { auth, data } = request || {};

    if (!auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const fromLabel = normalizeLabel(data?.from || data?.label || data?.currentName);
    const toLabel = normalizeLabel(data?.to || data?.newName || data?.applianceName);

    if (!fromLabel) {
      throw new HttpsError('invalid-argument', 'from is required');
    }

    if (!toLabel) {
      throw new HttpsError('invalid-argument', 'to is required');
    }

    // "Outlet 1" is a slot, not an appliance. normalizeUserProfiles already drops
    // these, so allowing one here would make the rename appear to succeed and
    // then silently discard the signature on the next read.
    if (isPlaceholderLabel(toLabel)) {
      throw new HttpsError(
        'invalid-argument',
        `"${toLabel}" is an outlet name, not an appliance name`
      );
    }

    if (fromLabel === toLabel) {
      throw new HttpsError('invalid-argument', 'The new name is the same as the current one');
    }

    const db = admin.firestore();
    const userRef = db.doc(`users/${auth.uid}`);

    // Only the user document is transactional. The outlet documents are rewritten
    // by telemetry about once a second, and including them here is what made an
    // earlier version of registerApplianceProfile abort under contention whenever
    // the hardware was live.
    const result = await db.runTransaction(async (tx) => {
      const userDoc = await tx.get(userRef);
      const existing = normalizeUserProfiles((userDoc.data() || {}).applianceProfiles);

      const matchesFrom = (profile) => profile.label.toLowerCase() === fromLabel.toLowerCase();
      const matchesTo = (profile) => profile.label.toLowerCase() === toLabel.toLowerCase();

      if (!existing.some(matchesFrom)) {
        return { renamed: false, reason: 'not-found' };
      }

      // Renaming onto a name that already exists is a merge, not a collision.
      //
      // It used to be rejected with `already-exists`, and that was correct while
      // an appliance could hold only one signature: two different measurements
      // could not both be "Nokia's Iphone", so one of them had to be wrong. With
      // clusters they can, and the owner's blocked action turns out to have been
      // the right one all along - he had learned the same phone twice, at 28.8 W
      // and 10.5 W, and was trying to say they were the same appliance. There was
      // no way to express that; the rename was the closest thing available and it
      // was refused.
      //
      // The merge runs through the same near/far rule as a fresh confirmation, so
      // two measurements of one regime collapse into one cluster rather than
      // filling the appliance's budget with near-duplicates.
      const merging = existing.some((profile) => matchesTo(profile) && !matchesFrom(profile));
      const nowMs = Date.now();

      const renamedClusters = existing
        .filter(matchesFrom)
        .map((profile) => ({ ...profile, label: toLabel, updatedAtMs: nowMs }));

      const next = renamedClusters.reduce(
        (profiles, cluster) => mergeSignatureIntoProfiles(profiles, cluster, nowMs),
        existing.filter((profile) => !matchesFrom(profile))
      );

      tx.set(userRef, { applianceProfiles: next }, { merge: true });
      return { renamed: true, merged: merging, profiles: next };
    });

    if (!result.renamed && result.reason === 'not-found') {
      throw new HttpsError('not-found', `No saved appliance named "${fromLabel}"`);
    }

    // Carry the new name onto any outlet wearing the old one. Done after the
    // signature so the label an outlet points at always exists: if this half
    // fails, the outlet keeps a name with no signature behind it and its
    // identity reads `unknown`, which withholds a verdict rather than asserting
    // a wrong one.
    const outletRefs = VALID_OUTLET_IDS.map((outletId) =>
      db.doc(`users/${auth.uid}/outlets/${outletId}`)
    );

    const outletDocs = await db.getAll(...outletRefs);
    const batch = db.batch();
    const renamedOutlets = [];

    outletDocs.forEach((snapshot, index) => {
      if (!snapshot.exists) return;

      const currentName = String((snapshot.data() || {}).applianceName || '').trim();
      if (currentName.toLowerCase() !== fromLabel.toLowerCase()) return;

      batch.set(snapshot.ref, {
        applianceName: toLabel,
        'applianceSelection.name': toLabel,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      renamedOutlets.push(VALID_OUTLET_IDS[index]);
    });

    if (renamedOutlets.length > 0) {
      await batch.commit();
    }

    logger.info('Appliance signature renamed', {
      userId: auth.uid,
      from: fromLabel,
      to: toLabel,
      renamedOutlets,
    });

    return {
      success: true,
      from: fromLabel,
      to: toLabel,
      renamedOutlets,
      // True when the target name already existed: the caller asked to rename and
      // got a merge, which is a different thing to report back.
      merged: result.merged === true,
      profiles: result.profiles.length,
    };
  } catch (error) {
    if (error instanceof HttpsError) {
      logger.warn('Rename appliance profile rejected', {
        code: error.code,
        message: error.message,
      });
      throw error;
    }

    logger.error('Error renaming appliance profile:', {
      message: error?.message,
      stack: error?.stack,
    });

    throw new HttpsError('internal', error?.message || 'Failed to rename appliance profile');
  }
}

module.exports = { renameApplianceProfile };
