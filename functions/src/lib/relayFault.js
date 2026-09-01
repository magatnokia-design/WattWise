/**
 * Detects a relay that will not open.
 *
 * The system already reconciles two of the three states an outlet has, and this
 * is the third:
 *
 *   commanded  what the app asked for            -> processOutletToggle
 *   reported   where the ESP32 believes the relay is -> resolveOutletStatus
 *   measured   whether current is actually flowing   -> nowhere, until now
 *
 * The ESP32 reports the relay position from its own `digitalWrite` bookkeeping,
 * so a channel whose contacts have welded shut reports `off` perfectly happily
 * while the load keeps running. Both halves of the reconciliation agree, the
 * command is acked `executed`, `markStaleDeviceCommands` finds nothing to time
 * out, and the PZEM on that same outlet reads 15 W throughout. Nothing compared
 * those two numbers, so the failure was silent on both clients and in the logs.
 *
 * This is a safety fault, not a cosmetic one: the auto-cutoff in
 * handleSafetyAlerts drives the same relay, so an outlet that cannot be opened
 * cannot be protected either. It has to be surfaced rather than smoothed over -
 * a stuck contact is the one condition where the honest answer is that WattWise
 * has lost control of the outlet and the user should pull the plug.
 *
 * Deliberately measurement-only. Nothing here retries a command, and nothing
 * escalates: re-driving a welded contact does not unweld it, and hammering the
 * coil is how the neighbouring channel gets damaged too.
 */

// Current has to keep flowing through an outlet the device calls off for this
// long before the fault is declared. Sized above the 20 s pending window in
// outletStatus.js plus a poll cycle: below that a slow poll is indistinguishable
// from a stuck contact, and reporting a broken relay on every ordinary toggle
// would train the user to ignore the one that matters.
const STUCK_CONFIRM_MS = 30000;

// Above the PZEM noise floor. The meter reads a few hundredths of an amp at
// 0.0 W on an open outlet, and outletRuntime.js already learned not to treat
// that as a load.
const STUCK_POWER_FLOOR_W = 3;

// Hysteresis. Clearing at the same threshold that trips would let a load
// hovering around the floor latch and unlatch on consecutive samples.
const CLEAR_POWER_FLOOR_W = 1;

// The load side has to be DEAD before a confirmed fault is cleared, not merely
// idle. The PZEM sits on the load side of the relay, so the two states that
// both read 0 W are physically different and the meter can tell them apart:
//
//   relay actually opened        ->   0 V, 0 W
//   relay stuck + load unplugged -> 245 V, 0 W
//
// Clearing on power alone treated the second as recovery. A real account saw
// "Outlet is switching again - Outlet 2 responded to a switch-off and is now
// drawing no power" twice, from a relay that had never released; the user had
// only unplugged the charger. Unplugging the load proves nothing about the
// contact, and saying otherwise retracts a safety warning that is still true.
//
// Well above any capacitive ghost reading on an open contact, far below mains.
const CLEAR_VOLTAGE_FLOOR_V = 40;

const OK = 'ok';
const SUSPECTED = 'suspected';
const STUCK = 'stuck_closed';

const toFiniteNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const clearedState = () => ({
  state: OK,
  firstSeenAtMs: 0,
  observedW: 0,
  confirmedAtMs: 0,
});

/**
 * @param {object} args
 * @param {object} args.previous  Stored outlet document (may be empty).
 * @param {string} args.status    Status after resolveOutletStatus has run.
 * @param {number} args.powerW    Real power from this telemetry sample.
 * @param {number} [args.voltageV] Load-side voltage from the same sample. Used
 *   only to clear a fault: current proves a contact is closed, but only the
 *   absence of voltage proves it opened. Omitted or unreadable, clearing falls
 *   back to power alone rather than latching a fault that can never clear.
 * @param {boolean} args.pendingHonoured  True while the device has not polled
 *   the latest command yet - during that window the relay is legitimately still
 *   in its old position and the current flowing through it is expected.
 * @param {number} args.nowMs
 * @returns {{state: string, firstSeenAtMs: number, observedW: number,
 *   confirmedAtMs: number, justTripped: boolean, justCleared: boolean}}
 */
const evaluateRelayFault = ({
  previous = {},
  status,
  powerW,
  voltageV,
  pendingHonoured = false,
  nowMs = Date.now(),
} = {}) => {
  const stored = previous?.relayFault || {};
  const wasStuck = stored.state === STUCK;
  const resolvedStatus = String(status || '').trim().toLowerCase();
  const watts = Math.max(0, toFiniteNumber(powerW));

  const settled = (next) => ({
    ...next,
    justTripped: next.state === STUCK && !wasStuck,
    justCleared: wasStuck && next.state === OK,
  });

  // A closed relay carrying current is the entire point of the outlet.
  if (resolvedStatus !== 'off') return settled(clearedState());

  // The command has not reached the device yet. Telemetry is still describing
  // the old relay position and is not evidence of anything.
  if (pendingHonoured) {
    return settled({
      state: stored.state === STUCK ? STUCK : OK,
      firstSeenAtMs: 0,
      observedW: toFiniteNumber(stored.observedW),
      confirmedAtMs: toFiniteNumber(stored.confirmedAtMs),
    });
  }

  // The relay opened. The only path that clears a confirmed fault, and it now
  // asks the question that actually settles it: is the load side dead?
  //
  // No current used to be enough. It is not - see CLEAR_VOLTAGE_FLOOR_V. An
  // outlet reading 0 W at 245 V, commanded off, is a contact that is still
  // closed with nothing plugged into it, and reporting that as recovery is how
  // a live outlet came to be marked safe.
  //
  // A build that does not report voltage falls back to power alone. Latching a
  // fault that can never clear would be worse than the bug being fixed.
  const volts = toFiniteNumber(voltageV, NaN);
  const loadSideDead = Number.isFinite(volts) ? volts <= CLEAR_VOLTAGE_FLOOR_V : true;

  if (watts <= CLEAR_POWER_FLOOR_W && loadSideDead) return settled(clearedState());

  if (watts <= STUCK_POWER_FLOOR_W) {
    // Between the two floors: not enough to call it a load, not little enough
    // to call it clear. Hold whatever was already decided.
    return settled({
      state: stored.state === STUCK ? STUCK : (stored.state === SUSPECTED ? SUSPECTED : OK),
      firstSeenAtMs: toFiniteNumber(stored.firstSeenAtMs),
      observedW: toFiniteNumber(stored.observedW),
      confirmedAtMs: toFiniteNumber(stored.confirmedAtMs),
    });
  }

  const firstSeenAtMs = toFiniteNumber(stored.firstSeenAtMs) || nowMs;
  const heldForMs = nowMs - firstSeenAtMs;

  if (wasStuck || heldForMs >= STUCK_CONFIRM_MS) {
    return settled({
      state: STUCK,
      firstSeenAtMs,
      observedW: watts,
      confirmedAtMs: toFiniteNumber(stored.confirmedAtMs) || nowMs,
    });
  }

  return settled({
    state: SUSPECTED,
    firstSeenAtMs,
    observedW: watts,
    confirmedAtMs: 0,
  });
};

module.exports = {
  evaluateRelayFault,
  STUCK_CONFIRM_MS,
  STUCK_POWER_FLOOR_W,
  CLEAR_POWER_FLOOR_W,
  CLEAR_VOLTAGE_FLOOR_V,
  RELAY_FAULT_STATES: { OK, SUSPECTED, STUCK },
};
