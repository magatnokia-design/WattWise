const admin = require('firebase-admin');
const { onRequest } = require('firebase-functions/v2/https');
const { onCall } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { setGlobalOptions } = require('firebase-functions/v2');

// Initialize Firebase Admin SDK
admin.initializeApp();

// Set global options
setGlobalOptions({
  maxInstances: 10,
  region: 'asia-southeast1', // Closest to Philippines
  memory: '256MiB',
  timeoutSeconds: 60,
});

// Import function modules
const { updateOutletMetrics } = require('./src/http/updateOutletMetrics');
const { processOutletToggle } = require('./src/http/processOutletToggle');
const { processDailyRollup } = require('./src/scheduled/processDailyRollup');
const { checkScheduledTimers } = require('./src/scheduled/checkScheduledTimers');
const { handleBudgetAlerts } = require('./src/triggers/handleBudgetAlerts');
const { handleSafetyAlerts } = require('./src/triggers/handleSafetyAlerts');

// ===========================
// HTTP ENDPOINTS
// ===========================

/**
 * HTTP endpoint for ESP32 to send sensor data
 * POST https://asia-southeast1-wattwise-fe394.cloudfunctions.net/updateOutletMetrics
 */
exports.updateOutletMetrics = onRequest(
  {
    cors: true, // Allow CORS for ESP32
    maxInstances: 10,
  },
  updateOutletMetrics
);

// ===========================
// HTTPS CALLABLE FUNCTIONS
// ===========================

/**
 * Callable function for app to toggle outlets
 * Called from: Dashboard screen
 */
exports.processOutletToggle = onCall(
  {
    maxInstances: 10,
  },
  processOutletToggle
);

// ===========================
// SCHEDULED FUNCTIONS
// ===========================

/**
 * Runs daily at midnight (00:00 Asia/Manila timezone)
 * Aggregates previous day's usage
 */
exports.processDailyRollup = onSchedule(
  {
    schedule: '0 0 * * *', // Every day at midnight
    timeZone: 'Asia/Manila',
    maxInstances: 1,
  },
  processDailyRollup
);

/**
 * Runs every minute
 * Checks and executes scheduled timers
 */
exports.checkScheduledTimers = onSchedule(
  {
    schedule: '* * * * *', // Every minute
    timeZone: 'Asia/Manila',
    maxInstances: 1,
  },
  checkScheduledTimers
);

// ===========================
// FIRESTORE TRIGGERS
// ===========================

/**
 * Triggers when budget document is written
 * Creates notifications for threshold breaches
 */
exports.handleBudgetAlerts = onDocumentWritten(
  {
    document: 'users/{userId}/budget/{month}',
    maxInstances: 5,
  },
  handleBudgetAlerts
);

/**
 * Triggers when power_safety document is written
 * Creates safety notifications and auto-cutoff if needed
 */
exports.handleSafetyAlerts = onDocumentWritten(
  {
    document: 'users/{userId}/power_safety/{document}',
    maxInstances: 5,
  },
  handleSafetyAlerts
);