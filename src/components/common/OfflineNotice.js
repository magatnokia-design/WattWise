import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { COLORS } from '../../constants/colors';

/**
 * What a screen shows when it could not reach Firestore and therefore does not
 * know what the account holds.
 *
 * This exists because the alternative was worse than a blank screen: every list
 * in the app fell back to the empty state written for a brand-new account, so a
 * phone with no data connection reported no hub linked, no history, no
 * schedules and a zero balance to users whose accounts were full. The wording
 * below leads with "your data is safe" for that reason - the first thing a user
 * who has just seen their month of readings vanish needs to be told is that it
 * has not.
 *
 * Deliberately not styled as an error. Nothing has failed and nothing needs
 * repairing; the phone is simply out of contact, which is ordinary and usually
 * resolves itself. Red here would be alarming out of proportion to the cause.
 */
export const OfflineState = ({
  title = "Can't reach WattWise",
  body = 'Your data is safe — the app just needs a connection to load it. Check your wi-fi or mobile data, then try again.',
  onRetry,
  retryLabel = 'Try again',
  compact = false,
  style,
}) => (
  <View style={[styles.card, compact ? styles.cardCompact : null, style]}>
    <Text style={styles.icon}>📡</Text>
    <Text style={styles.title}>{title}</Text>
    <Text style={styles.body}>{body}</Text>

    {onRetry ? (
      <TouchableOpacity
        style={styles.retry}
        onPress={onRetry}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={retryLabel}
      >
        <Text style={styles.retryText}>{retryLabel}</Text>
      </TouchableOpacity>
    ) : null}
  </View>
);

/**
 * The same condition, as a strip above content that is already on screen.
 *
 * Used where a listener dropped after a good first load: the figures below are
 * real, just no longer moving, and replacing them with `OfflineState` would
 * throw away data the user can still legitimately read.
 */
export const OfflineBanner = ({
  message = 'No connection — showing the last data received.',
  onRetry,
  style,
}) => (
  <View style={[styles.banner, style]}>
    <Text style={styles.bannerIcon}>📡</Text>
    <Text style={styles.bannerText}>{message}</Text>
    {onRetry ? (
      <TouchableOpacity
        onPress={onRetry}
        activeOpacity={0.7}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel="Retry loading"
      >
        <Text style={styles.bannerAction}>Retry</Text>
      </TouchableOpacity>
    ) : null}
  </View>
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
    marginBottom: 16,
  },
  cardCompact: {
    paddingVertical: 22,
  },
  icon: {
    fontSize: 40,
    marginBottom: 12,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.textLight,
    textAlign: 'center',
  },
  retry: {
    marginTop: 18,
    backgroundColor: COLORS.primary,
    borderRadius: 999,
    paddingVertical: 11,
    paddingHorizontal: 28,
  },
  retryText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '700',
  },

  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  bannerIcon: {
    fontSize: 15,
    marginRight: 8,
  },
  bannerText: {
    flex: 1,
    fontSize: 13,
    color: '#92400E',
  },
  bannerAction: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primaryDark,
    marginLeft: 10,
  },
});

export default OfflineState;
