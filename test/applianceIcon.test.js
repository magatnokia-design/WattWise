import test from 'node:test';
import assert from 'node:assert/strict';

import { applianceIcon, FALLBACK_APPLIANCE_ICON } from '../src/screens/Settings/utils/applianceIcon.js';

test('common appliance names get their own icon', () => {
  assert.equal(applianceIcon("Nokia's Fan"), 'fan');
  assert.equal(applianceIcon('Electric Fan'), 'fan');
  assert.equal(applianceIcon('Laptop Charger'), 'laptop', 'laptop outranks charger');
  assert.equal(applianceIcon('Phone charger'), 'cellphone-charging');
  assert.equal(applianceIcon('TV'), 'television');
  assert.equal(applianceIcon('LED Lamp'), 'lightbulb-outline');
  assert.equal(applianceIcon('Printer'), 'printer-outline');
  assert.equal(applianceIcon('PS5'), 'gamepad-variant-outline');
});

test('a name nothing matches falls back to a plug, never undefined', () => {
  assert.equal(applianceIcon('Aquarium pump'), FALLBACK_APPLIANCE_ICON);
  assert.equal(applianceIcon(''), FALLBACK_APPLIANCE_ICON);
  assert.equal(applianceIcon(undefined), FALLBACK_APPLIANCE_ICON);
});

test('words inside other words do not match', () => {
  // "tv" inside a longer word, "led" inside "Tiled".
  assert.equal(applianceIcon('Tiled heater'), FALLBACK_APPLIANCE_ICON);
});
