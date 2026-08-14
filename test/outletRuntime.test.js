import test from 'node:test';
import assert from 'node:assert/strict';

import {
  deriveOutletRuntimeState,
  getTelemetryUpdatedAtMs,
  resolveSwitchingTo,
  HARDWARE_STALE_THRESHOLD_MS,
} from '../src/screens/Dashboard/utils/outletRuntime.js';

const AT = 1786634431000;

const outlet = (extra = {}) => ({
  outletNumber: 1,
  status: 'on',
  power: 52.6,
  current: 0.23,
  metricsUpdatedAtMs: AT,
  ...extra,
});

/**
 * The bug these exist for: the freshness comparison used to run inside the
 * Firestore snapshot handler, so it only re-evaluated when new data arrived.
 * When the hardware stopped posting there was no new data, and every derived
 * value held its last reading and kept presenting it as current.
 */

test('telemetry older than the threshold is not fresh, with no new document', () => {
  const doc = outlet();

  // Same document throughout - only the clock moves, which is exactly what
  // happens when the ESP32 goes quiet.
  assert.equal(deriveOutletRuntimeState(doc, AT).hasFreshTelemetry, true);
  assert.equal(deriveOutletRuntimeState(doc, AT + 11000).hasFreshTelemetry, true);
  assert.equal(
    deriveOutletRuntimeState(doc, AT + HARDWARE_STALE_THRESHOLD_MS + 1).hasFreshTelemetry,
    false,
    'goes stale on the clock, not on a snapshot'
  );
});

test('a fan behind dropped wi-fi does not read as an empty outlet', () => {
  // 52.6 W was flowing when the readings stopped. The honest answer is that we
  // no longer know, which is not the same as "nothing is plugged in".
  const stale = deriveOutletRuntimeState(outlet(), AT + 60000);

  assert.equal(stale.hasLiveLoad, true, 'the last reading still showed a load');
  assert.equal(stale.hasFreshTelemetry, false);
  assert.equal(stale.hasLoad, false, 'but it is not evidence of one now');
});

test('residual current is not a running appliance', () => {
  // The owner's PZEM reads 0.02 A at 0.0 W on a switched-off outlet - double the
  // old 0.01 A threshold, with nothing consuming. That showed an appliance name
  // on a dead outlet.
  const idle = deriveOutletRuntimeState(outlet({ power: 0, current: 0.02 }), AT);

  assert.equal(idle.hasLiveLoad, false);
  assert.equal(idle.hasLoad, false);
});

test('the power floor rejects noise but not a small appliance', () => {
  assert.equal(deriveOutletRuntimeState(outlet({ power: 0.4 }), AT).hasLiveLoad, false);
  assert.equal(deriveOutletRuntimeState(outlet({ power: 0.5 }), AT).hasLiveLoad, true);
  assert.equal(deriveOutletRuntimeState(outlet({ power: 14 }), AT).hasLiveLoad, true);
});

test('an outlet that has never reported is never fresh', () => {
  const never = deriveOutletRuntimeState({ outletNumber: 2, power: 0 }, AT);

  assert.equal(never.hasFreshTelemetry, false);
  assert.equal(never.hasLoad, false);
  assert.equal(never.lastUpdatedMs, 0);
});

test('the telemetry timestamp is read across the field names in use', () => {
  assert.equal(getTelemetryUpdatedAtMs({ metricsUpdatedAtMs: AT }), AT);
  assert.equal(getTelemetryUpdatedAtMs({ lastTelemetryAtMs: AT }), AT);

  // Firestore Timestamp, as the SDK hands it over.
  assert.equal(getTelemetryUpdatedAtMs({ metricsUpdatedAt: { toMillis: () => AT } }), AT);

  // `lastUpdated` is written by toggles as well as telemetry, so it is the last
  // resort rather than the first choice.
  assert.equal(
    getTelemetryUpdatedAtMs({ metricsUpdatedAtMs: AT, lastUpdated: { toMillis: () => AT + 5000 } }),
    AT,
    'a real telemetry field wins over lastUpdated'
  );
});

/*
 * Switching state. The two directions are decided by different evidence on
 * purpose - see resolveSwitchingTo - and the tests below exist mainly to hold
 * that asymmetry in place, because the obvious "just use pendingStatus for
 * both" simplification silently breaks the auto-cutoff case.
 */

test('an outlet commanded off while current still flows is switching off', () => {
  assert.equal(
    resolveSwitchingTo({}, { isOn: false, isDrawing: true, nowMs: AT }),
    'off'
  );
});

test('a cutoff is reported as switching off even with no pending marker', () => {
  // updateOutletMetrics only ever deletes pendingStatus, so an auto-cutoff
  // opens no pending window. Keyed on a marker instead of the contradiction,
  // this case read "Off" beside 1030 W with nothing marking it in flight.
  const cutoff = { status: 'off', pendingStatus: '', pendingStatusUntilMs: 0 };

  assert.equal(
    resolveSwitchingTo(cutoff, { isOn: false, isDrawing: true, nowMs: AT }),
    'off'
  );
});

test('an outlet switched on inside the poll window is switching on', () => {
  const pending = { pendingStatus: 'on', pendingStatusUntilMs: AT + 20000 };

  assert.equal(
    resolveSwitchingTo(pending, { isOn: true, isDrawing: false, nowMs: AT }),
    'on'
  );
});

test('switching on ends once the load appears, before the window closes', () => {
  const pending = { pendingStatus: 'on', pendingStatusUntilMs: AT + 20000 };

  assert.equal(
    resolveSwitchingTo(pending, { isOn: true, isDrawing: true, nowMs: AT }),
    null,
    'the relay has plainly closed - the meter says so'
  );
});

test('an expired pending window stops claiming a transition', () => {
  // The guard against a card sitting on "Switching on..." forever when the
  // ESP32 never polls. An empty outlet that was switched on is an ordinary
  // resting state, not an unfinished command.
  const stale = { pendingStatus: 'on', pendingStatusUntilMs: AT - 1 };

  assert.equal(
    resolveSwitchingTo(stale, { isOn: true, isDrawing: false, nowMs: AT }),
    null
  );
});

test('a settled outlet is not switching in either direction', () => {
  assert.equal(resolveSwitchingTo({}, { isOn: true, isDrawing: true, nowMs: AT }), null);
  assert.equal(resolveSwitchingTo({}, { isOn: false, isDrawing: false, nowMs: AT }), null);
});

test('a stale reading cannot start a switching-off claim', () => {
  // isDrawing already folds in freshness upstream. Stated here because the
  // whole point of the freshness gate is that a frozen wattage would otherwise
  // hold the badge on "Switching off..." indefinitely.
  assert.equal(
    resolveSwitchingTo({}, { isOn: false, isDrawing: false, nowMs: AT }),
    null
  );
});
