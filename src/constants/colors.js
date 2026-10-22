// Color Constants - the Dagitab palette: the logo's greens, navy text, white.
//
// Copy-rule: the web repo keeps a byte-identical copy at the same path, and its
// src/styles/theme.css mirrors these as --ww-* custom properties.
//
// Taken from the logo (scripts/brand-geometry.js), replacing the WattWise
// #10B981 on 22 Oct 2026. The logo's two greens do different jobs and are not
// interchangeable:
//   #008D43 carries white text (4.29:1) - buttons, active states, links.
//   #50D52B carries nothing (1.93:1 against white) - gradient start, switch
//           tracks, chart fills, dots. Never a ground for text, never text.
export const COLORS = {
  primary: '#008D43',
  // A step darker than primary: pressed states, and green text on a pale tint,
  // where primary itself drops to 3.9:1.
  primaryDark: '#007A3A',
  primaryLight: '#50D52B',
  // The deepest step, for type that has to sit on a light-green tint and still
  // read as green. 10:1 on white.
  primaryDeep: '#00401F',

  white: '#FFFFFF',
  background: '#F9FAFB',

  // The logo's navy. textLight clears 5.4:1 on both white and `background`.
  text: '#071B2C',
  textLight: '#5B6878',
  textDark: '#1C2E40',

  border: '#E5E7EB',
  error: '#EF4444',
  success: '#008D43',
  warning: '#F59E0B',

  overlay: 'rgba(7, 27, 44, 0.5)',
};

// Series colours for charts, in fixed order - outlet 1 always takes the first
// slot so a filter or an empty series never repaints the other one.
//
// The logo's dark and light greens. They differ mostly in lightness (L* 39 vs
// 76, deltaE76 61 - the WattWise pair was 28), which is the axis colour-blind
// viewers keep. `series[1]` is under 3:1 against white, so every mark using it
// still carries a visible text label rather than relying on colour alone.
export const CHART_COLORS = {
  series: ['#006B33', '#50D52B'],
  track: '#E5E7EB',
  grid: '#F3F4F6',
};
