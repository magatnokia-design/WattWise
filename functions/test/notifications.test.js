const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { NOTIFICATION_TYPES } = require('../src/lib/notifications');

// The backend decides a notification's `type` and the app renders an icon and
// colour for it. Those two lists live on opposite sides of the repo, so a type
// added here but not there silently renders as a generic grey bell. This test
// is the only thing keeping them in step.
const helpersSource = fs.readFileSync(
  path.join(__dirname, '../../src/screens/Notifications/utils/notificationHelpers.js'),
  'utf8'
);

const casesInFunction = (source, functionName) => {
  const start = source.indexOf(`export const ${functionName}`);
  assert.notEqual(start, -1, `${functionName} not found in notificationHelpers.js`);

  const end = source.indexOf('};', start);
  const body = source.slice(start, end);

  return new Set([...body.matchAll(/case '([^']+)':/g)].map((match) => match[1]));
};

test('every backend notification type has an icon in the app', () => {
  const iconTypes = casesInFunction(helpersSource, 'getNotificationIcon');

  for (const type of NOTIFICATION_TYPES) {
    assert.ok(
      iconTypes.has(type),
      `notification type '${type}' has no icon in notificationHelpers.js`
    );
  }
});

test('every backend notification type has a colour in the app', () => {
  const colorTypes = casesInFunction(helpersSource, 'getNotificationColor');

  for (const type of NOTIFICATION_TYPES) {
    assert.ok(
      colorTypes.has(type),
      `notification type '${type}' has no colour in notificationHelpers.js`
    );
  }
});

test('the icon and colour maps cover exactly the same types', () => {
  const iconTypes = casesInFunction(helpersSource, 'getNotificationIcon');
  const colorTypes = casesInFunction(helpersSource, 'getNotificationColor');

  assert.deepEqual([...iconTypes].sort(), [...colorTypes].sort());
});
