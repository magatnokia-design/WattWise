#!/usr/bin/env node
/**
 * Generates every app icon from one vector source.
 *
 * The mark is a single lightning bolt in white on the theme green - the shape
 * supplied in `wattwise_circle_mark_and_app_icon.svg`, reused here path-for-path
 * rather than redrawn.
 *
 * It replaces a 1.46 MB owl illustration that was doing four jobs at once
 * (icon, splash, adaptive foreground and favicon). That artwork had three
 * problems an icon cannot have: fine line work that turned to mush below about
 * 64 px, a yellow accent in a theme that is green and white only, and
 * transparency outside its circle - which `expo.icon` disallows and which, as
 * an Android adaptive foreground, drew a circle inside the launcher's own
 * circular mask.
 *
 * Every size here is derived, not eyeballed, and the reasoning is next to each
 * one. Re-run after changing BRAND_GREEN or the bolt path.
 *
 * Usage:
 *   node scripts/generate-icons.js
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const REPO_ROOT = path.resolve(__dirname, '..');
const ASSETS_DIR = path.join(REPO_ROOT, 'assets');

// COLORS.primary from src/constants/colors.js, which is also the splash
// background, the adaptive-icon background and the notification accent in
// app.json. The supplied SVG used #16a34a; matching what already ships
// everywhere else matters more than the swatch it was mocked up in.
const BRAND_GREEN = '#10B981';
const WHITE = '#ffffff';

// The bolt, exactly as supplied. Native bounds are 26 wide x 44 tall.
const BOLT_PATH = 'M17 0 L0 25 L10 25 L8 44 L26 18 L15 18 Z';
const BOLT_WIDTH = 26;
const BOLT_HEIGHT = 44;

/** A bolt of the given height, centred on a square canvas. */
const boltSvg = ({ size, boltHeight, fill, background = null, circleRadius = null }) => {
  const scale = boltHeight / BOLT_HEIGHT;
  const width = BOLT_WIDTH * scale;
  const x = (size - width) / 2;
  const y = (size - boltHeight) / 2;

  const backdrop = background
    ? `<rect width="${size}" height="${size}" fill="${background}"/>`
    : '';
  const disc = circleRadius
    ? `<circle cx="${size / 2}" cy="${size / 2}" r="${circleRadius}" fill="${BRAND_GREEN}"/>`
    : '';

  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`
    + backdrop
    + disc
    + `<path d="${BOLT_PATH}" fill="${fill}" transform="translate(${x},${y}) scale(${scale})"/>`
    + '</svg>'
  );
};

const TARGETS = [
  {
    file: 'icon.png',
    note: 'iOS + store listing. Full-bleed green, no alpha - the OS applies its own mask, '
      + 'so baking in rounded corners would double them.',
    size: 1024,
    // Half the canvas, which is the ratio the source sheet used: bolt height
    // equal to the circle's radius.
    svg: () => boltSvg({ size: 1024, boltHeight: 512, fill: WHITE, background: BRAND_GREEN }),
    flatten: BRAND_GREEN,
  },
  {
    file: 'adaptive-icon.png',
    note: 'Android adaptive foreground. Transparent; backgroundColor in app.json paints behind it. '
      + 'Sized to sit inside the 66% safe zone every launcher mask keeps.',
    size: 1024,
    // Safe zone is a 676 px circle (66% of 1024), radius 338. A 460-tall bolt
    // has a half-diagonal of 267, so it clears the mask on every launcher
    // shape - circle, squircle or teardrop.
    svg: () => boltSvg({ size: 1024, boltHeight: 460, fill: WHITE }),
  },
  {
    file: 'splash-icon.png',
    note: 'Launch screen. The circle mark on transparent, over a white background - '
      + 'the old pairing put a green circle on a green background.',
    size: 1024,
    // Padded rather than full-bleed: resizeMode "contain" scales this to the
    // screen width, so the circle has to leave its own margin.
    svg: () => boltSvg({ size: 1024, boltHeight: 300, fill: WHITE, circleRadius: 300 }),
  },
  {
    file: 'favicon.png',
    note: 'Browser tab, rendered near 16 px. Keeps the disc so the white bolt has something '
      + 'to sit on against a light tab strip.',
    size: 48,
    svg: () => boltSvg({ size: 48, boltHeight: 24, fill: WHITE, circleRadius: 23 }),
  },
  {
    file: 'notification-icon.png',
    note: 'Android status bar. Android keeps only the alpha channel and repaints it, so this '
      + 'is a white silhouette - anything else arrives as a solid blob.',
    size: 96,
    svg: () => boltSvg({ size: 96, boltHeight: 62, fill: WHITE }),
  },
];

const main = async () => {
  if (!fs.existsSync(ASSETS_DIR)) {
    console.error(`No assets directory at ${ASSETS_DIR}`);
    process.exit(1);
  }

  console.log(`Brand green: ${BRAND_GREEN}\n`);

  for (const target of TARGETS) {
    const outputPath = path.join(ASSETS_DIR, target.file);

    let pipeline = sharp(target.svg(), { density: 384 });
    if (target.flatten) pipeline = pipeline.flatten({ background: target.flatten });

    await pipeline.png({ compressionLevel: 9 }).toFile(outputPath);

    const { size } = fs.statSync(outputPath);
    console.log(`${target.file.padEnd(22)} ${String(target.size).padStart(4)}px  ${(size / 1024).toFixed(1).padStart(6)} KB`);
    console.log(`${' '.repeat(22)} ${target.note}\n`);
  }

  console.log('Done. app.json already points at these filenames.');
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
