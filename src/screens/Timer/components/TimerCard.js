import React, { useCallback, useMemo } from 'react';
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
  describeTimerState,
  formatDays,
  formatDuration,
  formatOutletName,
  getLiveCountdownDisplay,
  getNextScheduledRunSeconds,
} from '../utils/scheduleHelpers';

/*
 * The clock arrives from the screen. It used to be a second one kept here.
 *
 * ScheduleScreen ticks once a second while any timer is active and once a
 * minute otherwise; this card ticked once a second unconditionally. Whenever
 * the two rates differed the card and the NEXT UP banner above it were reading
 * different instants, and every value on this screen is derived from "now" - so
 * they reported different numbers for the same timer and neither was obviously
 * wrong. Two clocks cannot be kept in step; one clock cannot fall out of it.
 */
const TimerCard = ({ item, nowMs, onDelete, onToggle }) => {
  const { width } = useWindowDimensions();

  const liveCountdownText = useMemo(
    () => getLiveCountdownDisplay(item, nowMs),
    [item, nowMs]
  );

  const timerState = useMemo(() => describeTimerState(item, nowMs), [item, nowMs]);

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
    if (!onDelete) return;

    // Pass a human description so the confirmation names the timer being removed.
    const outletLabel = item?.outlet ? `Outlet ${String(item.outlet).replace('outlet', '')}` : '';
    const actionLabel = String(item?.action || '').toUpperCase();
    const timeLabel = item?.type === 'scheduled' ? item?.scheduledTime : item?.countdownTime;
    const description = [outletLabel, actionLabel, timeLabel && `at ${timeLabel}`]
      .filter(Boolean)
      .join(' ');

    onDelete(item.id, description);
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
          {/* One phrase, not two. The card carried "Outlet 1" on the left, a
              red "Turn OFF" on the right and a green on/off switch above it -
              three controls that all looked like on and off, and only one of
              them was. Saying what the timer DOES in a single line leaves the
              switch as the only thing a tap can change. */}
          <Text style={styles.outletName}>
            {formatOutletName(item.outlet)}
            <Text style={item.action === 'ON' ? styles.actionOn : styles.actionOff}>
              {item.action === 'ON' ? ' · turns ON' : ' · turns OFF'}
            </Text>
          </Text>
        </View>
        {/*
          A spent countdown is the one case where this control does nothing
          good: switching it back on re-arms a timer with no seconds left, and
          the backend fires the outlet on its next tick. describeTimerState has
          always said so through canRun and nothing read it, so the switch sat
          fully operable under a label reading "Finished".
        */}
        <Switch
          value={item.active || false}
          onValueChange={handleToggle}
          disabled={!timerState.canRun}
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
        {/* The action now lives in the header line beside the outlet, so
            this row carries only the time. */}
        <Text style={styles.timeCaption}>
          {item.type === 'countdown' ? 'left to run' : 'each week'}
        </Text>
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
        {/* "Active" was wrong at both ends of a countdown's life: at 00:00:00
            it still read Active while waiting for the once-a-minute server
            check, and after firing it read Inactive with a toggle that offered
            to re-run a timer with zero seconds left. describeTimerState names
            the state instead. */}
        <Text style={[styles.statusText, timerState.tone === 'done' && styles.statusDone]}>
          {timerState.tone === 'done' ? '✓ ' : '● '}{timerState.label}
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
  actionOn: {
    fontWeight: '700',
    color: COLORS.primaryDark,
  },
  actionOff: {
    fontWeight: '700',
    color: COLORS.error,
  },
  timeCaption: {
    fontSize: 12,
    color: COLORS.textLight,
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
  statusDone: {
    color: COLORS.primaryDark,
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