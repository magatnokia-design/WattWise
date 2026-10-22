import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';

/**
 * Draws attention to a safety stage that needs it (Oct 2026).
 *
 * A halo in the stage's colour swells out of the element and fades, on a loop
 * whose speed is the stage's `pulseMs` - slow amber for Warning, quicker orange
 * for Limit, fast red for Cut-off - and nothing at all for Normal or for stale
 * readings, so movement on screen always means something. When the stage
 * changes to one that pulses, the content gives a short shake as well, so the
 * moment of a cut-off is noticed and not just its aftermath.
 *
 * Honours the system "reduce motion" setting: the colour still changes, the
 * movement does not.
 *
 * @param {string} color Halo colour (the stage's `color`).
 * @param {number|null} pulseMs Loop length; null for no animation.
 * @param {string} stageKey Changing it triggers the shake.
 * @param {number} radius Corner radius of the halo, matching the element.
 * @param {{x: number, y: number}} [spread] How far the halo grows on each axis.
 */
const SafetyPulse = ({
  color,
  pulseMs,
  stageKey,
  radius,
  spread = { x: 1.15, y: 1.15 },
  style,
  children,
}) => {
  const progress = useRef(new Animated.Value(0)).current;
  const shake = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);
  const animate = Boolean(pulseMs) && !reduceMotion;

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((value) => { if (mounted) setReduceMotion(Boolean(value)); })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (value) => {
      setReduceMotion(Boolean(value));
    });
    return () => {
      mounted = false;
      sub?.remove?.();
    };
  }, []);

  useEffect(() => {
    progress.stopAnimation();
    progress.setValue(0);
    if (!animate) return undefined;

    const loop = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: pulseMs,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [animate, pulseMs, progress]);

  useEffect(() => {
    if (!animate) return;
    shake.setValue(0);
    Animated.sequence(
      [1, -1, 0.7, -0.7, 0.35, 0].map((toValue) => Animated.timing(shake, {
        toValue,
        duration: 60,
        useNativeDriver: true,
      }))
    ).start();
    // Only a change of stage shakes; a re-render does not.
  }, [stageKey]);

  return (
    <View style={style}>
      {animate ? (
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              borderRadius: radius,
              backgroundColor: color,
              opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }),
              transform: [
                { scaleX: progress.interpolate({ inputRange: [0, 1], outputRange: [1, spread.x] }) },
                { scaleY: progress.interpolate({ inputRange: [0, 1], outputRange: [1, spread.y] }) },
              ],
            },
          ]}
        />
      ) : null}
      <Animated.View
        style={{
          transform: [{
            translateX: shake.interpolate({ inputRange: [-1, 1], outputRange: [-5, 5] }),
          }],
        }}
      >
        {children}
      </Animated.View>
    </View>
  );
};

export default SafetyPulse;
