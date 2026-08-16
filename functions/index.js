const admin = require('firebase-admin');
const { onRequest } = require('firebase-functions/v2/https');
const { onCall } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onDocumentWritten, onDocumentCreated } = require('firebase-functions/v2/firestore');
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
// Per-caller limits for the callables. Applied here rather than inside each
// handler so the whole policy is visible next to the trigger config, and so it
// is obvious that the three ESP32 onRequest endpoints below are deliberately
// NOT wrapped - the hardware cannot back off, and deviceSecurity.js already
// guards those with token, freshness and replay checks of its own.
const { withRateLimit, RATE_LIMITS } = require('./src/lib/rateLimiter');
const { updateOutletMetrics } = require('./src/http/updateOutletMetrics');
const { ackDeviceCommand } = require('./src/http/ackDeviceCommand');
const { getDeviceCommand } = require('./src/http/getDeviceCommand');
const { processOutletToggle } = require('./src/http/processOutletToggle');
const { clearAutoDetection } = require('./src/http/clearAutoDetection');
const { registerApplianceProfile } = require('./src/http/registerApplianceProfile');
const { removeApplianceProfile } = require('./src/http/removeApplianceProfile');
const { deleteAccount } = require('./src/http/deleteAccount');
const { renameApplianceProfile } = require('./src/http/renameApplianceProfile');
const { linkDeviceToAccount } = require('./src/http/linkDeviceToAccount');
const { checkUserExistsByEmail } = require('./src/http/checkUserExistsByEmail');
const { sendPasswordResetEmail } = require('./src/http/sendPasswordResetEmail');
const { sendVerificationEmail } = require('./src/http/sendVerificationEmail');
const { sendInvoiceEmail } = require('./src/http/sendInvoiceEmail');
const { processDailyRollup } = require('./src/scheduled/processDailyRollup');
const { processMonthlyInvoice } = require('./src/scheduled/processMonthlyInvoice');
const { finalizeInvoice } = require('./src/http/finalizeInvoice');
const { repriceDailyRollups } = require('./src/http/repriceDailyRollups');
const { checkScheduledTimers } = require('./src/scheduled/checkScheduledTimers');
const { markStaleDeviceCommands } = require('./src/scheduled/markStaleDeviceCommands');
const { checkPushReceipts } = require('./src/scheduled/checkPushReceipts');
const { normalizePowerSafetyThresholds } = require('./src/scheduled/normalizePowerSafetyThresholds');
const { handleBudgetAlerts } = require('./src/triggers/handleBudgetAlerts');
const { handleSafetyAlerts } = require('./src/triggers/handleSafetyAlerts');
const { handleDeviceCommandEmails } = require('./src/triggers/handleDeviceCommandEmails');
const { handleDailyReceiptEmails } = require('./src/triggers/handleDailyReceiptEmails');
const { handlePushNotifications } = require('./src/triggers/handlePushNotifications');

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

/**
 * HTTP endpoint for ESP32 to acknowledge command delivery/execution
 * POST https://asia-southeast1-wattwise-fe394.cloudfunctions.net/ackDeviceCommand
 */
exports.ackDeviceCommand = onRequest(
  {
    cors: true,
    maxInstances: 10,
  },
  ackDeviceCommand
);

/**
 * HTTP endpoint for ESP32 to fetch latest pending command
 * POST https://asia-southeast1-wattwise-fe394.cloudfunctions.net/getDeviceCommand
 */
exports.getDeviceCommand = onRequest(
  {
    cors: true,
    maxInstances: 10,
  },
  getDeviceCommand
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
    // Deliberately no minInstances. A warm instance would remove the cold-start
    // delay on the first toggle after an idle spell, but it bills CPU and
    // memory for every second of the month whether used or not - more than this
    // project's whole budget. The optimistic update on the client already hides
    // that latency: the switch moves immediately and reconciles when the write
    // lands. Revisit only if the project ever has room for always-on cost.
  },
  withRateLimit(processOutletToggle, RATE_LIMITS.processOutletToggle)
);

/**
 * Callable function to clear auto-detection metadata for outlets
 * Called from: Settings screen
 */
exports.clearAutoDetection = onCall(
  {
    maxInstances: 10,
  },
  withRateLimit(clearAutoDetection, RATE_LIMITS.clearAutoDetection)
);

/**
 * Callable function to learn the running appliance's power signature after the
 * user confirms its name
 * Called from: Dashboard screen (accept suggestion / rename appliance)
 */
exports.registerApplianceProfile = onCall(
  {
    maxInstances: 10,
  },
  withRateLimit(registerApplianceProfile, RATE_LIMITS.registerApplianceProfile)
);

/**
 * Callable function to lock a billing month to the official PELCO III rates
 * Called from: Billing screen ("Update to actual rate")
 */
exports.finalizeInvoice = onCall(
  {
    maxInstances: 10,
  },
  withRateLimit(finalizeInvoice, RATE_LIMITS.finalizeInvoice)
);

/**
 * Callable function to strip the once-a-month metering flat from daily rows
 * that were priced before a day stopped being treated as a billing period.
 * Reprices from each row's stored energy; never re-derives the energy itself.
 * Idempotent - rows already priced without the flats are skipped.
 * Called from: maintenance, with { apply: true } to commit
 */
exports.repriceDailyRollups = onCall(
  {
    maxInstances: 10,
  },
  withRateLimit(repriceDailyRollups, RATE_LIMITS.repriceDailyRollups)
);

/**
 * Callable function to delete the signed-in account and everything stored under
 * it, and release any paired device so the hardware can be linked again
 * Called from: Settings screen (Delete Account)
 */
exports.deleteAccount = onCall(
  {
    maxInstances: 10,
    // recursiveDelete walks every subcollection under the user, and a long-lived
    // account carries a year of per-second history. The default 60s is not
    // enough to be sure it finishes.
    timeoutSeconds: 300,
  },
  withRateLimit(deleteAccount, RATE_LIMITS.deleteAccount)
);

/**
 * Callable function to delete one learned appliance signature
 * Called from: Settings screen (Saved Appliances)
 */
exports.removeApplianceProfile = onCall(
  {
    maxInstances: 10,
  },
  withRateLimit(removeApplianceProfile, RATE_LIMITS.removeApplianceProfile)
);

/**
 * Callable function to rename one learned appliance signature, keeping its
 * measurements, and carry the new name onto any outlet using it
 * Called from: Settings screen (Saved Appliances)
 */
exports.renameApplianceProfile = onCall(
  {
    maxInstances: 10,
  },
  withRateLimit(renameApplianceProfile, RATE_LIMITS.renameApplianceProfile)
);

/**
 * Callable function to bind an ESP32 to the calling account, including taking
 * it over from a previous account when the correct device token is presented
 * Called from: Settings screen (QR scan and manual entry)
 */
exports.linkDeviceToAccount = onCall(
  {
    maxInstances: 10,
  },
  withRateLimit(linkDeviceToAccount, RATE_LIMITS.linkDeviceToAccount)
);

/**
 * Callable function to verify whether an email exists in Firebase Auth
 * Called from: Forgot password flow before sending reset email
 */
exports.checkUserExistsByEmail = onCall(
  {
    maxInstances: 10,
  },
  withRateLimit(checkUserExistsByEmail, RATE_LIMITS.checkUserExistsByEmail)
);

/**
 * Callable function to send the branded password reset email
 * Called from: Forgot password flow, on both the app and the web client
 *
 * Deliberately callable without a session - a user who has forgotten their
 * password cannot sign in first. Throttled per address in authEmails.js.
 */
exports.sendPasswordResetEmail = onCall(
  {
    maxInstances: 10,
  },
  withRateLimit(sendPasswordResetEmail, RATE_LIMITS.sendPasswordResetEmail)
);

/**
 * Callable function to send the branded address-confirmation email
 * Called from: registration, and the verify-email screen's resend button
 */
exports.sendVerificationEmail = onCall(
  {
    maxInstances: 10,
  },
  withRateLimit(sendVerificationEmail, RATE_LIMITS.sendVerificationEmail)
);

/**
 * Callable function to re-send a monthly statement with its PDF attachment
 * Called from: a user asking for another copy, and to rehearse the attachment
 * path that processMonthlyInvoice otherwise only exercises once a month
 *
 * memory matches processMonthlyInvoice deliberately: PDF rendering is what
 * could exhaust it, and a rehearsal with more headroom than the real job would
 * hide exactly the failure it exists to catch. The shorter timeout is safe -
 * this handles one account where the scheduled job walks every user.
 */
exports.sendInvoiceEmail = onCall(
  {
    maxInstances: 10,
    memory: '512MiB',
    timeoutSeconds: 120,
  },
  withRateLimit(sendInvoiceEmail, RATE_LIMITS.sendInvoiceEmail)
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
 * Runs at 00:20 Asia/Manila on the 1st of each month, after processDailyRollup
 * has closed the final day. Closes the month that just ended, stores the
 * invoice as PENDING, and emails the user a PDF statement.
 */
exports.processMonthlyInvoice = onSchedule(
  {
    schedule: '20 0 1 * *', // 00:20 on the 1st
    timeZone: 'Asia/Manila',
    maxInstances: 1,
    timeoutSeconds: 300,
    memory: '512MiB',
  },
  processMonthlyInvoice
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

/**
 * Runs every minute
 * Marks unacknowledged device commands as timed out
 */
exports.markStaleDeviceCommands = onSchedule(
  {
    schedule: '* * * * *',
    timeZone: 'Asia/Manila',
    maxInstances: 1,
  },
  markStaleDeviceCommands
);

/**
 * Runs every 10 minutes to read the delivery outcome of pushes already sent
 * Expo only reports acceptance at send time; the receipt says whether FCM took
 * it, and is not available for several minutes
 */
exports.checkPushReceipts = onSchedule(
  {
    schedule: '*/10 * * * *',
    timeZone: 'Asia/Manila',
    maxInstances: 1,
  },
  checkPushReceipts
);

/**
 * Runs daily to enforce the 500W power cap in user safety settings
 */
exports.normalizePowerSafetyThresholds = onSchedule(
  {
    schedule: '0 2 * * *',
    timeZone: 'Asia/Manila',
    maxInstances: 1,
  },
  normalizePowerSafetyThresholds
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

/**
 * Triggers when device command status updates
 * Sends device command failure emails
 */
exports.handleDeviceCommandEmails = onDocumentWritten(
  {
    document: 'users/{userId}/device_commands/{commandId}',
    maxInstances: 5,
  },
  handleDeviceCommandEmails
);

/**
 * Triggers when daily history summary is created
 * Sends daily receipt emails
 */
exports.handleDailyReceiptEmails = onDocumentWritten(
  {
    document: 'users/{userId}/history_daily/{date}',
    maxInstances: 5,
  },
  handleDailyReceiptEmails
);

/**
 * Triggers when a notification document is created
 * Sends the notification to the user's devices as a push notification.
 * Created-only (not written) so marking a notification read never re-sends it.
 */
exports.handlePushNotifications = onDocumentCreated(
  {
    document: 'users/{userId}/notifications/{notificationId}',
    maxInstances: 5,
  },
  handlePushNotifications
);