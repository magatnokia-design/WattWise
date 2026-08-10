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

test('combined draw is caught even when neither outlet alone is over', () => {
  const result = evaluateSafety({
    settings: settingsWith(),
    outlets: [outlet(1, 240), outlet(2, 240)],
    totalPowerW: 480,
  });

  // 240W each is only 60% of the 400W per-outlet limit, but 480W combined is
  // 96% of the 500W hardware ceiling.
  assert.equal(result.stage, 'limit');
  assert.ok(result.reasons.some((reason) => reason.includes('combined')));
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
