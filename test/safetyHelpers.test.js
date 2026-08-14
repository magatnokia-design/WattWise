import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getStatusColor,
  getSafetyStageConfig,
} from '../src/screens/PowerSafetyManagement/utils/safetyHelpers.js';

// The owner's configured band, and the readings their mains actually produces.
const VOLTAGE = { min: 200, max: 250 };
const POWER = { max: 500 };

/**
 * These chips render directly beneath the banner the backend grades. The two
 * disagreeing about one reading is the failure being guarded against here, so
 * the ratios are the ratios evaluateSafety uses, not a second set.
 */

test('normal Philippine mains reads Normal', () => {
  // 245.3 V and 245.7 V, the owner's two outlets. Under the old `max * 0.95`
  // rule both chips read Warning, and would have on every reading forever,
  // under a banner saying "All systems operating within safe parameters".
  assert.equal(getStatusColor(245.3, VOLTAGE).label, 'Normal');
  assert.equal(getStatusColor(245.7, VOLTAGE).label, 'Normal');
  assert.equal(getStatusColor(249.9, VOLTAGE).label, 'Normal', 'inside the band is inside');
});

test('voltage outside the band is Critical, with no tier between', () => {
  assert.equal(getStatusColor(250.1, VOLTAGE).label, 'Critical');
  assert.equal(getStatusColor(199.9, VOLTAGE).label, 'Critical');
  assert.equal(getStatusColor(200, VOLTAGE).label, 'Normal', 'the bound itself is in-band');
  assert.equal(getStatusColor(250, VOLTAGE).label, 'Normal');
});

test('power is graded on the ratios the backend escalates by', () => {
  // evaluateSafety: >= 0.8 warning, >= 0.95 limit, >= 1 cutoff. The chip has
  // three labels, so limit and cutoff share Critical.
  assert.equal(getStatusColor(399, POWER).label, 'Normal');
  assert.equal(getStatusColor(400, POWER).label, 'Warning', '80% - the banner says Warning here');
  assert.equal(getStatusColor(474, POWER).label, 'Warning');
  assert.equal(getStatusColor(475, POWER).label, 'Critical', '95%');
  assert.equal(getStatusColor(600, POWER).label, 'Critical');
});

test('a 425 W draw no longer reads Normal beside a Warning banner', () => {
  // 85% of 500 W. The old client rule warned at 0.9, so the chip said Normal
  // while the backend had already escalated the banner to Warning.
  assert.equal(getStatusColor(425, POWER).label, 'Warning');
});

test('a missing or zero ceiling grades nothing rather than everything', () => {
  assert.equal(getStatusColor(52.6, { max: 0 }).label, 'Normal');
  assert.equal(getStatusColor(52.6, {}).label, 'Normal');
});

test('a stale device is not graded as safe', () => {
  // configs[stage] || configs.normal used to render the greenest element on the
  // page for a stage that no longer meant anything.
  const stale = getSafetyStageConfig('normal', true);

  assert.equal(stale.label, 'No readings');
  assert.equal(stale.stale, true);
  assert.equal(getSafetyStageConfig('normal', false).label, 'Normal');
  assert.equal(getSafetyStageConfig('cutoff', false).label, 'Cut-off Active');
});
