import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveOutletBadge } from '../src/screens/Dashboard/utils/outletBadge.js';

const badge = (args) =>
  resolveOutletBadge({
    isOn: true,
    isDrawing: false,
    telemetryFresh: true,
    switchingTo: null,
    ...args,
  });

test('a live draw is reported as drawing', () => {
  const result = badge({ isOn: true, isDrawing: true });
  assert.equal(result.text, 'Drawing power');
  assert.equal(result.tone, 'good');
});

test('switched on with a confirmed zero draw is idle', () => {
  // Legitimate: readings ARE arriving and they say 0 W. Nothing plugged in.
  const result = badge({ isOn: true, isDrawing: false, telemetryFresh: true });
  assert.equal(result.text, 'On, idle');
});

test('no readings never claims idle', () => {
  /*
   * The regression. "On, idle" asserts switched-on AND consuming nothing. The
   * first half survives a telemetry gap; the second does not. Because
   * buildOutletMetrics zeroes the metrics when telemetry is stale, isDrawing
   * goes false for want of data and the badge read "On, idle" - claiming an
   * outlet had nothing plugged into it on the strength of readings that stopped
   * arriving twelve seconds earlier.
   */
  const result = badge({ isOn: true, isDrawing: false, telemetryFresh: false });

  assert.equal(result.text, 'On · no reading');
  assert.notEqual(result.text, 'On, idle');
  assert.equal(result.tone, 'neutral');
});

test('no readings still reports the commanded state', () => {
  // A toggle is written to Firestore, so on/off is known whether or not the
  // hardware is talking. Only the load is unknown.
  assert.equal(badge({ isOn: false, telemetryFresh: false }).text, 'Off');
  assert.equal(badge({ isOn: true, telemetryFresh: false }).text, 'On · no reading');
});

test('a command in flight outranks everything', () => {
  assert.equal(badge({ switchingTo: 'off', isDrawing: true }).text, 'Switching off…');
  assert.equal(badge({ switchingTo: 'on', isDrawing: false }).text, 'Switching on…');

  // Including a telemetry gap - the transition is still the most useful truth.
  assert.equal(badge({ switchingTo: 'off', telemetryFresh: false }).text, 'Switching off…');
});

test('an off outlet with fresh readings is simply off', () => {
  assert.equal(badge({ isOn: false, isDrawing: false }).text, 'Off');
  assert.equal(badge({ isOn: false }).tone, 'neutral');
});

test('every state returns a tone the Badge component knows', () => {
  const tones = new Set(['good', 'warn', 'neutral']);

  [true, false].forEach((isOn) =>
    [true, false].forEach((isDrawing) =>
      [true, false].forEach((telemetryFresh) =>
        [null, 'on', 'off'].forEach((switchingTo) => {
          const result = resolveOutletBadge({ isOn, isDrawing, telemetryFresh, switchingTo });
          assert.ok(tones.has(result.tone), `bad tone: ${result.tone}`);
          assert.ok(result.text.length > 0);
        })
      )
    )
  );
});
