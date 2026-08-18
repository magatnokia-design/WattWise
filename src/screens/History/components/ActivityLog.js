import React, { useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { COLORS } from '../../../constants/colors';
import {
  describeLogDelivery,
  describeLogSource,
  formatWatts,
  powerAtSwitch,
} from '../utils/historyHelpers';

const EMPTY_LOGS = [];

const SOURCE_TONES = {
  danger: { background: '#FEE2E2', text: '#B91C1C' },
  warn: { background: '#FEF3C7', text: '#B45309' },
  info: { background: '#DBEAFE', text: '#1D4ED8' },
  neutral: { background: COLORS.border, text: COLORS.textLight },
};

const ActivityLogItem = ({ item }) => {
  const { width } = useWindowDimensions();
  const isOn = item.status === 'ON';
  const source = describeLogSource(item.source);
  const tone = SOURCE_TONES[source.tone] || SOURCE_TONES.neutral;
  // Null on every ordinary row. Only set when the hub never confirmed the
  // switch, which is the one case where the ON/OFF beside it is not a fact.
  const delivery = describeLogDelivery(item);
  const deliveryTone = delivery ? (SOURCE_TONES[delivery.tone] || SOURCE_TONES.neutral) : null;
  // Only a switch-off carries a wattage. Rows written before this was fixed
  // backend-side can hold the previous session's reading against a switch-on,
  // so the rule is applied here too rather than trusted from the document.
  const watts = formatWatts(powerAtSwitch(item));

  return (
    <View style={[styles.logItem, { width: width - 32 }]}>
      <View
        style={[
          styles.statusDot,
          // Amber rather than the on/off colour, because an unconfirmed row is
          // not in either state as far as anyone knows.
          { backgroundColor: delivery ? deliveryTone.text : (isOn ? COLORS.primary : COLORS.textLight) },
        ]}
      />
      <View style={styles.logInfo}>
        <Text style={styles.logTitle}>{item.outletName || 'Outlet --'}</Text>
        <View style={styles.logMetaRow}>
          {/* Why the outlet changed state - the backend always records this. */}
          <View style={[styles.sourceBadge, { backgroundColor: tone.background }]}>
            <Text style={[styles.sourceText, { color: tone.text }]}>{source.label}</Text>
          </View>
          {delivery ? (
            <View style={[styles.sourceBadge, { backgroundColor: deliveryTone.background }]}>
              <Text style={[styles.sourceText, { color: deliveryTone.text }]}>{delivery.label}</Text>
            </View>
          ) : null}
          {watts ? <Text style={styles.logSub}>{watts}</Text> : null}
        </View>
        {/* Spelled out rather than left to the badge. "Not confirmed" beside an
            OFF still reads as OFF unless the row says what is actually unknown. */}
        {delivery ? <Text style={styles.deliveryNote}>{delivery.note}</Text> : null}
      </View>
      <View style={styles.logRight}>
        <View style={[styles.statusBadge, { backgroundColor: isOn ? COLORS.primaryLight + '20' : COLORS.border }]}>
          <Text
            style={[
              styles.statusText,
              { color: isOn ? COLORS.primary : COLORS.textLight },
              // The switch was requested, not observed, so the label is hedged
              // rather than removed - the request is still a real record.
              delivery ? styles.statusTextUnconfirmed : null,
            ]}
          >
            {delivery ? `${item.status || '--'}?` : (item.status || '--')}
          </Text>
        </View>
        <Text style={styles.logTime}>{item.time || '--:--'}</Text>
        <Text style={styles.logDate}>{item.date || '-- --- ----'}</Text>
      </View>
    </View>
  );
};

const ActivityLog = ({ logs = EMPTY_LOGS, loading = false, hasMore = false, onLoadMore }) => {
  const renderItem = useCallback(({ item }) => (
    <ActivityLogItem item={item} />
  ), []);

  const renderEmpty = useMemo(() => {
    // Distinguish "still loading" from "genuinely nothing", so the empty state
    // does not flash before the first snapshot arrives.
    if (loading) {
      return (
        <View style={styles.emptyContainer}>
          <ActivityIndicator color={COLORS.primary} />
          <Text style={styles.emptySub}>Loading activity...</Text>
        </View>
      );
    }

    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyIcon}>📋</Text>
        <Text style={styles.emptyTitle}>No Activity Yet</Text>
        <Text style={styles.emptySub}>Outlet ON/OFF activity will appear here</Text>
      </View>
    );
  }, [loading]);

  const renderFooter = useCallback(() => {
    if (!hasMore || logs.length === 0) return null;

    return (
      <View>
        <TouchableOpacity
          style={styles.loadMoreButton}
          onPress={onLoadMore}
          activeOpacity={0.7}
          disabled={loading}
        >
          <Text style={styles.loadMoreText}>
            {loading ? 'Loading...' : 'Load older activity'}
          </Text>
        </TouchableOpacity>

        {/* The listener is capped by count and carries no date clause - the
            range is applied to whatever has been loaded. Without saying so, a
            short list under "Last 7 days" reads as "nothing else happened"
            rather than "nothing else was fetched". */}
        <Text style={styles.loadMoreNote}>
          The date range filters what is loaded here — it does not search further back.
        </Text>
      </View>
    );
  }, [hasMore, logs.length, loading, onLoadMore]);

  return (
    <FlatList
      data={logs}
      keyExtractor={(item, index) => item.id || `${item.timestamp || 'log'}-${index}`}
      renderItem={renderItem}
      ListEmptyComponent={renderEmpty}
      ListFooterComponent={renderFooter}
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
  },
  logMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  sourceBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  sourceText: {
    fontSize: 10,
    fontWeight: '700',
  },
  deliveryNote: {
    fontSize: 11,
    lineHeight: 15,
    color: COLORS.textLight,
    marginTop: 5,
    paddingRight: 8,
  },
  statusTextUnconfirmed: {
    opacity: 0.55,
  },
  loadMoreButton: {
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: 4,
  },
  loadMoreNote: {
    fontSize: 11,
    lineHeight: 15,
    textAlign: 'center',
    color: COLORS.textLight,
    marginTop: 8,
    paddingHorizontal: 12,
  },
  loadMoreText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
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