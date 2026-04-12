import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  useWindowDimensions,
} from 'react-native';
import { COLORS } from '../../../constants/colors';
import {
  formatDays,
  formatDuration,
  formatOutletName,
  getLiveCountdownDisplay,
  getNextScheduledRunSeconds,
} from '../utils/scheduleHelpers';

const TimerCard = ({ item, onDelete, onToggle }) => {
  const { width } = useWindowDimensions();
  const [nowMs, setNowMs] = useState(Date.now());

  useEffect(() => {
    const intervalId = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => clearInterval(intervalId);
  }, []);

  const liveCountdownText = useMemo(
    () => getLiveCountdownDisplay(item, nowMs),
    [item, nowMs]
  );

  const nextRunSeconds = useMemo(
    () => getNextScheduledRunSeconds(item?.scheduledTime, item?.days, nowMs),
    [item?.scheduledTime, item?.days, nowMs]
  );

  const scheduledLiveText = useMemo(() => {
    if (item?.type !== 'scheduled') return '';
    if (!item?.active) return 'Next run paused (timer inactive)';
    if (!Number.isFinite(nextRunSeconds)) return 'No valid schedule day/time';
    return `Next run in ${formatDuration(nextRunSeconds)}`;
  }, [item?.active, item?.type, nextRunSeconds]);

  const handleToggle = useCallback((value) => {
    if (onToggle) onToggle(item.id, value);
  }, [item, onToggle]);

  const handleDelete = useCallback(() => {
    if (onDelete) onDelete(item.id);
  }, [item, onDelete]);

  return (
    <View style={[styles.card, { width: width - 32 }]}>
      {/* Top Row */}
      <View style={styles.topRow}>
        <View style={styles.leftSection}>
          <View style={[styles.typeBadge, { backgroundColor: item.type === 'countdown' ? COLORS.primary + '20' : COLORS.primaryLight + '20' }]}>
            <Text style={[styles.typeText, { color: item.type === 'countdown' ? COLORS.primary : COLORS.primaryDark }]}>
              {item.type === 'countdown' ? '⏱ Countdown' : '🕐 Scheduled'}
            </Text>
          </View>
          <Text style={styles.outletName}>{formatOutletName(item.outlet)}</Text>
        </View>
        <Switch
          value={item.active || false}
          onValueChange={handleToggle}
          trackColor={{ false: COLORS.border, true: COLORS.primaryLight }}
          thumbColor={item.active ? COLORS.primary : COLORS.white}
        />
      </View>

      {/* Time Display */}
      <View style={styles.timeRow}>
        <Text style={styles.timeDisplay}>
          {item.type === 'countdown'
            ? liveCountdownText
            : item.scheduledTime || '--:--'}
        </Text>
        {item.type === 'scheduled' && (
          <Text style={styles.actionLabel}>
            {item.action === 'ON' ? '🟢 Turn ON' : '🔴 Turn OFF'}
          </Text>
        )}
      </View>

      {/* Days Row */}
      {item.type === 'scheduled' && (
        <View style={styles.daysRow}>
          <Text style={styles.daysText}>{formatDays(item.days)}</Text>
          <Text style={styles.nextRunText}>{scheduledLiveText}</Text>
        </View>
      )}

      {/* Bottom Row */}
      <View style={styles.bottomRow}>
        <Text style={styles.statusText}>
          {item.active ? '● Active' : '○ Inactive'}
        </Text>
        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={handleDelete}
          activeOpacity={0.7}
        >
          <Text style={styles.deleteText}>🗑 Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignSelf: 'center',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  leftSection: {
    flex: 1,
  },
  typeBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    marginBottom: 6,
  },
  typeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  outletName: {
    fontSize: 13,
    color: COLORS.textLight,
    fontWeight: '500',
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  timeDisplay: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.text,
    letterSpacing: 1,
  },
  actionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
  },
  daysRow: {
    marginBottom: 10,
  },
  daysText: {
    fontSize: 12,
    color: COLORS.textLight,
  },
  nextRunText: {
    marginTop: 4,
    fontSize: 12,
    color: COLORS.primary,
    fontWeight: '600',
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 10,
    marginTop: 4,
  },
  statusText: {
    fontSize: 12,
    color: COLORS.textLight,
    fontWeight: '500',
  },
  deleteBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#FEF2F2',
  },
  deleteText: {
    fontSize: 12,
    color: '#EF4444',
    fontWeight: '500',
  },
});

export default TimerCard;