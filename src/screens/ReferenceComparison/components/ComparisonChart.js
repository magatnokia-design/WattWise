import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '../../../constants/colors';

const ComparisonChart = ({ currentMonthData, previousMonthData, selectedMonth }) => {
  const maxValue = Math.max(currentMonthData.kWh, previousMonthData.kWh, 1);
  const currentHeight = (currentMonthData.kWh / maxValue) * 100;
  const previousHeight = (previousMonthData.kWh / maxValue) * 100;

  const getPreviousMonthLabel = () => {
    const date = new Date(selectedMonth + '-01');
    date.setMonth(date.getMonth() - 1);
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };

  const getCurrentMonthLabel = () => {
    const date = new Date(selectedMonth + '-01');
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Energy Usage Comparison</Text>

      <View style={styles.chartContainer}>
        {/* Previous Month Bar */}
        <View style={styles.barContainer}>
          <View style={styles.barWrapper}>
            <View
              style={[
                styles.bar,
                {
                  height: `${previousHeight}%`,
                  backgroundColor: COLORS.textLight + '40',
                },
              ]}
            >
              <Text style={styles.barValue}>{previousMonthData.kWh.toFixed(1)}</Text>
            </View>
          </View>
          <Text style={styles.barLabel}>{getPreviousMonthLabel()}</Text>
          <Text style={styles.barSubLabel}>Previous</Text>
        </View>

        {/* Current Month Bar */}
        <View style={styles.barContainer}>
          <View style={styles.barWrapper}>
            <View
              style={[
                styles.bar,
                {
                  height: `${currentHeight}%`,
                  backgroundColor: COLORS.primary,
                },
              ]}
            >
              <Text style={styles.barValue}>{currentMonthData.kWh.toFixed(1)}</Text>
            </View>
          </View>
          <Text style={styles.barLabel}>{getCurrentMonthLabel()}</Text>
          <Text style={styles.barSubLabel}>Current</Text>
        </View>
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: COLORS.textLight + '40' }]} />
          <Text style={styles.legendText}>Previous Month</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: COLORS.primary }]} />
          <Text style={styles.legendText}>Current Month</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 20,
    marginTop: 20,
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 20,
  },
  chartContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    height: 200,
    marginBottom: 20,
  },
  barContainer: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
  },
  barWrapper: {
    width: '80%',
    height: 160,
    justifyContent: 'flex-end',
  },
  bar: {
    width: '100%',
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 8,
    minHeight: 40,
  },
  barValue: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.white,
  },
  barLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
  },
  barSubLabel: {
    fontSize: 11,
    color: COLORS.textLight,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  legendText: {
    fontSize: 12,
    color: COLORS.textLight,
  },
});

export default ComparisonChart;