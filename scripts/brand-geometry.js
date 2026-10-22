/**
 * The Dagitab mark, as supplied in dagitab-app-icon.svg / dagitab-full-logo.svg
 * (22 Oct 2026). One source for every generator:
 *
 *   scripts/generate-icons.js  -> assets/*.png (and, through it, the web repo's
 *                                 public/ icons, which are derived from icon.png)
 *   scripts/generate-brand.js  -> src/constants/brandMark.js and assets/brand/*.svg
 *
 * Change a path here and re-run both, or the launcher icon, the in-app wordmark
 * and the email header stop being the same mark.
 *
 * Two coordinate systems, because the supplier drew the mark twice at different
 * sizes and the two are not exact scalings of each other (the icon's bolt sits
 * differently inside its D). Each is reproduced as drawn rather than one being
 * derived from the other.
 */

// Theme colours of the logo. `GREEN` is also COLORS.primary - it is the only one
// of the three that white text can sit on (4.29:1). `LIME` is 1.93:1 against
// white and is decoration only: gradient start, never a ground for text.
const LIME = '#50D52B';
const GREEN = '#008D43';
const NAVY = '#071B2C';
const WHITE = '#FFFFFF';

// --- The app icon, on a 1024 canvas ----------------------------------------
const ICON = {
  canvas: 1024,
  d: 'M260 185 H490 C660 185 770 310 770 512 C770 714 660 839 490 839 H260 L290 650 V375 Z',
  bolt: 'M570 265 L390 495 H515 L360 750 L650 500 H525 Z',
  // Centre of the D's bounding box (x 260..770, y 185..839) - the point every
  // scaled variant is scaled around, so a smaller mark stays visually centred.
  centre: { x: 515, y: 512 },
  // Distance from that centre to the D's farthest corner (260,185): about 415.
  farthestCorner: 415,
};

// --- The full logo, on the supplier's 1600x420 artboard ----------------------
const LOGO = {
  d: 'M55 55 H205 C300 55 355 115 355 205 C355 295 300 355 205 355 H55 L78 245 V165 Z',
  bolt: 'M245 92 L140 215 H218 L130 323 L278 187 H203 Z',
  // "AGITAB" as the supplier set it: Arial Bold Italic (font-weight 900 italic
  // resolves to Bold Italic - Arial has no Black Italic), 220 px, -9 tracking,
  // starting at x=370 on a baseline of y=278.
  word: { text: 'AGITAB', size: 220, tracking: -9, x: 370, baseline: 278 },
  tagline: { text: 'Kuryente Mo, Kontrolado Mo.', size: 32, tracking: 4, baseline: 397 },
  // The supplied yellow accent bolt (#FFB800) over the "B" is deliberately not
  // reproduced: yellow is not in the theme, and the D already carries a bolt.
};

const GRADIENT_SVG = (id) => `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">`
  + `<stop offset="0" stop-color="${LIME}"/><stop offset="1" stop-color="${GREEN}"/>`
  + '</linearGradient>';

module.exports = { LIME, GREEN, NAVY, WHITE, ICON, LOGO, GRADIENT_SVG };
