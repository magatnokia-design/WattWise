import React from 'react';
import { View } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Path } from 'react-native-svg';
import {
  BRAND_VIEWBOX,
  BRAND_MARK_VIEWBOX,
  BRAND_D_PATH,
  BRAND_BOLT_PATH,
  BRAND_WORD_PATH,
  BRAND_ASPECT,
  BRAND_GRADIENT,
} from '../../constants/brandMark';
import { COLORS } from '../../constants/colors';

/**
 * The Dagitab logo: the green D with its bolt, then "AGITAB" in navy. The D is
 * the first letter - there is no separate mark beside it, so a screen that used
 * to stack a logo disc over the wordmark now shows this alone.
 *
 * Drawn from outlines (src/constants/brandMark.js), not set in a font. The
 * supplied logo used Arial Bold Italic, which Android does not have; as live
 * text it would have been a different shape on every phone.
 *
 * Sized by `height` - the D's height in px. Width follows from the artwork's
 * aspect, so it can sit in a row without measuring itself first.
 *
 * `onColor` is for a green ground (the splash): the D turns white with a green
 * bolt and the word turns white. The gradient D on a green field is the same
 * problem the old two-tone wordmark had - a shade of the background is not a
 * contrast against it.
 *
 * The web client has its own copy at components/ui/Wordmark.jsx. They cannot be
 * one file - RN and DOM primitives do not overlap - but they read the same
 * brandMark.js, which is a copy-rule file.
 */
export const Wordmark = ({ height = 32, onColor = false, style }) => (
  <View
    style={[{ height, width: height * BRAND_ASPECT }, style]}
    accessible
    accessibilityRole="image"
    accessibilityLabel="Dagitab"
  >
    <Svg width="100%" height="100%" viewBox={BRAND_VIEWBOX}>
      <BrandGradient />
      <Path d={BRAND_D_PATH} fill={onColor ? COLORS.white : 'url(#dagitabGreen)'} />
      <Path d={BRAND_BOLT_PATH} fill={onColor ? COLORS.primary : COLORS.white} />
      <Path d={BRAND_WORD_PATH} fill={onColor ? COLORS.white : COLORS.text} />
    </Svg>
  </View>
);

/** The D alone, square. For places that need the mark without the name. */
export const BrandMark = ({ size = 32, onColor = false, style }) => (
  <View style={[{ width: size, height: size }, style]} accessibilityElementsHidden importantForAccessibility="no">
    <Svg width="100%" height="100%" viewBox={BRAND_MARK_VIEWBOX}>
      <BrandGradient />
      <Path d={BRAND_D_PATH} fill={onColor ? COLORS.white : 'url(#dagitabGreen)'} />
      <Path d={BRAND_BOLT_PATH} fill={onColor ? COLORS.primary : COLORS.white} />
    </Svg>
  </View>
);

// Diagonal, top-left to bottom-right across the D's own box, as in the logo.
const BrandGradient = () => (
  <Defs>
    <LinearGradient id="dagitabGreen" x1="0" y1="0" x2="1" y2="1">
      <Stop offset="0" stopColor={BRAND_GRADIENT.from} />
      <Stop offset="1" stopColor={BRAND_GRADIENT.to} />
    </LinearGradient>
  </Defs>
);

export default Wordmark;
