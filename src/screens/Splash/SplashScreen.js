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
      {/* "Watt" white to match the bolt above it; "Wise" in the deep green,
          because the default accent IS this screen's background. */}
      <Wordmark style={styles.title} accentColor={COLORS.primaryDeep} />
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