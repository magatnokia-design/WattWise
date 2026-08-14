/*
 * The status pill on an outlet card.
 *
 * Same discipline as applianceLine.js next door: say only what the readings
 * support. The badge mixes two very different kinds of knowledge and has to keep
 * them apart —
 *
 *   `isOn`      the commanded state. Known from Firestore whether or not the
 *               hardware is reporting, because a toggle is written there.
 *   `isDrawing` the measured state. Known only while telemetry is arriving.
 *
 * "On, idle" asserts both at once: switched on AND consuming nothing. The first
 * half survives a telemetry gap and the second does not, so during one the badge
 * was claiming an outlet had nothing plugged into it on the strength of readings
 * that had stopped arriving twelve seconds earlier.
 */

/**
 * @param {object} args
 * @param {boolean} args.isOn            Commanded state.
 * @param {boolean} args.isDrawing       Real power above the floor.
 * @param {boolean} args.telemetryFresh  Readings arriving inside the 12 s window.
 * @param {'on'|'off'|null} args.switchingTo  A toggle the ESP32 has not polled yet.
 * @returns {{ text: string, tone: 'good'|'warn'|'neutral' }}
 */
export const resolveOutletBadge = ({ isOn, isDrawing, telemetryFresh, switchingTo }) => {
  // A command in flight outranks everything: for that window neither the
  // commanded state nor the meter is the whole truth, and the transition is.
  if (switchingTo === 'on') return { text: 'Switching on…', tone: 'warn' };
  if (switchingTo === 'off') return { text: 'Switching off…', tone: 'warn' };

  /*
   * No readings. The command is still known, so the on/off half is reported —
   * but nothing is said about the load, because nothing is being measured.
   *
   * Note this cannot be folded into the `isDrawing` branches below by relying on
   * metrics being zeroed while stale: zero *readings* and zero *watts* are
   * different facts, and collapsing them is precisely the bug.
   */
  if (!telemetryFresh) {
    return { text: isOn ? 'On · no reading' : 'Off', tone: 'neutral' };
  }

  if (!isOn) return { text: 'Off', tone: 'neutral' };

  return isDrawing
    ? { text: 'Drawing power', tone: 'good' }
    : { text: 'On, idle', tone: 'warn' };
};
