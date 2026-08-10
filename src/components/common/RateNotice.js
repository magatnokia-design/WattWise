import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { COLORS } from '../../constants/colors';

/**
 * Warns that peso figures are estimates from seeded default rates rather than
 * the user's actual PELCO III bill.
 *
 * Deliberately a banner and not a gate: safety cutoff alerts and live power
 * readings are the app's critical function, and they must never sit behind a
 * form. The cost figures are the only thing affected.
 */
export const RateNotice = ({ onPress, style }) => (
  <TouchableOpacity
    style={[styles.container, style]}
    onPress={onPress}
    activeOpacity={onPress ? 0.7 : 1}
    disabled={!onPress}
  >
    <Text style={styles.icon}>⚠️</Text>
    <View style={styles.textWrap}>
      <Text style={styles.title}>Using default PELCO III rates</Text>
      <Text style={styles.body}>
        Costs shown are estimates. Enter the generation rate from your bill in
        Settings so they match what PELCO III actually charges you.
      </Text>
    </View>
    {onPress ? <Text style={styles.chevron}>›</Text> : null}
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  icon: {
    fontSize: 16,
    marginRight: 10,
  },
  textWrap: {
    flex: 1,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: '#92400E',
    marginBottom: 3,
  },
  body: {
    fontSize: 12,
    color: '#B45309',
    lineHeight: 17,
  },
  chevron: {
    fontSize: 22,
    color: '#B45309',
    marginLeft: 8,
    lineHeight: 24,
  },
});

export default RateNotice;
