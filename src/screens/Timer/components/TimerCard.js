import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
 * One timer, as one compact row (Oct 2026: "the box of each timer is too big").
 * Icon, time, a line saying what it does, a line saying when, then the switch
 * and delete. The logic is unchanged - only the layout shrank.
 *
 * The clock arrives from the screen (`nowMs`). It used to be a second one kept
 * here, and two clocks on one screen drift: the card and the banner above it
 * reported different numbers for the same timer. One clock cannot fall out of
 * step with itself.
 */
const TimerCard = ({ item, nowMs, onDelete, onToggle }) => {
  const isCountdown = item?.type === 'countdown';

  const liveCountdownText = useMemo(
    () => getLiveCountdownDisplay(item, nowMs),
    [item, nowMs]
  );

  const timerState = useMemo(() => describeTimerState(item, nowMs), [item, nowMs]);

  const nextRunSeconds = useMemo(
    () => getNextScheduledRunSeconds(item?.scheduledTime, item?.days, nowMs),
    [item?.scheduledTime, item?.days, nowMs]
  );

  // The "when" line. A scheduled timer says its days and when it next runs; a
  // countdown says how long is left. A paused or finished timer says that
  // instead, from describeTimerState, rather than a countdown that is not moving.
  const whenText = useMemo(() => {
    if (isCountdown) {
      // "Paused · 00:00:10 left", "Switching now…", "Finished · ran once" -
      // anything but plain running says what state it is in.
      return timerState.tone === 'running' ? 'left to run' : timerState.label;
    }
    const days = formatDays(item?.days);
    if (!item?.active) return `${days} · paused`;
    if (!Number.isFinite(nextRunSeconds)) return `${days} · no valid day or time`;
    return `${days} · in ${formatDuration(nextRunSeconds)}`;
  }, [isCountdown, item?.active, item?.days, nextRunSeconds, timerState]);

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

  const turnsOn = item.action === 'ON';

  return (
    <View style={[styles.card, !item.active && styles.cardInactive]}>
      <View style={[styles.icon, item.active && styles.iconActive]}>
        <Ionicons
          name={isCountdown ? 'hourglass-outline' : 'alarm-outline'}
          size={20}
          color={item.active ? COLORS.white : COLORS.textLight}
        />
      </View>

      <View style={styles.body}>
        <Text style={styles.time}>
          {isCountdown ? liveCountdownText : item.scheduledTime || '--:--'}
        </Text>
        {/* What it does, in one phrase - the switch is the only control. */}
        <Text style={styles.what} numberOfLines={1}>
          {formatOutletName(item.outlet)}
          <Text style={turnsOn ? styles.actionOn : styles.actionOff}>
            {turnsOn ? ' · turns ON' : ' · turns OFF'}
          </Text>
        </Text>
        <Text
          style={[styles.when, timerState.tone === 'done' && styles.whenDone]}
          numberOfLines={1}
        >
          {whenText}
        </Text>
      </View>

      {/*
        A spent countdown is the one case where this control does nothing
        good: switching it back on re-arms a timer with no seconds left, and
        the backend fires the outlet on its next tick. describeTimerState says
        so through canRun.
      */}
      <Switch
        value={item.active || false}
        onValueChange={handleToggle}
        disabled={!timerState.canRun}
        trackColor={{ false: COLORS.border, true: COLORS.primaryLight }}
        thumbColor={item.active ? COLORS.primary : COLORS.white}
      />
      <TouchableOpacity
        style={styles.delete}
        onPress={handleDelete}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Delete timer"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="trash-outline" size={18} color={COLORS.error} />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.white,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardInactive: {
    opacity: 0.75,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconActive: {
    backgroundColor: COLORS.primary,
  },
  body: {
    flex: 1,
  },
  time: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
  },
  what: {
    marginTop: 1,
    fontSize: 13,
    color: COLORS.textDark,
  },
  actionOn: {
    fontWeight: '700',
    color: COLORS.primaryDark,
  },
  actionOff: {
    fontWeight: '700',
    color: COLORS.error,
  },
  when: {
    marginTop: 2,
    fontSize: 12,
    color: COLORS.textLight,
  },
  whenDone: {
    color: COLORS.primaryDark,
  },
  delete: {
    padding: 4,
  },
});

export default TimerCard;
