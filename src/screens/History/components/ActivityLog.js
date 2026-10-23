import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../../constants/colors';
import { OfflineState } from '../../../components/common/OfflineNotice';
import {
  activityDayLabel,
  describeLogDelivery,
  describeLogSource,
} from '../utils/historyHelpers';

const EMPTY_LOGS = [];

const SOURCE_TONES = {
  danger: '#B91C1C',
  warn: '#B45309',
  info: '#1D4ED8',
  neutral: COLORS.textLight,
};

/**
 * One switch, on one line (compact, Oct 2026): what switched, why, and when.
 * No wattage (Oct 2026, on request) - the outlet, the source and the time.
 */
const ActivityLogItem = ({ item }) => {
  const isOn = item.status === 'ON';
  const source = describeLogSource(item.source);
  // Null on every ordinary row. Only set when the hub never confirmed the
  // switch, which is the one case where the ON/OFF beside it is not a fact.
  const delivery = describeLogDelivery(item);

  return (
    <View style={styles.row}>
      <View
        style={[
          styles.statusIcon,
          { backgroundColor: delivery ? '#FEF3C7' : (isOn ? '#ECF8EF' : COLORS.background) },
        ]}
      >
        <Ionicons
          name="power"
          size={14}
          // Amber rather than the on/off colour, because an unconfirmed row is
          // not in either state as far as anyone knows.
          color={delivery ? '#B45309' : (isOn ? COLORS.primary : COLORS.textLight)}
        />
      </View>

      <View style={styles.info}>
        {/* The outlet only - no appliance name (Oct 2026). The slot is the one part
            of a log line that is always true. */}
        <Text style={styles.title} numberOfLines={1}>
          {item.outlet ? `Outlet ${item.outlet}` : 'Outlet'}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {/* Why the outlet changed state - the backend always records this. */}
          <Text style={{ color: SOURCE_TONES[source.tone] || COLORS.textLight, fontWeight: '600' }}>
            {source.label}
          </Text>
          {/* The day, in the row rather than as a heading over a group: one
              row is always one height, so the screen can fit a whole page
              without scrolling (Oct 2026). */}
          {` · ${activityDayLabel(item.timestamp)}`}
          {delivery ? (
            <Text style={{ color: SOURCE_TONES[delivery.tone] || COLORS.textLight, fontWeight: '600' }}>
              {` · ${delivery.label}`}
            </Text>
          ) : null}
        </Text>
      </View>

      <View style={styles.right}>
        <Text
          style={[
            styles.status,
            { color: isOn ? COLORS.primary : COLORS.textLight },
            // The switch was requested, not observed, so the label is hedged
            // rather than removed - the request is still a real record.
            delivery ? styles.statusUnconfirmed : null,
          ]}
        >
          {delivery ? `${item.status || '--'}?` : (item.status || '--')}
        </Text>
        <Text style={styles.time}>{item.time || '--:--'}</Text>
      </View>
    </View>
  );
};

/**
 * The page of activity the screen hands down, in one card. Paging lives in
 * the screen (Pager), which sizes the page to fit (ACTIVITY_ROW_HEIGHT).
 */
const ActivityLog = ({
  style,
  // Set by HistoryScreen so a page of rows fills the card exactly, with the
  // same gap between every pair (Oct 2026).
  rowHeight = 48,
  logs = EMPTY_LOGS,
  loading = false,
  // True only when nothing could be read.
  showOfflineState = false,
}) => {
  if (logs.length === 0) {
    // Distinguish "still loading" from "genuinely nothing", so the empty state
    // does not flash before the first snapshot arrives.
    if (loading) {
      return (
        <View style={styles.empty}>
          <ActivityIndicator color={COLORS.primary} />
          <Text style={styles.emptySub}>Loading activity…</Text>
        </View>
      );
    }
    // Checked before the empty state: an unread log looks identical to an
    // empty one from here, and only this branch knows which it is.
    if (showOfflineState) {
      return (
        <OfflineState
          compact
          body={
            'Your activity is safe — the app just needs a connection to load ' +
            'it. Check your wi-fi or mobile data, then try again.'
          }
        />
      );
    }
    return (
      <View style={styles.empty}>
        <Ionicons name="time-outline" size={28} color={COLORS.textLight} />
        <Text style={styles.emptyTitle}>No activity yet</Text>
        <Text style={styles.emptySub}>Every time an outlet turns on or off, it shows up here.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.card, style]}>
      {logs.map((item, index) => (
        <View
          key={item.id || `${item.timestamp || 'log'}-${index}`}
          style={[styles.slot, { height: rowHeight }]}
        >
          {index > 0 ? <View style={styles.separator} /> : null}
          <ActivityLogItem item={item} />
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  // Every row is one height, set by HistoryScreen (ACTIVITY_ROW), and the
  // separator sits inside it - so the gaps are equal however many rows fit.
  slot: {
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  separator: {
    position: 'absolute',
    top: 0,
    left: 38,
    right: 0,
    height: 1,
    backgroundColor: COLORS.border,
  },
  statusIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
  },
  title: {
    fontSize: 13.5,
    fontWeight: '600',
    color: COLORS.text,
  },
  meta: {
    fontSize: 11.5,
    color: COLORS.textLight,
    marginTop: 1,
  },
  right: {
    alignItems: 'flex-end',
  },
  status: {
    fontSize: 11,
    fontWeight: '800',
  },
  statusUnconfirmed: {
    opacity: 0.55,
  },
  time: {
    fontSize: 11.5,
    color: COLORS.text,
    marginTop: 1,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 6,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
  emptySub: {
    fontSize: 13,
    color: COLORS.textLight,
    textAlign: 'center',
  },
});

export default ActivityLog;
