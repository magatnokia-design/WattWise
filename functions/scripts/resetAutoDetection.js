const admin = require('firebase-admin');
const { normalizeDetectionState } = require('../src/lib/applianceDetector');

const args = process.argv.slice(2);
const projectFlagIndex = args.indexOf('--project');
const projectId = projectFlagIndex >= 0 ? args[projectFlagIndex + 1] : null;

if (!projectId) {
  console.error('Missing project id. Run with --project <project-id>.');
  process.exit(1);
}

admin.initializeApp({ projectId });

const db = admin.firestore();

const resetPayload = {
  autoDetectedAppliance: '',
  applianceDetection: {
    modelVersion: '',
    confidence: 0,
    candidates: [],
    features: {},
    updatedAtMs: 0,
  },
  detectionState: normalizeDetectionState(null, 'off'),
};

async function run() {
  console.log(`Resetting auto-detection fields in ${projectId}...`);

  const outletsSnapshot = await db.collectionGroup('outlets').get();

  if (outletsSnapshot.empty) {
    console.log('No outlet documents found.');
    return;
  }

  const writer = db.bulkWriter();
  writer.onWriteError((error) => {
    console.error('Write failed:', error.message);
    return false;
  });

  outletsSnapshot.docs.forEach((doc) => {
    writer.set(doc.ref, resetPayload, { merge: true });
  });

  await writer.close();
  console.log(`Updated ${outletsSnapshot.size} outlet documents.`);
}

run().catch((error) => {
  console.error('Reset failed:', error.message);
  process.exit(1);
});
