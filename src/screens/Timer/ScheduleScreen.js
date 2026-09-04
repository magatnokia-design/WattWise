import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '../../constants/colors';
import TimerCard from './components/TimerCard';
import AddTimerModal from './components/AddTimerModal';
import AppDialog from '../../components/common/AppDialog';
import { useSchedule } from './hooks/useSchedule';
import { OfflineState } from '../../components/common/OfflineNotice';
import {
  countdownSecondsRemaining,
  formatDuration,
  formatOutletName,
  getNextScheduledRunSeconds,
} from './utils/scheduleHelpers';

const FILTERS = ['All', 'Outlet 1', 'Outlet 2'];

/**
 * Seconds until a timer fires, or null if it never will.
 *
 * Both timer types are reduced to the same number so one list can be ordered by
 * "what happens next" regardless of how each timer was configured.
 */
const secondsUntilRun = (item, nowMs) => {
  if (!item?.active) return null;

  if (item.type === 'countdown') {
    // The same function the card uses. This used to be a second implementation
    // that read countdownDuration first, and only one of the two creation paths
    // writes that field - so on a timer created the other way the banner fell
    // back to the server's once-a-minute countdownRemaining and sat up to a
    // minute behind the card directly below it.
    const remaining = countdownSecondsRemaining(item, nowMs);
    return remaining !== null && remaining > 0 ? remaining : null;
  }

  const seconds = getNextScheduledRunSeconds(item?.scheduledTime, item?.days, nowMs);
  return Number.isFinite(seconds) ? seconds : null;
};

const ScheduleScreen = () => {
  const [modalVisible, setModalVisible] = useState(false);
  const [dialog, setDialog] = useState(null);
  const [activeFilter, setActiveFilter] = useState('All');

  const {
    schedules,
    loading,
    showOfflineState,
    addSchedule,
    deleteSchedule,
    toggleSchedule,
  } = useSchedule();

  /*
   * Once a minute was fine for "next run in 3 hours" and wrong for everything
   * else. A 30-second countdown was announced as "in 00:00:27" and stayed at 27
   * while the card beneath it counted down and fired - the banner was not
   * lagging, it was frozen between ticks.
   *
   * A countdown needs the same one-second tick the cards already run. A
   * scheduled timer measured in hours does not, so the interval follows what is
   * actually on screen rather than paying for the worst case all the time.
   */
  const [nowMs, setNowMs] = useState(Date.now());
  const hasLiveCountdown = useMemo(
    () => schedules.some((item) => item?.active && item?.type === 'countdown'),
    [schedules]
  );

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), hasLiveCountdown ? 1000 : 60000);
    return () => clearInterval(id);
  }, [hasLiveCountdown]);

  const handleFilterPress = useCallback((filter) => {
    setActiveFilter(filter);
  }, []);

  const handleAddTimer = useCallback(() => {
    setModalVisible(true);
  }, []);

  const handleModalClose = useCallback(() => {
    setModalVisible(false);
  }, []);

  const handleSave = useCallback(async (scheduleData) => {
    const result = await addSchedule(scheduleData);
    if (result?.success) {
      setModalVisible(false);
      return result;
    }

    // A pending write is not a failure. Firestore has already applied it to the
    // local cache, so the listener has fired and the timer is in the list
    // behind this modal - it just has not reached the server. Closing and
    // reporting success is what matches what the user can see; telling them it
    // failed would invite a second Save, and that one would create a duplicate
    // once the connection returned.
    if (result?.pending) {
      setModalVisible(false);
      setDialog({
        icon: '📡',
        tone: 'warning',
        title: 'Saved here, not sent yet',
        message: 'The timer is in your list, but it has not reached the server. It will sync when you are back online — keep WattWise open, because closing it drops the change.',
      });
      return { success: true, pending: true };
    }

    // No dialog for anything else - AddTimerModal stays open and prints the
    // reason above its Save button, next to the fields the user would change.
    return result;
  }, [addSchedule]);

  // Deleting a timer is destructive and was previously a single unguarded tap,
  // unlike every other destructive action in the app.
  const handleDelete = useCallback((id, description) => {
    setDialog({
      icon: '🗑️',
      tone: 'danger',
      title: 'Delete this timer?',
      message: description
        ? `The timer for ${description} will be removed. This cannot be undone.`
        : 'The timer will be removed. This cannot be undone.',
      confirmLabel: 'Delete',
      cancelLabel: 'Keep',
      onConfirm: async () => {
        setDialog(null);
        const result = await deleteSchedule(id);

        if (result?.pending) {
          setDialog({
            icon: '📡',
            tone: 'warning',
            title: 'Removed here, not sent yet',
            message: 'The timer is gone from your list, but the server has not been told. It will sync when you are back online — keep WattWise open, because closing it drops the change.',
          });
          return;
        }

        if (!result?.success) {
          setDialog({
            icon: '⚠️',
            tone: 'danger',
            title: 'The timer was not deleted',
            message: result?.error || 'It is still in the list. Please try again.',
          });
        }
      },
    });
  }, [deleteSchedule]);

  const handleToggle = useCallback(async (id, active) => {
    const result = await toggleSchedule(id, active);

    if (result?.pending) {
      setDialog({
        icon: '📡',
        tone: 'warning',
        title: 'Changed here, not sent yet',
        message: 'The switch has moved, but the server has not been told, so the timer will not run until this reaches it. Keep WattWise open until you are back online.',
      });
      return;
    }

    if (!result?.success) {
      setDialog({
        icon: '⚠️',
        tone: 'danger',
        title: 'The timer did not change',
        message: result?.error || 'It kept its previous setting. Please try again.',
      });
    }
  }, [toggleSchedule]);

  // Counts sit on the filter chips themselves rather than in separate stat
  // cards. The old "O1 / O2" tile restated what the chips already say, in a
  // form that needed decoding.
  const filterCounts = useMemo(() => ({
    All: schedules.length,
    'Outlet 1': schedules.filter((item) => String(item.outlet) === '1').length,
    'Outlet 2': schedules.filter((item) => String(item.outlet) === '2').length,
  }), [schedules]);

  const filteredSchedules = useMemo(() => {
    const base = activeFilter === 'All'
      ? schedules
      : schedules.filter((item) => String(item.outlet) === activeFilter.replace('Outlet ', ''));

    // Soonest first, paused timers last. A schedule list is read to find out
    // what happens next, so chronological order is the useful order - the
    // previous list kept whatever order Firestore returned.
    return [...base].sort((a, b) => {
      const aNext = secondsUntilRun(a, nowMs);
      const bNext = secondsUntilRun(b, nowMs);

      if (aNext === null && bNext === null) return 0;
      if (aNext === null) return 1;
      if (bNext === null) return -1;
      return aNext - bNext;
    });
  }, [activeFilter, schedules, nowMs]);

  // The single thing this screen exists to answer.
  const nextUp = useMemo(() => {
    let best = null;

    schedules.forEach((item) => {
      const seconds = secondsUntilRun(item, nowMs);
      if (seconds === null) return;
      if (!best || seconds < best.seconds) best = { item, seconds };
    });

    if (!best) return null;

    return {
      seconds: best.seconds,
      outlet: formatOutletName(best.item.outlet),
      action: String(best.item.action || '').toLowerCase() === 'off' ? 'off' : 'on',
    };
  }, [schedules, nowMs]);

  const renderItem = useCallback(({ item }) => (
    <TimerCard
      item={item}
      onDelete={handleDelete}
      onToggle={handleToggle}
    />
  ), [handleDelete, handleToggle]);

  // An unread collection and an empty one are both zero rows here, so the
  // offline case has to be answered before "No Timers Yet" - which would
  // otherwise tell a user with schedules that they have none.
  const renderEmpty = useMemo(() => (
    showOfflineState ? (
      <OfflineState
        compact
        body={
          'Your timers are safe — the app just needs a connection to load ' +
          'them. Check your wi-fi or mobile data, then try again.'
        }
      />
    ) : (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyIcon}>⏱️</Text>
        <Text style={styles.emptyTitle}>No Timers Yet</Text>
        <Text style={styles.emptySub}>Add a timer to automate your outlets</Text>
        <TouchableOpacity
          style={styles.emptyAddBtn}
          onPress={handleAddTimer}
          activeOpacity={0.7}
        >
          <Text style={styles.emptyAddBtnText}>+ Add Timer</Text>
        </TouchableOpacity>
      </View>
    )
  ), [handleAddTimer, showOfflineState]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Schedule</Text>
          <Text style={styles.headerSub}>Automate your outlets</Text>
        </View>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={handleAddTimer}
          activeOpacity={0.7}
        >
          <Text style={styles.addBtnText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {/* What fires next - the question this screen exists to answer. */}
      {schedules.length > 0 && (
        <View style={styles.nextUpCard}>
          {nextUp ? (
            <>
              <Text style={styles.nextUpLabel}>NEXT UP</Text>
              <Text style={styles.nextUpValue}>
                {nextUp.outlet} turns {nextUp.action}
              </Text>
              <Text style={styles.nextUpTime}>in {formatDuration(nextUp.seconds)}</Text>
            </>
          ) : (
            <>
              <Text style={styles.nextUpLabel}>NEXT UP</Text>
              <Text style={styles.nextUpValueMuted}>Nothing scheduled</Text>
              <Text style={styles.nextUpTime}>
                All timers are paused or have no upcoming run
              </Text>
            </>
          )}
        </View>
      )}

      {/* Filter Chips - counts live here rather than in separate stat cards */}
      <View style={styles.filterRow}>
        {FILTERS.map(filter => (
          <TouchableOpacity
            key={filter}
            style={[styles.filterChip, activeFilter === filter && styles.filterChipActive]}
            onPress={() => handleFilterPress(filter)}
            activeOpacity={0.7}
          >
            <Text style={[styles.filterChipText, activeFilter === filter && styles.filterChipTextActive]}>
              {filter} ({filterCounts[filter] ?? 0})
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Timer List */}
      <FlatList
        data={filteredSchedules}
        keyExtractor={(item, index) => item.id || index.toString()}
        renderItem={renderItem}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />

      {/* Add Timer Modal */}
      <AddTimerModal
        visible={modalVisible}
        onClose={handleModalClose}
        onSave={handleSave}
        saving={loading}
      />

      {dialog ? (
        <AppDialog
          {...dialog}
          confirmLabel={dialog.confirmLabel || 'Got it'}
          onCancel={() => setDialog(null)}
          onConfirm={dialog.onConfirm || (() => setDialog(null))}
        />
      ) : null}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.text,
  },
  headerSub: {
    fontSize: 13,
    color: COLORS.textLight,
    marginTop: 2,
  },
  addBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  addBtnText: {
    color: COLORS.white,
    fontWeight: '600',
    fontSize: 14,
  },
  nextUpCard: {
    backgroundColor: COLORS.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    marginBottom: 16,
  },
  nextUpLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textLight,
    letterSpacing: 1,
    marginBottom: 5,
  },
  nextUpValue: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  nextUpValueMuted: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textLight,
  },
  nextUpTime: {
    fontSize: 13,
    color: COLORS.primary,
    fontWeight: '600',
    marginTop: 3,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 12,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  filterChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterChipText: {
    fontSize: 12,
    color: COLORS.textLight,
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: COLORS.white,
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
    flexGrow: 1,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
  },
  emptySub: {
    fontSize: 13,
    color: COLORS.textLight,
    textAlign: 'center',
    marginBottom: 24,
  },
  emptyAddBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 20,
  },
  emptyAddBtnText: {
    color: COLORS.white,
    fontWeight: '600',
    fontSize: 14,
  },
});

export default ScheduleScreen;