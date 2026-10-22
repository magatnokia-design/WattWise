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
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';
import TimerCard from './components/TimerCard';
import AddTimerModal from './components/AddTimerModal';
import AppDialog from '../../components/common/AppDialog';
import { useSchedule } from './hooks/useSchedule';
import { OfflineState } from '../../components/common/OfflineNotice';
import {
  countdownSecondsRemaining,
  getNextScheduledRunSeconds,
} from './utils/scheduleHelpers';


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
    // Zero is included. A countdown that has reached zero has not stopped being
    // the next thing that happens - it is waiting on checkScheduledTimers, which
    // runs once a minute. Excluding it meant the banner said "Nothing scheduled"
    // for up to sixty seconds while the card below it said "Switching now…", and
    // the timer nearest to firing was the one NEXT UP would not name.
    return countdownSecondsRemaining(item, nowMs);
  }

  const seconds = getNextScheduledRunSeconds(item?.scheduledTime, item?.days, nowMs);
  return Number.isFinite(seconds) ? seconds : null;
};

const ScheduleScreen = ({ navigation }) => {
  const [modalVisible, setModalVisible] = useState(false);
  const [dialog, setDialog] = useState(null);

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

  /*
   * Any ACTIVE timer, not just a countdown.
   *
   * This read `item.type === 'countdown'`, and a scheduled timer renders
   * "Next run in 167:59:48" - to the second - from TimerCard's own unconditional
   * one-second clock. So with the countdown finished and only a schedule left
   * running, the screen ticked once a minute while the card ticked once a
   * second, and the two drifted apart continuously: the banner read 167:59:54
   * over a card reading 167:59:48.
   *
   * Both surfaces show seconds whenever anything is active, so both need the
   * second. Nothing on screen moves when everything is paused or spent - a
   * paused countdown is frozen by design and a finished one sits at zero - so
   * the slow tick still costs nothing in that case.
   */
  const hasLiveTimer = useMemo(
    () => schedules.some((item) => item?.active),
    [schedules]
  );

  useEffect(() => {
    /*
     * Re-read the clock the moment the rate changes, not just on the next tick.
     *
     * Switching a paused countdown back on flips hasLiveCountdown, which tears
     * down the 60-second interval and starts a one-second one - but `nowMs` kept
     * whatever the last slow tick left, up to a minute in the past. The banner
     * computes from that stale instant and so reports MORE time left than there
     * is, while the card underneath keeps its own always-one-second clock and
     * reports the truth.
     *
     * That is the "NEXT UP in 00:00:07" sitting directly above a card reading
     * 00:00:00, on a screen holding one timer. The two never disagreed about the
     * arithmetic - they disagreed about what time it was.
     */
    setNowMs(Date.now());

    const id = setInterval(() => setNowMs(Date.now()), hasLiveTimer ? 1000 : 60000);
    return () => clearInterval(id);
  }, [hasLiveTimer]);

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
        message: 'The timer is in your list, but it has not reached the server. It will sync when you are back online — keep Dagitab open, because closing it drops the change.',
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
            message: 'The timer is gone from your list, but the server has not been told. It will sync when you are back online — keep Dagitab open, because closing it drops the change.',
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
        message: 'The switch has moved, but the server has not been told, so the timer will not run until this reaches it. Keep Dagitab open until you are back online.',
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

  // No outlet filter (removed Oct 2026 - two outlets do not need one).
  const sortedSchedules = useMemo(() => {
    const base = schedules;

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
  }, [schedules, nowMs]);

  // One clock for the screen and every card on it. They ran their own intervals
  // and drifted apart by up to a minute; sharing the instant is the only fix
  // that cannot come undone, the same reason both read countdownSecondsRemaining.
  const renderItem = useCallback(({ item }) => (
    <TimerCard
      item={item}
      nowMs={nowMs}
      onDelete={handleDelete}
      onToggle={handleToggle}
    />
  ), [handleDelete, handleToggle, nowMs]);

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
        {/* Opened from the Outlets tab since Oct 2026, so it needs a way back. */}
        {navigation?.canGoBack?.() ? (
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Ionicons name="arrow-back" size={24} color={COLORS.text} />
          </TouchableOpacity>
        ) : null}
        <View style={styles.headerTitles}>
          <Text style={styles.headerTitle}>Schedule</Text>
          <Text style={styles.headerSub}>Automate your outlets</Text>
        </View>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={handleAddTimer}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Add timer"
        >
          <Ionicons name="add" size={26} color={COLORS.white} />
        </TouchableOpacity>
      </View>

      {/* Timer List */}
      <FlatList
        data={sortedSchedules}
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
  backBtn: {
    padding: 4,
    marginRight: 8,
  },
  headerTitles: {
    flex: 1,
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
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
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