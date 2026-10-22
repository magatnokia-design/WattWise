import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS } from '../../../constants/colors';

/**
 * "Link your Dagitab unit" - shown before any Hub has ever reported. Home and
 * the Outlets tab both show it, because Home is the first screen after sign-up
 * and a new user has to be told what to do before there are outlets to show.
 *
 * Worded to cover both cases: never scanned, and scanned but the unit has not
 * reported yet. "Nothing is paired" would be wrong for the second, which is the
 * case where a user is most likely to think the app is broken.
 */
const LinkHubCard = ({ onPress, style }) => (
  <View style={[styles.card, style]}>
    <View style={styles.icon}>
      <MaterialCommunityIcons name="power-socket-us" size={30} color={COLORS.primary} />
    </View>
    <Text style={styles.title}>Link your Dagitab unit</Text>
    <Text style={styles.text}>
      No readings yet. Scan the QR code on your unit in Settings, then check it is
      powered and on wi-fi — your outlets appear within a few seconds.
    </Text>
    <TouchableOpacity style={styles.button} onPress={onPress} activeOpacity={0.85}>
      <Text style={styles.buttonText}>Go to Settings</Text>
    </TouchableOpacity>
    <Text style={styles.hint}>Settings → Scan device QR</Text>
  </View>
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  icon: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: '#ECF8EF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 8,
  },
  text: {
    fontSize: 14,
    lineHeight: 21,
    color: COLORS.textLight,
    textAlign: 'center',
    marginBottom: 18,
  },
  button: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 12,
  },
  buttonText: {
    color: COLORS.white,
    fontWeight: '700',
    fontSize: 15,
  },
  hint: {
    marginTop: 10,
    fontSize: 12,
    color: COLORS.textLight,
  },
});

export default LinkHubCard;
