#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const input = path.join(root, 'docs/esp32/qr/hub-setup-booklet-filled.html');
const outputDir = path.join(root, 'docs/esp32/qr/hub-booklet-png');
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const html = fs.readFileSync(input, 'utf8');
const style = html.match(/<style>[\s\S]*?<\/style>/i);
const pages = html.match(/<section class="page(?: [^"]*)?"[\s\S]*?<\/section>/gi);

if (!style || !pages || pages.length !== 8) {
  throw new Error(`Expected the filled booklet to contain 8 pages; found ${pages ? pages.length : 0}.`);
}

fs.mkdirSync(outputDir, { recursive: true });
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wattwise-booklet-'));

try {
  pages.forEach((page, index) => {
    const source = `<!doctype html><html><head><meta charset="utf-8">${style}</head><body>${page}</body></html>`;
    const sourcePath = path.join(tempDir, `page-${index + 1}.html`);
    const imagePath = path.join(outputDir, `page-${index + 1}.png`);
    fs.writeFileSync(sourcePath, source);
    execFileSync(chrome, [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--no-sandbox',
      '--window-size=397,560',
      `--screenshot=${imagePath}`,
      `file:///${sourcePath.replace(/\\/g, '/')}`,
    ], { stdio: 'ignore' });
  });
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log(`Rendered ${pages.length} PNGs to ${path.relative(root, outputDir)}`);