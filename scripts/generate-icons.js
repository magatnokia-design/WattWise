#!/usr/bin/env node
/**
 * Generates every app icon from one vector source.
 *
 * The mark is the Dagitab "D" - a white D with a lightning bolt cut through it,
 * on the brand gradient - as supplied in `dagitab-app-icon.svg` (22 Oct 2026)
 * and reproduced path-for-path from scripts/brand-geometry.js rather than
 * redrawn. It replaces the WattWise bolt.
 *
 * The supplied file was a finished-looking 1024 icon with its own rounded
 * corners, and could not be used as-is for any target: `expo.icon` disallows
 * transparency (the corners), Android crops an adaptive foreground to a circle
 * that would cut the D's corners off, and the status bar keeps only alpha. Each
 * target below is derived from the geometry for the job it does.
 *
 * Every size here is derived, not eyeballed, and the reasoning is next to each
 * one. Re-run after changing brand-geometry.js.
 *
 * The web repo's public/ icons are generated from assets/icon.png and the two
 * adaptive layers by its own scripts/generate-icons.cjs - run that afterwards.
 *
 * Usage:
 *   node scripts/generate-icons.js
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { GREEN, WHITE, ICON, GRADIENT_SVG } = require('./brand-geometry');

const REPO_ROOT = path.resolve(__dirname, '..');
const ASSETS_DIR = path.join(REPO_ROOT, 'assets');

// Kept under the old name: the main loop below prints it.
const BRAND_GREEN = GREEN;

/**
 * The D mark on a square canvas of `size`, scaled by `scale` around its own
 * centre. `scale: 1` is the supplied icon's proportions.
 *
 * `knockout` cuts the bolt out of the D instead of painting it, for the targets
 * where the platform keeps only alpha (status bar) or recolours the ground
 * (email header) - a painted green bolt would vanish into a green bar.
 */
const markSvg = ({
  size,
  scale = 1,
  dFill = WHITE,
  boltFill = GREEN,
  background = null,
  rounded = false,
  knockout = false,
}) => {
  const k = size / ICON.canvas;
  const place = `translate(${size / 2} ${size / 2}) scale(${k * scale}) `
    + `translate(${-ICON.centre.x} ${-ICON.centre.y})`;

  const ground = background === 'gradient' ? 'url(#g)' : background;
  const backdrop = background
    ? `<rect width="${size}" height="${size}" ${rounded ? `rx="${size * 0.205}"` : ''} fill="${ground}"/>`
    : '';

  // The knockout is one even-odd path rather than an SVG <mask>: the bolt lies
  // wholly inside the D, so even-odd makes it a hole. A mask rendered as a fully
  // transparent image under librsvg, and the size check below cannot see that.
  const mark = knockout
    ? `<path d="${ICON.d} ${ICON.bolt}" transform="${place}" fill="${dFill}" fill-rule="evenodd"/>`
    : `<path d="${ICON.d}" transform="${place}" fill="${dFill}"/>`
      + `<path d="${ICON.bolt}" transform="${place}" fill="${boltFill}"/>`;

  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`
    + `<defs>${GRADIENT_SVG('g')}</defs>`
    + backdrop
    + mark
    + '</svg>'
  );
};

// Android keeps a circle of radius 33/108 of the canvas visible on every
// launcher shape. The D's farthest corner is ICON.farthestCorner from its
// centre, so this is the largest scale that keeps it inside, less 5% margin.
const SAFE_RADIUS = ICON.canvas * (33 / 108);
const ADAPTIVE_SCALE = Math.floor((SAFE_RADIUS / ICON.farthestCorner) * 0.95 * 100) / 100;

const TARGETS = [
  {
    file: 'icon.png',
    note: 'iOS + store listing. Full-bleed gradient, no alpha - the OS applies its own mask, '
      + 'so the supplied file\'s baked-in rounded corners would be doubled (and are transparent).',
    size: 1024,
    svg: () => markSvg({ size: 1024, background: 'gradient' }),
    flatten: BRAND_GREEN,
  },
  {
    file: 'adaptive-icon.png',
    note: `Android adaptive foreground. Transparent, D scaled to ${ADAPTIVE_SCALE} so its corners `
      + 'clear the safe circle every launcher mask keeps. adaptive-icon-background.png sits behind it.',
    size: 1024,
    svg: () => markSvg({ size: 1024, scale: ADAPTIVE_SCALE }),
  },
  {
    file: 'adaptive-icon-background.png',
    note: 'Android adaptive background: the brand gradient. app.json backgroundColor only '
      + 'takes a flat colour, so the gradient needs its own layer (android.adaptiveIcon.backgroundImage).',
    size: 1024,
    svg: () => markSvg({ size: 1024, scale: 0, background: 'gradient' }),
    flatten: BRAND_GREEN,
  },
  {
    file: 'splash-icon.png',
    note: 'Native launch screen, on the flat green of expo.splash.backgroundColor. Padded, '
      + 'because resizeMode "contain" scales this to the screen width.',
    size: 1024,
    svg: () => markSvg({ size: 1024, scale: 0.55 }),
  },
  {
    file: 'favicon.png',
    note: 'Expo web favicon, rendered near 16 px. A rounded gradient tile, so the white D has '
      + 'a ground against a light tab strip.',
    size: 48,
    svg: () => markSvg({ size: 48, background: 'gradient', rounded: true }),
  },
  {
    file: 'notification-icon.png',
    note: 'Android status bar. Android keeps only the alpha channel and repaints it, so this '
      + 'is a white silhouette with the bolt cut out - a painted bolt would merge into the D.',
    size: 96,
    svg: () => markSvg({ size: 96, scale: 1.1, knockout: true }),
  },
  {
    file: 'logo-mark.png',
    note: 'The mark on a light background, as a raster. In-app screens draw <BrandMark> '
      + 'as a vector instead; kept for anything that needs a PNG.',
    size: 256,
    svg: () => markSvg({ size: 256, scale: 1.2, dFill: 'url(#g)', boltFill: WHITE }),
  },
  {
    file: 'logo-mark-white.png',
    note: 'The mark for a green ground, as a raster. Same caveat as logo-mark.png.',
    size: 256,
    svg: () => markSvg({ size: 256, scale: 1.2 }),
  },
  {
    file: 'email-logo.png',
    note: 'Email header, displayed at 22px. White silhouette with the bolt cut out, because that '
      + 'header bar turns red for safety mail and amber for device mail - a green bolt would '
      + 'clash with both. Copy to the web repo public/ - email clients need a hosted URL.',
    // Exported well above its display size: email clients do not serve
    // density-specific assets, so the only way to stay sharp on a retina
    // screen is to ship the larger image and let the HTML scale it down.
    size: 120,
    svg: () => markSvg({ size: 120, scale: 1.2, knockout: true }),
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

    // The density renders the vector at roughly 5x the target and `resize`
    // brings it back down, which supersamples the diagonals instead of
    // aliasing them. Without the resize the density silently becomes the
    // output size - every icon shipped 5.33x too large that way, and it went
    // unnoticed because this loop used to print the size it meant to write
    // rather than the one it did.
    let pipeline = sharp(target.svg(), { density: 384 }).resize(target.size, target.size);
    if (target.flatten) pipeline = pipeline.flatten({ background: target.flatten });

    await pipeline.png({ compressionLevel: 9 }).toFile(outputPath);

    // Read back from disk. An assertion against what was asked for is the only
    // thing that would have caught the above.
    const written = fs.readFileSync(outputPath);
    const width = written.readUInt32BE(16);
    const height = written.readUInt32BE(20);

    if (width !== target.size || height !== target.size) {
      throw new Error(
        `${target.file} was written at ${width}x${height}, expected ${target.size}x${target.size}`
      );
    }

    // And check it drew something. A fully transparent PNG has the right
    // dimensions too - that is how an empty notification icon and email logo
    // got past the check above on 22 Oct 2026.
    const { channels } = await sharp(outputPath).stats();
    if (channels.length === 4 && channels[3].max === 0) {
      throw new Error(`${target.file} is fully transparent - the artwork did not render`);
    }

    console.log(`${target.file.padEnd(22)} ${`${width}x${height}`.padStart(9)}  ${(written.length / 1024).toFixed(1).padStart(6)} KB`);
    console.log(`${' '.repeat(22)} ${target.note}\n`);
  }

  console.log('Done. Now run scripts/generate-icons.cjs in the web repo.');
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
