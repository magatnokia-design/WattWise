// Splash Screen
import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
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
      {/* The white lockup. On a green field the gradient D would be a shade
          of its own background - the same reason the old two-tone wordmark
          went flat white here. The D is the mark, so nothing stacks above it. */}
      <Wordmark height={72} onColor style={styles.wordmark} />
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
  wordmark: {
    marginBottom: 16,
  },
  subtitle: {
    ...FONTS.body,
    color: COLORS.white,
    opacity: 0.9,
  },
});