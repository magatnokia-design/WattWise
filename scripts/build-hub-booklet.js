#!/usr/bin/env node
/**
 * Fills the printable Hub booklet with this unit's credentials.
 *
 * The tracked booklet at docs/hub-setup-booklet.html carries no secrets: the
 * setup password and device token are left blank and the QR slot is empty. That
 * is deliberate, because this repository is public and the pairing QR encodes
 * `{"deviceId","token"}` as plain text - the same token that was exposed in
 * commit history once already and had to be rotated.
 *
 * This script writes the *filled* copy into docs/esp32/qr/, a folder .gitignore
 * already excludes for exactly that reason. Do not move the output elsewhere.
 *
 * Everything it needs is regenerable, which is the point: after a laptop reset,
 * restore secrets.h, run `npm run device:qr`, then run this. The booklet comes
 * back without anyone having to remember what was printed in it.
 *
 * Usage:
 *   node scripts/build-hub-booklet.js
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const TEMPLATE = path.join(REPO_ROOT, 'docs/hub-setup-booklet.html');
const SECRETS = path.join(REPO_ROOT, 'docs/esp32/WattWise_ESP32_Relay_Cloud/secrets.h');
const QR_DIR = path.join(REPO_ROOT, 'docs/esp32/qr');
const OUTPUT = path.join(QR_DIR, 'hub-setup-booklet-filled.html');

/** Pulls a `static const char* NAME = "value";` out of secrets.h. */
const readSecret = (source, name) => {
  const match = source.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`));
  return match ? match[1] : '';
};

const fail = (message) => {
  console.error(`\n  ${message}\n`);
  process.exit(1);
};

const main = () => {
  if (!fs.existsSync(TEMPLATE)) fail(`Template not found: ${TEMPLATE}`);
  if (!fs.existsSync(SECRETS)) {
    fail('secrets.h not found. Copy secrets.example.h and fill it in first.');
  }

  const secrets = fs.readFileSync(SECRETS, 'utf8');
  const deviceId = readSecret(secrets, 'DEVICE_ID');
  const token = readSecret(secrets, 'DEVICE_TOKEN');
  const apPassword = readSecret(secrets, 'PROVISION_AP_PASSWORD');

  if (!deviceId || !token || !apPassword) {
    fail('secrets.h is missing DEVICE_ID, DEVICE_TOKEN or PROVISION_AP_PASSWORD.');
  }

  const qrPng = path.join(QR_DIR, `${deviceId.replace(/[^A-Za-z0-9_-]/g, '_')}.png`);
  if (!fs.existsSync(qrPng)) {
    fail(`Pairing QR not found: ${path.relative(REPO_ROOT, qrPng)}\n  Run \`npm run device:qr\` first.`);
  }

  let html = fs.readFileSync(TEMPLATE, 'utf8');

  // Each replacement is asserted to match exactly once. A silent miss would
  // produce a booklet that looks filled but still has a blank field in it.
  const swap = (find, replace, label) => {
    const hits = html.split(find).length - 1;
    if (hits !== 1) fail(`Expected 1 match for ${label}, found ${hits}. Template changed?`);
    html = html.replace(find, () => replace);
  };

  swap(
    '<div contenteditable="true" data-field="ap-pass" data-placeholder="write it here"></div>',
    `<span class="static">${apPassword}</span>`,
    'the setup password field'
  );

  swap(
    '<div contenteditable="true" data-field="device-token" data-placeholder="write it here"></div>',
    `<span class="static">${token}</span>`,
    'the device token field'
  );

  const base64 = fs.readFileSync(qrPng).toString('base64');
  swap(
    '<div contenteditable="true" class="qr-slot" data-field="qr-image"\n         data-placeholder="Paste the pairing QR here (Ctrl+V)"></div>',
    `<div class="qr-slot"><img src="data:image/png;base64,${base64}" alt="Pairing QR for ${deviceId}"></div>`,
    'the QR slot'
  );

  // The header on the tracked template tells a reader the fields are blank.
  // Left in place it would be false on this copy, and the warning it carries
  // matters more here than it does there.
  html = html.replace(
    'GENERATED FILE — do not edit by hand. Source template and build script live\n  in the scratchpad.',
    'FILLED COPY - contains the device token, setup password and pairing QR.\n  Built by scripts/build-hub-booklet.js from the tracked template. Gitignored.\n  Do not commit it, publish it, or put it in the paper appendices.'
  );

  fs.mkdirSync(QR_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT, html);

  const masked = `${token.slice(0, 4)}${'*'.repeat(Math.max(0, token.length - 8))}${token.slice(-4)}`;

  console.log('');
  console.log(`Device ID : ${deviceId}`);
  console.log(`Token     : ${masked}`);
  console.log('');
  console.log('Written:');
  console.log(`  ${path.relative(REPO_ROOT, OUTPUT)}`);
  console.log('');
  console.log('Open it and Ctrl+P to print. It contains the device token and is');
  console.log('gitignored - keep it off the repo and out of the appendices.');
  console.log('');
};

main();
