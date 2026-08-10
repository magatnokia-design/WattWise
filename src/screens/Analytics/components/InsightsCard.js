// Situational insights.
//
// Every insight is conditional on the data supporting it, and each carries a
// signature derived from the numbers it states. Dismissing one hides that exact
// statement; when the situation changes the signature changes and the insight
// returns, so an "over budget" warning cannot be permanently silenced by an X
// tapped while things were fine.
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../../constants/colors';
import { FONTS } from '../../../constants/theme';

const TONE_STYLES = {
  alert: { border: COLORS.error + '55', background: COLORS.error + '10' },
  warn: { border: COLORS.warning + '55', background: COLORS.warning + '12' },
  good: { border: COLORS.primary + '55', background: COLORS.primary + '10' },
  neutral: { border: COLORS.border, background: COLORS.background },
};

const InsightsCard = ({ insights = [], loading = false, onDismiss, onReset, hasDismissed }) => (
  <View style={styles.card}>
    <View style={styles.header}>
      <Text style={styles.title}>💡 Insights</Text>
      {hasDismissed ? (
        <TouchableOpacity onPress={onReset} style={styles.resetButton}>
          <Text style={styles.resetText}>Show all</Text>
        </TouchableOpacity>
      ) : null}
    </View>

    {loading ? (
      <Text style={styles.emptyText}>Reading your latest usage...</Text>
    ) : insights.length === 0 ? (
      <Text style={styles.emptyText}>
        {hasDismissed
          ? 'You have read everything for now. New insights appear as your usage changes.'
          : 'Turn on an outlet and insights will appear as soon as usage is measured.'}
      </Text>
    ) : (
      insights.map((insight) => {
        const tone = TONE_STYLES[insight.tone] || TONE_STYLES.neutral;

        return (
          <View
            key={insight.signature}
            style={[styles.row, { borderColor: tone.border, backgroundColor: tone.background }]}
          >
            <Text style={styles.icon}>{insight.icon}</Text>
            <Text style={styles.text}>{insight.text}</Text>
            <TouchableOpacity
              onPress={() => onDismiss(insight.signature)}
              style={styles.dismiss}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel={`Dismiss insight: ${insight.text}`}
            >
              <Ionicons name="close" size={16} color={COLORS.textLight} />
            </TouchableOpacity>
          </View>
        );
      })
    )}
  </View>
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  title: {
    ...FONTS.h3,
    color: COLORS.textDark,
    fontWeight: '700',
  },
  resetButton: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  resetText: {
    ...FONTS.small,
    color: COLORS.primaryDark,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 10,
    marginBottom: 8,
  },
  icon: {
    fontSize: 16,
    lineHeight: 20,
  },
  text: {
    flex: 1,
    ...FONTS.small,
    color: COLORS.textDark,
    lineHeight: 18,
  },
  dismiss: {
    paddingTop: 1,
  },
  emptyText: {
    ...FONTS.small,
    color: COLORS.textLight,
    lineHeight: 18,
  },
});

export default InsightsCard;
