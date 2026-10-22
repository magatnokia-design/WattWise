import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../../constants/colors';
import { getAlertIcon, formatAlertTime } from '../utils/safetyHelpers';
// Alerts saved before Oct 2026 carry an emoji at the start of the title; the
// row has its own icon, so it is dropped for display.
import { cleanTitle } from '../../Notifications/components/notificationDisplay';

// The three most recent first; each "Show more" adds this many (Oct 2026).
const FIRST_PAGE = 3;
const PAGE = 5;

const formatOutlet = (outlet) => {
  if (outlet === null || outlet === undefined || outlet === '') return null;
  const text = String(outlet);
  return /^\d+$/.test(text) ? `Outlet ${text}` : text;
};

const AlertRow = ({ item }) => {
  const icon = getAlertIcon(item.type);
  const outlet = formatOutlet(item.outlet);

  return (
    <View style={styles.alertItem}>
      <View style={[styles.iconContainer, { backgroundColor: icon.bg }]}>
        <Ionicons name={icon.name} size={16} color={icon.color} />
      </View>
      <View style={styles.alertContent}>
        <View style={styles.titleRow}>
          <Text style={styles.alertTitle} numberOfLines={1}>{cleanTitle(item.title)}</Text>
          <Text style={styles.alertTime}>{formatAlertTime(item.timestamp)}</Text>
        </View>
        <Text style={styles.alertMessage} numberOfLines={2}>
          {outlet ? `${outlet} · ` : ''}{item.message}
        </Text>
      </View>
    </View>
  );
};

/**
 * Plain rows rather than a FlatList: a non-scrolling FlatList inside the
 * screen's ScrollView renders every row anyway and only adds a nested
 * VirtualizedList warning.
 */
const AlertHistoryList = ({ alerts }) => {
  const [shown, setShown] = useState(FIRST_PAGE);

  if (alerts.length === 0) {
    return (
      <View style={[styles.container, styles.emptyState]}>
        <Ionicons name="shield-checkmark-outline" size={20} color={COLORS.primary} />
        <Text style={styles.emptyText}>No safety alerts yet</Text>
      </View>
    );
  }

  const visible = alerts.slice(0, shown);
  const remaining = alerts.length - visible.length;

  return (
    <View style={styles.container}>
      {visible.map((item, index) => (
        <View key={item.id || index}>
          {index > 0 ? <View style={styles.separator} /> : null}
          <AlertRow item={item} />
        </View>
      ))}

      {remaining > 0 || shown > FIRST_PAGE ? (
        <TouchableOpacity
          style={styles.moreButton}
          onPress={() => setShown(remaining > 0 ? shown + PAGE : FIRST_PAGE)}
          accessibilityRole="button"
        >
          <Text style={styles.moreText}>
            {remaining > 0 ? `Show more (${remaining})` : 'Show less'}
          </Text>
          <Ionicons
            name={remaining > 0 ? 'chevron-down' : 'chevron-up'}
            size={14}
            color={COLORS.primary}
          />
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.white,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  alertItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 4,
  },
  iconContainer: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  alertContent: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  alertTitle: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: '600',
    color: COLORS.text,
  },
  alertTime: {
    fontSize: 11,
    color: COLORS.textLight,
  },
  alertMessage: {
    fontSize: 12,
    color: COLORS.textLight,
    lineHeight: 16,
    marginTop: 1,
  },
  separator: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 6,
  },
  moreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: 8,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  moreText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
  },
  emptyState: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  emptyText: {
    fontSize: 13,
    color: COLORS.textLight,
  },
});

export default AlertHistoryList;
