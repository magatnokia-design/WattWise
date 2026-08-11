import React, { useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { COLORS } from '../../constants/colors';

/**
 * Points at the WattWise web client for work that is genuinely easier on a
 * bigger screen - wide charts, and typing rate figures off a paper bill.
 *
 * Deliberately informational rather than a warning: it is styled in the theme
 * green, not the amber `RateNotice` uses, because nothing is wrong. The screen
 * behind it works completely on the phone and always must - somebody standing
 * in their apartment may not own a laptop. This offers a nicer way to do the
 * same thing, it never withholds one.
 *
 * Dismissible for good via `useDismissibleNotice`, since a user who has already
 * decided they prefer the phone should not be asked twice.
 */
export const WebAppNotice = ({ title, body, url, onDismiss, style }) => {
  const handlePress = useCallback(() => {
    if (!url) return;

    // Nothing to report on failure: the phone simply has no browser able to
    // take the link, and this banner is an offer, not a step the user is
    // partway through. An error dialog here would be noise.
    Linking.openURL(url).catch(() => {});
  }, [url]);

  return (
    <View style={[styles.container, style]}>
      <TouchableOpacity
        style={styles.main}
        onPress={handlePress}
        activeOpacity={0.7}
        accessibilityRole="link"
        accessibilityLabel={`${title}. Opens wattwise.site in your browser.`}
      >
        <Text style={styles.icon}>💻</Text>
        <View style={styles.textWrap}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{body}</Text>
          <Text style={styles.link}>Open wattwise.site →</Text>
        </View>
      </TouchableOpacity>

      {onDismiss ? (
        <TouchableOpacity
          style={styles.dismiss}
          onPress={onDismiss}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Dismiss this tip"
        >
          <Text style={styles.dismissText}>✕</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  main: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  dismiss: {
    paddingLeft: 10,
    paddingTop: 1,
  },
  dismissText: {
    fontSize: 15,
    color: COLORS.primaryDark,
    fontWeight: '700',
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
    color: '#065F46',
    marginBottom: 3,
  },
  body: {
    fontSize: 12,
    color: COLORS.primaryDark,
    lineHeight: 17,
  },
  link: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primaryDark,
    marginTop: 6,
  },
});

export default WebAppNotice;
