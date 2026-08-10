#!/usr/bin/env node
/**
 * Generates the printable pairing QR for an ESP32 unit.
 *
 * Runs entirely offline: the device token never leaves this machine, which is
 * why this exists instead of pasting the token into a web QR generator.
 *
 * Usage:
 *   node scripts/generate-device-qr.js
 *       reads docs/esp32/WattWise_ESP32_Relay_Cloud/secrets.h
 *
 *   node scripts/generate-device-qr.js --deviceId ESP32_ROOM_A --token abc123...
 *       explicit values
 *
 * Outputs PNG + SVG + a printable HTML label into docs/esp32/qr/ (gitignored),
 * and prints a scannable QR straight to the terminal for quick testing.
 */

const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');

const REPO_ROOT = path.resolve(__dirname, '..');
const SECRETS_PATH = path.join(
  REPO_ROOT,
  'docs/esp32/WattWise_ESP32_Relay_Cloud/secrets.h'
);
const OUTPUT_DIR = path.join(REPO_ROOT, 'docs/esp32/qr');

const parseArgs = (argv) => {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if (!current.startsWith('--')) continue;
    const key = current.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      i += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
};

// Pulls `static const char* NAME = "value";` out of the Arduino header so the
// values cannot drift from what is actually flashed.
const readFromSecrets = () => {
  if (!fs.existsSync(SECRETS_PATH)) return {};

  const source = fs.readFileSync(SECRETS_PATH, 'utf8');
  const pick = (name) => {
    const match = source.match(
      new RegExp(`${name}\\s*=\\s*"([^"]*)"`)
    );
    return match ? match[1] : '';
  };

  return {
    deviceId: pick('DEVICE_ID'),
    token: pick('DEVICE_TOKEN'),
  };
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const fromSecrets = readFromSecrets();

  const deviceId = String(args.deviceId || fromSecrets.deviceId || '').trim();
  const token = String(args.token || fromSecrets.token || '').trim();

  if (!deviceId || !token) {
    console.error('Missing device ID or token.');
    console.error('Provide --deviceId and --token, or fill in secrets.h first.');
    console.error(`Looked in: ${SECRETS_PATH}`);
    process.exit(1);
  }

  if (token.length < 8) {
    console.error('Token is shorter than 8 characters; the app will reject this QR.');
    process.exit(1);
  }

  // Must match parseDeviceQrPayload in src/screens/Settings/utils/deviceQr.js
  const payload = buildPayload(deviceId, token);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const safeName = deviceId.replace(/[^A-Za-z0-9_-]/g, '_');
  const pngPath = path.join(OUTPUT_DIR, `${safeName}.png`);
  const svgPath = path.join(OUTPUT_DIR, `${safeName}.svg`);
  const htmlPath = path.join(OUTPUT_DIR, `${safeName}.html`);

  // High error correction so a scuffed or partly covered label still scans.
  const options = { errorCorrectionLevel: 'H', margin: 2, width: 600 };

  await QRCode.toFile(pngPath, payload, options);
  const svg = await QRCode.toString(payload, { ...options, type: 'svg' });
  fs.writeFileSync(svgPath, svg);

  const label = `<!doctype html>
<html><head><meta charset="utf-8"><title>WattWise pairing - ${deviceId}</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; display:flex; justify-content:center; padding:24px; }
  .label { border:2px solid #10B981; border-radius:12px; padding:20px; width:320px; text-align:center; }
  h1 { color:#10B981; font-size:18px; margin:0 0 4px; }
  p  { color:#374151; font-size:12px; margin:4px 0; }
  .id { font-family: monospace; font-size:13px; font-weight:bold; color:#111827; }
  .warn { color:#B91C1C; font-size:10px; margin-top:12px; }
  svg { width:240px; height:240px; }
  @media print { body { padding:0; } }
</style></head>
<body><div class="label">
  <h1>WattWise</h1>
  <p>Scan in Settings &rarr; Device</p>
  ${svg}
  <p class="id">${deviceId}</p>
  <p class="warn">Keep inside the enclosure. This code grants device access.</p>
</div></body></html>`;
  fs.writeFileSync(htmlPath, label);

  const terminal = await QRCode.toString(payload, { type: 'terminal', small: true });
  console.log(terminal);

  console.log(`Device ID : ${deviceId}`);
  console.log(`Token     : ${token.slice(0, 4)}${'*'.repeat(Math.max(0, token.length - 8))}${token.slice(-4)}`);
  console.log('');
  console.log('Written:');
  console.log(`  ${path.relative(REPO_ROOT, pngPath)}   (image)`);
  console.log(`  ${path.relative(REPO_ROOT, svgPath)}   (vector, best for printing)`);
  console.log(`  ${path.relative(REPO_ROOT, htmlPath)}  (printable label - open and Ctrl+P)`);
  console.log('');
  console.log('These files contain the device token. They are gitignored - keep them off the repo.');
};

// Exported so the payload format can be verified against the app's parser
// without re-implementing (and mis-implementing) the extraction here.
const buildPayload = (deviceId, token) => JSON.stringify({ deviceId, token });

module.exports = { readFromSecrets, buildPayload, SECRETS_PATH, OUTPUT_DIR };

if (require.main === module) {
  main().catch((error) => {
    console.error('Failed to generate QR:', error.message);
    process.exit(1);
  });
}
