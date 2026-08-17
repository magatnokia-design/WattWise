/**
 * The power figure written onto a switch event in `history_logs`.
 *
 * The rule is one line long and was wrong in all three places that wrote it, so
 * it lives here instead: **only a switch-off carries a wattage.**
 *
 * A switch-off records the draw measured just before the relay opened, which is
 * the useful figure - "it was pulling 61 W when I killed it". A switch-on has
 * nothing to measure. The outlet was off, and whatever load is about to be
 * connected has not drawn anything yet; the reading only develops over the
 * seconds *after* the log row is written.
 *
 * What made this a correctness bug rather than a cosmetic one is what
 * `outletData.power` actually holds at that moment. It is the last telemetry the
 * device posted, and after a switch-off the device has not yet posted a zero -
 * so it still contains the reading from *before* that switch-off. Logging it on
 * the next switch-on credited the new event with the previous session's wattage.
 * A lamp switched off at 15.2 W and back on seconds later recorded 14.9 W
 * against the switch-on: a measurement of an outlet that was drawing nothing.
 *
 * On the History screen that showed up as a POWER column where some ON rows had
 * a figure and others did not, with no rule a user could infer - because the
 * value was decided by whether telemetry happened to land between the two
 * toggles, which is a race, not a property of the outlet.
 *
 * Existing rows are left as they are. They record what the system believed at
 * the time, and rewriting history to make a column look tidier is a worse
 * failure than the untidy column.
 *
 * @param {boolean} turningOn True when the event switches the outlet on.
 * @param {object} outletData The outlet document as it stands before the switch.
 * @returns {number} Watts to record; always 0 for a switch-on.
 */
const resolveLogPower = (turningOn, outletData = {}) => {
  if (turningOn) return 0;

  const parsed = Number(outletData?.power);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

module.exports = { resolveLogPower };
