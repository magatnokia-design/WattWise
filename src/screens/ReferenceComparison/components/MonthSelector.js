import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../../constants/colors';

const MonthSelector = ({ selectedMonth, onMonthChange }) => {
  const currentDate = new Date();
  
  // Generate last 6 months
  const months = [];
  for (let i = 0; i < 6; i++) {
    const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
    months.push({
      value: date.toISOString().slice(0, 7), // YYYY-MM format
      label: date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
      month: date.toLocaleDateString('en-US', { month: 'long' }),
      year: date.getFullYear(),
    });
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="calendar" size={20} color={COLORS.primary} />
        <Text style={styles.title}>Select Month to Compare</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.monthsList}
      >
        {months.map((month) => (
          <TouchableOpacity
            key={month.value}
            style={[
              styles.monthChip,
              selectedMonth === month.value && styles.monthChipActive,
            ]}
            onPress={() => onMonthChange(month.value)}
          >
            <Text
              style={[
                styles.monthText,
                selectedMonth === month.value && styles.monthTextActive,
              ]}
            >
              {month.label}
            </Text>
            {selectedMonth === month.value && (
              <Ionicons name="checkmark-circle" size={16} color={COLORS.white} />
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.white,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  monthsList: {
    paddingHorizontal: 20,
    gap: 8,
  },
  monthChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 6,
  },
  monthChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  monthText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
  },
  monthTextActive: {
    color: COLORS.white,
  },
});

export default MonthSelector;