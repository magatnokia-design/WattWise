import React, { useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  useWindowDimensions,
} from 'react-native';
import { COLORS } from '../../../constants/colors';

const EMPTY_LOGS = [];

const ActivityLogItem = ({ item }) => {
  const { width } = useWindowDimensions();

  return (
    <View style={[styles.logItem, { width: width - 32 }]}>
      <View style={[styles.statusDot, { backgroundColor: item.status === 'ON' ? COLORS.primary : COLORS.textLight }]} />
      <View style={styles.logInfo}>
        <Text style={styles.logTitle}>{item.outletName || 'Outlet --'}</Text>
        <Text style={styles.logSub}>{item.applianceName || 'No appliance'}</Text>
      </View>
      <View style={styles.logRight}>
        <View style={[styles.statusBadge, { backgroundColor: item.status === 'ON' ? COLORS.primaryLight + '20' : COLORS.border }]}>
          <Text style={[styles.statusText, { color: item.status === 'ON' ? COLORS.primary : COLORS.textLight }]}>
            {item.status || '--'}
          </Text>
        </View>
        <Text style={styles.logTime}>{item.time || '--:--'}</Text>
        <Text style={styles.logDate}>{item.date || '-- --- ----'}</Text>
      </View>
    </View>
  );
};

const ActivityLog = ({ logs = EMPTY_LOGS }) => {
  const { width } = useWindowDimensions();

  const renderItem = useCallback(({ item }) => (
    <ActivityLogItem item={item} />
  ), []);

  const renderEmpty = useMemo(() => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyIcon}>📋</Text>
      <Text style={styles.emptyTitle}>No Activity Yet</Text>
      <Text style={styles.emptySub}>Outlet ON/OFF activity will appear here</Text>
    </View>
  ), []);

  return (
    <FlatList
      data={logs}
      keyExtractor={(item, index) => item.id || `${item.timestamp || 'log'}-${index}`}
      renderItem={renderItem}
      ListEmptyComponent={renderEmpty}
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
      scrollEnabled={false}
    />
  );
};

const styles = StyleSheet.create({
  list: {
    paddingBottom: 16,
  },
  logItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignSelf: 'center',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 12,
  },
  logInfo: {
    flex: 1,
  },
  logTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  logSub: {
    fontSize: 12,
    color: COLORS.textLight,
    marginTop: 2,
  },
  logRight: {
    alignItems: 'flex-end',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    marginBottom: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  logTime: {
    fontSize: 12,
    color: COLORS.text,
    fontWeight: '500',
  },
  logDate: {
    fontSize: 11,
    color: COLORS.textLight,
    marginTop: 2,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 6,
  },
  emptySub: {
    fontSize: 13,
    color: COLORS.textLight,
    textAlign: 'center',
  },
});

export default ActivityLog;