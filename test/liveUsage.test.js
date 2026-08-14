import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildLiveAppliances,
  hasFreshTelemetry,
  HARDWARE_STALE_THRESHOLD_MS,
} from '../src/utils/liveUsage.js';

const NOW = 1786634431000;

const outlet = (outletNumber, extra = {}) => ({
  outletNumber,
  status: 'on',
  power: 52.6,
  metricsUpdatedAtMs: NOW,
  ...extra,
});

const appliances = (list, nowMs = NOW) => {
  const built = buildLiveAppliances(list, { nowMs });
  return { 1: built[0], 2: built[1] };
};

/**
 * `power` freezes when the ESP32 stops posting, and a frozen field reads as a
 * live one. An outlet commanded off reported "Switching off..." against a
 * 27-second-old wattage and would have said it forever - which is what convinced
 * the owner a countdown timer had failed when it had fired correctly.
 */

test('a frozen wattage is not evidence that anything is drawing', () => {
  const list = [outlet(1), outlet(2, { power: 0 })];

  assert.equal(appliances(list)[1].isDrawing, true, 'fresh reading, real load');
  assert.equal(
    appliances(list, NOW + HARDWARE_STALE_THRESHOLD_MS + 1)[1].isDrawing,
    false,
    'same document, later clock'
  );
});

test('a transition does not outlive the readings it was inferred from', () => {
  // Commanded off, still pulling 52.6 W: a real contradiction while readings
  // arrive, and nothing at all once they stop.
  const list = [outlet(1, { status: 'off' }), outlet(2, { power: 0 })];

  const live = appliances(list)[1];
  assert.equal(live.isSwitching, true);
  assert.equal(live.switchingTo, 'off');

  const stale = appliances(list, NOW + 27000)[1];
  assert.equal(stale.isSwitching, false, 'stops claiming a transition it cannot see');
  assert.equal(stale.switchingTo, null);
});

test('the commanded state is never gated on telemetry', () => {
  // Load-bearing: `status` is written by processOutletToggle and the device ack,
  // and lives in Firestore. The hardware going quiet says nothing about whether
  // that write happened, and a page falling back to this while stale depends on
  // it staying ungated.
  const list = [outlet(1, { power: 0 }), outlet(2, { power: 0 })];

  assert.equal(appliances(list, NOW + 600000)[1].isOn, true, 'still reports commanded on');
  assert.equal(appliances(list, NOW + 600000)[1].hasReading, false);
});

test('not drawing and cannot see are different answers', () => {
  const list = [outlet(1, { power: 0 }), outlet(2, { power: 0 })];

  const idle = appliances(list)[1];
  assert.equal(idle.hasReading, true);
  assert.equal(idle.isDrawing, false, 'measured: nothing is drawing');

  const unknown = appliances(list, NOW + 60000)[1];
  assert.equal(unknown.hasReading, false, 'unmeasured: no claim either way');
  assert.equal(unknown.isDrawing, false);
});

test('switching on still needs the pending marker, not a contradiction', () => {
  // On with nothing plugged in is an ordinary resting state, not a stalled
  // transition, so only an in-flight command distinguishes them.
  const idleOn = [outlet(1, { power: 0 }), outlet(2, { power: 0 })];
  assert.equal(appliances(idleOn)[1].isSwitching, false);

  const commanded = [
    outlet(1, { power: 0, pendingStatus: 'on', pendingStatusUntilMs: NOW + 15000 }),
    outlet(2, { power: 0 }),
  ];
  assert.equal(appliances(commanded)[1].switchingTo, 'on');

  // The window lapsing ends the claim even though nothing else changed.
  assert.equal(appliances(commanded, NOW + 20000)[1].isSwitching, false);
});

test('hasFreshTelemetry is exported for callers that need the raw answer', () => {
  assert.equal(hasFreshTelemetry(outlet(1), NOW), true);
  assert.equal(hasFreshTelemetry(outlet(1), NOW + 60000), false);
  assert.equal(hasFreshTelemetry({}, NOW), false);
});
