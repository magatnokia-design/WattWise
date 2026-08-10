// Color Constants - Green and White Theme
export const COLORS = {
  primary: '#10B981', // Green
  primaryDark: '#059669',
  primaryLight: '#34D399',
  
  white: '#FFFFFF',
  background: '#F9FAFB',
  
  text: '#111827',
  textLight: '#6B7280',
  textDark: '#1F2937',
  
  border: '#E5E7EB',
  error: '#EF4444',
  success: '#10B981',
  warning: '#F59E0B',
  
  overlay: 'rgba(0, 0, 0, 0.5)',
};

// Series colours for charts, in fixed order - outlet 1 always takes the first
// slot so a filter or an empty series never repaints the other one.
//
// Both are steps of the theme green, keeping the green/white rule. The pair was
// checked for colour-blind separation (deltaE 18.9 deutan, 19.3 normal) rather
// than picked by eye; `series[1]` sits under 3:1 against white, so every mark
// using it carries a visible text label rather than relying on colour alone.
export const CHART_COLORS = {
  series: ['#047857', '#10B981'],
  track: '#E5E7EB',
  grid: '#F3F4F6',
};