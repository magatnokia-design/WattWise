const test = require('node:test');
const assert = require('node:assert/strict');

const { evaluateSafety, normalizeThresholds } = require('../src/lib/powerSafety');

const settingsWith = (overrides = {}) => ({
  currentStage: 'normal',
  protectionEnabled: true,
  thresholds: { voltage: { min: 200, max: 250 }, current: { max: 10 }, power: { max: 400 } },
  lastReadingWriteMs: Date.now(),
  ...overrides,
});

const outlet = (number, power, { current = power / 240, voltage = 240, status = 'on' } = {}) => ({
  number,
  power,
  current,
  voltage,
  status,
});

test('a normal load stays normal', () => {
  const result = evaluateSafety({
    settings: settingsWith(),
    outlets: [outlet(1, 53), outlet(2, 5)],
    totalPowerW: 58,
  });

  assert.equal(result.stage, 'normal');
  assert.equal(result.stageChanged, false);
});

test('stages escalate as the load approaches the configured limit', () => {
  const at = (power) => evaluateSafety({
    settings: settingsWith(),
    outlets: [outlet(1, power)],
    totalPowerW: power,
  }).stage;

  assert.equal(at(300), 'normal');   // 75% of 400
  assert.equal(at(325), 'warning');  // 81%
  assert.equal(at(385), 'limit');    // 96%
  assert.equal(at(400), 'cutoff');   // 100%
});

// This test used to assert the bug, which is why the bug survived review: it
// read 480 W combined as "96% of the 500 W hardware ceiling" and expected a
// 'limit'. 500 W is the ceiling for ONE outlet. The pair is allowed 1000 W by
// the firmware, by updateOutletMetrics, and by the Power Safety screen's own
// wording - so this expectation had the backend cutting power off at a limit
// both clients told the user did not exist.
test('combined draw well inside the total ceiling is not a fault', () => {
  const result = evaluateSafety({
    settings: settingsWith(),
    outlets: [outlet(1, 240), outlet(2, 240)],
    totalPowerW: 480,
  });

  // 480 W is 48% of the 1000 W the hardware actually permits, and 60% of the
  // 400 W configured per outlet. Nothing here is a problem.
  assert.equal(result.stage, 'normal');
  assert.equal(result.reasons.some((reason) => reason.includes('combined')), false);
});

// Worth stating outright, because it is the reason the combined check looks
// redundant now and should not be "fixed" back: with a per-outlet ceiling of
// P and a total ceiling of exactly 2P, the per-outlet ratio max(a,b)/P is always
// at least the combined ratio (a+b)/2P, since 2*max(a,b) >= a+b. So the combined
// check can never escalate past what the per-outlet check has already found.
//
// It is kept as a backstop: it costs nothing, it states the intent, and it would
// start doing real work the moment the two ceilings stop being 1:2 - which is
// exactly the change most likely to be made without thinking about this file.
test('the per-outlet check always reaches a fault before the combined one', () => {
  const cases = [
    [200, 200], [399, 399], [400, 400], [450, 300], [500, 100], [480, 480],
  ];

  for (const [a, b] of cases) {
    const result = evaluateSafety({
      settings: settingsWith({
        thresholds: { voltage: { min: 200, max: 250 }, current: { max: 10 }, power: { max: 500 } },
      }),
      outlets: [outlet(1, a), outlet(2, b)],
      totalPowerW: a + b,
    });

    const combinedOnly = result.reasons.length > 0
      && result.reasons.every((reason) => reason.includes('combined'));

    assert.equal(
      combinedOnly,
      false,
      `${a}W + ${b}W was flagged by the combined check alone`
    );
  }
});

test('a switched-off outlet reading 0V is not an under-voltage fault', () => {
  const result = evaluateSafety({
    settings: settingsWith(),
    outlets: [outlet(1, 0, { voltage: 0, current: 0, status: 'off' })],
    totalPowerW: 0,
  });

  assert.equal(result.stage, 'normal');
  assert.equal(result.reasons.length, 0);
});

test('voltage outside the configured band is flagged while energised', () => {
  const over = evaluateSafety({
    settings: settingsWith(),
    outlets: [outlet(1, 50, { voltage: 260 })],
    totalPowerW: 50,
  });
  assert.equal(over.stage, 'limit');

  const under = evaluateSafety({
    settings: settingsWith(),
    outlets: [outlet(1, 50, { voltage: 180 })],
    totalPowerW: 50,
  });
  assert.equal(under.stage, 'warning');
});

test('current over its own limit escalates independently of power', () => {
  const result = evaluateSafety({
    settings: settingsWith(),
    outlets: [outlet(1, 100, { current: 10.5 })],
    totalPowerW: 100,
  });

  assert.equal(result.stage, 'cutoff');
  assert.ok(result.reasons.some((reason) => reason.includes('A of')));
});

test('disabling protection keeps the stage normal but still records readings', () => {
  const result = evaluateSafety({
    settings: settingsWith({ protectionEnabled: false }),
    outlets: [outlet(1, 490)],
    totalPowerW: 490,
  });

  assert.equal(result.stage, 'normal');
  assert.equal(result.readings.outlet1.power, 490);
});

test('readings are not rewritten on every post while the stage holds', () => {
  const now = Date.now();

  const justWritten = evaluateSafety({
    settings: settingsWith({ lastReadingWriteMs: now - 1000 }),
    outlets: [outlet(1, 50)],
    totalPowerW: 50,
    nowMs: now,
  });
  assert.equal(justWritten.shouldWrite, false, 'no write a second later');

  const due = evaluateSafety({
    settings: settingsWith({ lastReadingWriteMs: now - 20000 }),
    outlets: [outlet(1, 50)],
    totalPowerW: 50,
    nowMs: now,
  });
  assert.equal(due.shouldWrite, true, 'periodic refresh still happens');

  const escalating = evaluateSafety({
    settings: settingsWith({ lastReadingWriteMs: now - 1000 }),
    outlets: [outlet(1, 399)],
    totalPowerW: 399,
    nowMs: now,
  });
  assert.equal(escalating.stageChanged, true);
  assert.equal(escalating.shouldWrite, true, 'a stage change always writes immediately');
});

test('a stored threshold above the hardware ceiling is clamped', () => {
  const thresholds = normalizeThresholds({ power: { max: 5000 } });
  assert.equal(thresholds.powerMax, 500);
});

test('flat legacy threshold fields are still understood', () => {
  const thresholds = normalizeThresholds({ voltageMin: 210, voltageMax: 240, currentMax: 8, powerMax: 300 });

  assert.equal(thresholds.voltageMin, 210);
  assert.equal(thresholds.voltageMax, 240);
  assert.equal(thresholds.currentMax, 8);
  assert.equal(thresholds.powerMax, 300);
});

test('a missing settings document still evaluates and writes defaults', () => {
  const result = evaluateSafety({
    settings: null,
    outlets: [outlet(1, 50)],
    totalPowerW: 50,
  });

  assert.equal(result.stage, 'normal');
  assert.equal(result.shouldWrite, true);
});

// Regression: the combined-draw check divided total power by the *per-outlet*
// 500 W ceiling, so two outlets at 300 W each read as 120% of limit and tripped
// an auto-cutoff. Both the firmware and updateOutletMetrics allow 1000 W total,
// and the Power Safety screen states that limit to the user - so the backend was
// disconnecting power at a threshold both clients said did not exist.
test('combined draw is judged against the total ceiling, not the per-outlet one', () => {
  const result = evaluateSafety({
    settings: { thresholds: { powerMax: 500 }, protectionEnabled: true },
    outlets: [
      { number: 1, voltage: 240, current: 1.3, power: 300, status: 'on' },
      { number: 2, voltage: 240, current: 1.3, power: 300, status: 'on' },
    ],
    totalPowerW: 600,
    nowMs: Date.now(),
  });

  // 600 W is 60% of 1000 W - nowhere near any stage.
  assert.equal(result.stage, 'normal');
  assert.equal(
    result.reasons.some((reason) => reason.includes('combined')),
    false,
    'combined draw should not be flagged at 60% of the total ceiling'
  );
});

test('combined draw still escalates as it approaches the total ceiling', () => {
  const atWarning = evaluateSafety({
    settings: { thresholds: { powerMax: 500 }, protectionEnabled: true },
    outlets: [
      { number: 1, voltage: 240, current: 1.8, power: 420, status: 'on' },
      { number: 2, voltage: 240, current: 1.8, power: 400, status: 'on' },
    ],
    totalPowerW: 820,
    nowMs: Date.now(),
  });

  // 82% of 1000 W crosses WARNING_RATIO but not LIMIT_RATIO.
  assert.equal(atWarning.stage, 'warning');
  assert.ok(atWarning.reasons.some((reason) => reason.includes('combined draw 820W of 1000W')));

  const atCutoff = evaluateSafety({
    settings: { thresholds: { powerMax: 500 }, protectionEnabled: true },
    outlets: [
      { number: 1, voltage: 240, current: 2.1, power: 499, status: 'on' },
      { number: 2, voltage: 240, current: 2.1, power: 501, status: 'on' },
    ],
    totalPowerW: 1000,
    nowMs: Date.now(),
  });

  assert.equal(atCutoff.stage, 'cutoff');
});
