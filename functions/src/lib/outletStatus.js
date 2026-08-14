/**
 * Reconciles the status the app asked for against the status the device
 * reports.
 *
 * Commands are poll-based: the app writes a command, the ESP32 picks it up on
 * its next poll, and only then does the relay move. Telemetry keeps arriving
 * roughly once a second throughout that gap, carrying the relay's *current*
 * state - which is still the old one. Writing that telemetry status straight
 * through meant a freshly toggled outlet flipped back within a second, with
 * nothing in history explaining it, because telemetry writes no log.
 *
 * So a toggle stamps `pendingStatus` and a deadline on the outlet, and
 * telemetry defers to it until the device agrees or the window lapses.
 */

// Long enough to cover a poll cycle plus relay actuation and the next telemetry
// post; short enough that a device which never executes stops lying to the UI.
const PENDING_STATUS_WINDOW_MS = 20000;

/**
 * @param {object} previous Stored outlet document.
 * @param {string} reportedStatus Status from this telemetry payload.
 * @param {number} nowMs
 * @returns {{status: string, clearPending: boolean, pendingHonoured: boolean}}
 */
const resolveOutletStatus = (previous, reportedStatus, nowMs = Date.now()) => {
  const reported = String(reportedStatus || 'off').trim().toLowerCase();
  const pending = String(previous?.pendingStatus || '').trim().toLowerCase();
  const until = Number(previous?.pendingStatusUntilMs || 0);

  if (!pending) {
    return { status: reported, clearPending: false, pendingHonoured: false };
  }

  // The device has caught up - accept its word from here on.
  if (reported === pending) {
    return { status: reported, clearPending: true, pendingHonoured: false };
  }

  // The device never got there. Stop overriding: showing a stale "on" forever
  // would hide a genuinely failed command, which handleDeviceCommandEmails and
  // the push notification are there to surface.
  if (!until || nowMs > until) {
    return { status: reported, clearPending: true, pendingHonoured: false };
  }

  return { status: pending, clearPending: false, pendingHonoured: true };
};

/**
 * Whether the device is reporting a relay position WattWise never asked for.
 *
 * The Activity log's subtitle promises "every switch, wherever it came from",
 * and a power-cycle slipped straight past it: the ESP32 comes back with both
 * relays open, which is the module's default and correct behaviour, but two
 * outlets went from on to off with nothing written. Only commands write history,
 * and no command was issued.
 *
 * Requires the absence of a pending marker rather than just a lapsed one. A
 * command that was issued and never executed is a different event with its own
 * reporting - handleDeviceCommandEmails and the failure notification - and
 * logging it here as well would report one failure twice under two names.
 *
 * @param {object} previous Stored outlet document.
 * @param {string} reportedStatus Status from this telemetry payload.
 * @returns {boolean}
 */
const isUncommandedStatusChange = (previous, reportedStatus) => {
  const stored = String(previous?.status || '').trim().toLowerCase();
  const reported = String(reportedStatus || '').trim().toLowerCase();
  const pending = String(previous?.pendingStatus || '').trim().toLowerCase();

  // Nothing stored yet: this is the first telemetry for the outlet, not a change.
  if (stored !== 'on' && stored !== 'off') return false;
  if (reported !== 'on' && reported !== 'off') return false;
  if (pending) return false;

  return stored !== reported;
};

module.exports = {
  PENDING_STATUS_WINDOW_MS,
  resolveOutletStatus,
  isUncommandedStatusChange,
};
