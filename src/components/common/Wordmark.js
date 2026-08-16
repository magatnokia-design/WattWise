import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { COLORS } from '../../constants/colors';

/**
 * The WattWise wordmark: "Watt" in the text colour, "Wise" in the theme green.
 *
 * Deliberately styles nothing but the colour of the second half. Size, weight
 * and the colour of "Watt" all come from the `style` the call site passes, so
 * this drops into the dashboard header and an auth screen without either one
 * having to know about the other.
 *
 * Nested <Text> is how React Native does a run of differently-styled text
 * inside one line; a <View> with two <Text> children would break the baseline.
 * Both halves stay on one source line on purpose - split across lines, JSX
 * whitespace handling is the difference between "WattWise" and "Watt Wise".
 *
 * `accentColor` exists for the one screen that needs it. The splash is a solid
 * `primary` field, so the default green half would vanish into its own
 * background; overriding it there keeps the two-tone instead of falling back to
 * the flat single colour the wordmark used to be.
 *
 * The web client has its own copy at components/ui/Wordmark.jsx. They cannot be
 * one file - RN and DOM primitives do not overlap - so this is not a copy-rule
 * file, but the two must agree on which half is green.
 */
export const Wordmark = ({ style, accentColor }) => (
  <Text style={style} allowFontScaling>
    Watt<Text style={[styles.wise, accentColor ? { color: accentColor } : null]}>Wise</Text>
  </Text>
);

const styles = StyleSheet.create({
  wise: { color: COLORS.primary },
});

export default Wordmark;
