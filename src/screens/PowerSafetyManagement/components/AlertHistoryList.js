import React from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../../constants/colors';
import { getAlertIcon, formatAlertTime } from '../utils/safetyHelpers';

const AlertHistoryList = ({ alerts }) => {
  const renderAlertItem = ({ item }) => {
    const icon = getAlertIcon(item.type);

    return (
      <View style={styles.alertItem}>
        <View style={[styles.iconContainer, { backgroundColor: icon.bg }]}>
          <Ionicons name={icon.name} size={20} color={icon.color} />
        </View>

        <View style={styles.alertContent}>
          <Text style={styles.alertTitle}>{item.title}</Text>
          <Text style={styles.alertMessage}>{item.message}</Text>
          <Text style={styles.alertTime}>{formatAlertTime(item.timestamp)}</Text>
        </View>

        {item.outlet && (
          <View style={styles.outletBadge}>
            <Text style={styles.outletText}>{item.outlet}</Text>
          </View>
        )}
      </View>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="shield-checkmark-outline" size={64} color={COLORS.border} />
      <Text style={styles.emptyTitle}>No Safety Alerts</Text>
      <Text style={styles.emptyText}>
        All systems operating within safe parameters
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      {alerts.length === 0 ? (
        renderEmptyState()
      ) : (
        <FlatList
          data={alerts}
          renderItem={renderAlertItem}
          keyExtractor={(item) => item.id}
          scrollEnabled={false}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  alertItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  alertContent: {
    flex: 1,
  },
  alertTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 4,
  },
  alertMessage: {
    fontSize: 13,
    color: COLORS.textLight,
    lineHeight: 18,
    marginBottom: 4,
  },
  alertTime: {
    fontSize: 11,
    color: COLORS.textLight,
  },
  outletBadge: {
    backgroundColor: COLORS.background,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  outletText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.primary,
  },
  separator: {
    height: 12,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 13,
    color: COLORS.textLight,
    textAlign: 'center',
  },
});

export default AlertHistoryList;