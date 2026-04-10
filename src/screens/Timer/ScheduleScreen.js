import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  Alert,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '../../constants/colors';
import TimerCard from './components/TimerCard';
import AddTimerModal from './components/AddTimerModal';
import { useSchedule } from './hooks/useSchedule';

const FILTERS = ['All', 'Outlet 1', 'Outlet 2'];

const ScheduleScreen = () => {
  const { width } = useWindowDimensions();
  const [modalVisible, setModalVisible] = useState(false);
  const [activeFilter, setActiveFilter] = useState('All');

  const { schedules, loading, addSchedule, deleteSchedule, toggleSchedule } = useSchedule();

  const handleFilterPress = useCallback((filter) => {
    setActiveFilter(filter);
    // TODO: Apply filter when backend is ready
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

    Alert.alert('Unable to save timer', result?.error || 'Please try again.');
    return result;
  }, [addSchedule]);

  const handleDelete = useCallback(async (id) => {
    const result = await deleteSchedule(id);
    if (!result?.success) {
      Alert.alert('Unable to delete timer', result?.error || 'Please try again.');
    }
  }, [deleteSchedule]);

  const handleToggle = useCallback(async (id, active) => {
    const result = await toggleSchedule(id, active);
    if (!result?.success) {
      Alert.alert('Unable to update timer', result?.error || 'Please try again.');
    }
  }, [toggleSchedule]);

  const summaryData = useMemo(() => {
    const filteredSchedules = activeFilter === 'All'
      ? schedules
      : schedules.filter((item) => String(item.outlet) === activeFilter.replace('Outlet ', ''));

    return {
      total: filteredSchedules.length,
      active: filteredSchedules.filter((item) => item.active).length,
      outlet1: filteredSchedules.filter((item) => String(item.outlet) === '1').length,
      outlet2: filteredSchedules.filter((item) => String(item.outlet) === '2').length,
    };
  }, [activeFilter, schedules]);

  const filteredSchedules = useMemo(() => {
    if (activeFilter === 'All') return schedules;
    const outlet = activeFilter.replace('Outlet ', '');
    return schedules.filter((item) => String(item.outlet) === outlet);
  }, [activeFilter, schedules]);

  const renderItem = useCallback(({ item }) => (
    <TimerCard
      item={item}
      onDelete={handleDelete}
      onToggle={handleToggle}
    />
  ), [handleDelete, handleToggle]);

  const renderEmpty = useMemo(() => (
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
  ), [handleAddTimer]);

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

      {/* Summary Cards */}
      <View style={[styles.summaryRow, { paddingHorizontal: 16 }]}>
        <View style={[styles.summaryCard, { width: (width - 48) / 3 }]}>
          <Text style={styles.summaryValue}>{summaryData.total}</Text>
          <Text style={styles.summaryLabel}>Total</Text>
        </View>
        <View style={[styles.summaryCard, { width: (width - 48) / 3 }]}>
          <Text style={styles.summaryValue}>{summaryData.active}</Text>
          <Text style={styles.summaryLabel}>Active</Text>
        </View>
        <View style={[styles.summaryCard, { width: (width - 48) / 3 }]}>
          <Text style={styles.summaryValue}>{summaryData.outlet1} / {summaryData.outlet2}</Text>
          <Text style={styles.summaryLabel}>O1 / O2</Text>
        </View>
      </View>

      {/* Filter Chips */}
      <View style={styles.filterRow}>
        {FILTERS.map(filter => (
          <TouchableOpacity
            key={filter}
            style={[styles.filterChip, activeFilter === filter && styles.filterChipActive]}
            onPress={() => handleFilterPress(filter)}
            activeOpacity={0.7}
          >
            <Text style={[styles.filterChipText, activeFilter === filter && styles.filterChipTextActive]}>
              {filter}
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
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 8,
  },
  summaryCard: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.primary,
  },
  summaryLabel: {
    fontSize: 11,
    color: COLORS.textLight,
    marginTop: 4,
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