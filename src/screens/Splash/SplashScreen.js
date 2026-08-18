// Splash Screen
import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { COLORS } from '../../constants/colors';
import { FONTS } from '../../constants/theme';
import { Wordmark } from '../../components/common/Wordmark';

export const SplashScreen = ({ navigation }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      navigation.replace('Auth');
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.container}>
      {/* The brand mark, not the emoji. The emoji renders in the platform's
          own yellow, which is the one colour this theme does not have. */}
      <Image
        source={require('../../../assets/logo-mark-white.png')}
        style={styles.logo}
        resizeMode="contain"
      />
      {/* Flat white, both halves. The two-tone needs the accent to sit on a
          contrasting ground, and here the ground IS the accent - the deep-green
          "Wise" was only ever a darker shade of its own background, and on a
          phone outdoors it read as a smudge rather than as a word. There is no
          shade of green that fixes that; the field itself is the problem. */}
      <Wordmark style={styles.title} accentColor={COLORS.white} />
      <Text style={styles.subtitle}>Smart Energy Monitoring</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    width: 88,
    height: 88,
    marginBottom: 20,
  },
  title: {
    ...FONTS.h1,
    color: COLORS.white,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  subtitle: {
    ...FONTS.body,
    color: COLORS.white,
    opacity: 0.9,
  },
});