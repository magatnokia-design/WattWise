// Dashboard Screen - Design Only (No ESP32 data yet)
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '../../constants/colors';
import { SIZES, FONTS } from '../../constants/theme';
import NotificationPanel from '../Notifications/components/NotificationPanel';

const OutletCard = ({ outletNumber, applianceName, status }) => (
  <View style={styles.outletCard}>
    <View style={styles.outletHeader}>
      <View>
        <Text style={styles.outletTitle}>Outlet {outletNumber}</Text>
        <Text style={styles.applianceName}>{applianceName}</Text>
      </View>
      <View style={[styles.statusBadge, status ? styles.statusOn : styles.statusOff]}>
        <Text style={styles.statusText}>{status ? 'ON' : 'OFF'}</Text>
      </View>
    </View>

    <View style={styles.metricsGrid}>
      <View style={styles.metricItem}>
        <Text style={styles.metricValue}>0 W</Text>
        <Text style={styles.metricLabel}>Power</Text>
      </View>
      <View style={styles.metricItem}>
        <Text style={styles.metricValue}>0.00 kWh</Text>
        <Text style={styles.metricLabel}>Energy</Text>
      </View>
      <View style={styles.metricItem}>
        <Text style={styles.metricValue}>0 V</Text>
        <Text style={styles.metricLabel}>Voltage</Text>
      </View>
      <View style={styles.metricItem}>
        <Text style={styles.metricValue}>0 A</Text>
        <Text style={styles.metricLabel}>Current</Text>
      </View>
    </View>

    <View style={styles.outletFooter}>
      <Text style={styles.costText}>₱0.00</Text>
      <Text style={styles.costLabel}>Estimated Cost</Text>
    </View>
  </View>
);

export const DashboardScreen = ({ navigation }) => {
  const [notificationVisible, setNotificationVisible] = useState(false);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Good Morning 👋</Text>
            <Text style={styles.headerTitle}>WattWise</Text>
          </View>
          <TouchableOpacity
            style={styles.notificationButton}
            onPress={() => setNotificationVisible(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.notificationIcon}>🔔</Text>
          </TouchableOpacity>
        </View>

        {/* Total Energy Summary Card */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Total Energy Usage</Text>
          <Text style={styles.summaryValue}>0.00 kWh</Text>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryItemValue}>₱0.00</Text>
              <Text style={styles.summaryItemLabel}>Estimated Cost</Text>
            </View>
            <View style={styles.summaryItemDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryItemValue}>0</Text>
              <Text style={styles.summaryItemLabel}>Active Outlets</Text>
            </View>
          </View>
        </View>

        {/* Power Safety Status */}
        <View style={styles.safetyCard}>
          <Text style={styles.safetyIcon}>🛡️</Text>
          <View style={styles.safetyInfo}>
            <Text style={styles.safetyTitle}>Power Safety Status</Text>
            <Text style={styles.safetyStatus}>Normal</Text>
          </View>
          <View style={styles.safetyBadge}>
            <Text style={styles.safetyBadgeText}>Safe</Text>
          </View>
        </View>

        {/* Outlets Section */}
        <Text style={styles.sectionTitle}>Smart Outlets</Text>

        <OutletCard
          outletNumber={1}
          applianceName="No Device"
          status={false}
        />

        <OutletCard
          outletNumber={2}
          applianceName="No Device"
          status={false}
        />

        {/* Budget Overview */}
        <View style={styles.budgetCard}>
          <View style={styles.budgetHeader}>
            <Text style={styles.budgetTitle}>Monthly Budget</Text>
            <Text style={styles.budgetAmount}>₱0.00 / ₱0.00</Text>
          </View>
          <View style={styles.budgetBar}>
            <View style={[styles.budgetFill, { width: '0%' }]} />
          </View>
          <Text style={styles.budgetRemaining}>₱0.00 remaining</Text>
        </View>
      </ScrollView>

      {/* Notification Panel */}
      <NotificationPanel
        visible={notificationVisible}
        onClose={() => setNotificationVisible(false)}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    padding: SIZES.padding,
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  greeting: {
    ...FONTS.body,
    color: COLORS.textLight,
  },
  headerTitle: {
    ...FONTS.h2,
    color: COLORS.textDark,
    fontWeight: 'bold',
  },
  notificationButton: {
    width: 44,
    height: 44,
    backgroundColor: COLORS.white,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  notificationIcon: {
    fontSize: 20,
  },
  summaryCard: {
    backgroundColor: COLORS.primary,
    borderRadius: SIZES.radius * 1.5,
    padding: SIZES.padding * 1.5,
    marginBottom: 16,
  },
  summaryTitle: {
    ...FONTS.body,
    color: COLORS.white,
    opacity: 0.9,
    marginBottom: 8,
  },
  summaryValue: {
    fontSize: 36,
    fontWeight: 'bold',
    color: COLORS.white,
    marginBottom: 16,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: COLORS.white,
    opacity: 0.2,
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  summaryItem: {
    alignItems: 'center',
    flex: 1,
  },
  summaryItemValue: {
    ...FONTS.h3,
    color: COLORS.white,
    fontWeight: 'bold',
  },
  summaryItemLabel: {
    ...FONTS.small,
    color: COLORS.white,
    opacity: 0.8,
    marginTop: 4,
  },
  summaryItemDivider: {
    width: 1,
    backgroundColor: COLORS.white,
    opacity: 0.2,
  },
  safetyCard: {
    backgroundColor: COLORS.white,
    borderRadius: SIZES.radius,
    padding: SIZES.padding,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  safetyIcon: {
    fontSize: 32,
    marginRight: 12,
  },
  safetyInfo: {
    flex: 1,
  },
  safetyTitle: {
    ...FONTS.body,
    color: COLORS.textDark,
    fontWeight: '600',
  },
  safetyStatus: {
    ...FONTS.small,
    color: COLORS.textLight,
    marginTop: 2,
  },
  safetyBadge: {
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  safetyBadgeText: {
    ...FONTS.small,
    color: COLORS.white,
    fontWeight: '600',
  },
  sectionTitle: {
    ...FONTS.h4,
    color: COLORS.textDark,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  outletCard: {
    backgroundColor: COLORS.white,
    borderRadius: SIZES.radius,
    padding: SIZES.padding,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  outletHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  outletTitle: {
    ...FONTS.h4,
    color: COLORS.textDark,
    fontWeight: 'bold',
  },
  applianceName: {
    ...FONTS.small,
    color: COLORS.textLight,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusOn: {
    backgroundColor: COLORS.primary,
  },
  statusOff: {
    backgroundColor: COLORS.border,
  },
  statusText: {
    ...FONTS.small,
    color: COLORS.white,
    fontWeight: '600',
  },
  metricsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  metricItem: {
    alignItems: 'center',
    flex: 1,
    backgroundColor: COLORS.background,
    padding: 8,
    borderRadius: 8,
    marginHorizontal: 2,
  },
  metricValue: {
    ...FONTS.body,
    color: COLORS.textDark,
    fontWeight: '600',
    fontSize: 12,
  },
  metricLabel: {
    ...FONTS.small,
    color: COLORS.textLight,
    marginTop: 2,
    fontSize: 10,
  },
  outletFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  costText: {
    ...FONTS.h4,
    color: COLORS.primary,
    fontWeight: 'bold',
  },
  costLabel: {
    ...FONTS.small,
    color: COLORS.textLight,
  },
  budgetCard: {
    backgroundColor: COLORS.white,
    borderRadius: SIZES.radius,
    padding: SIZES.padding,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  budgetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  budgetTitle: {
    ...FONTS.body,
    color: COLORS.textDark,
    fontWeight: '600',
  },
  budgetAmount: {
    ...FONTS.body,
    color: COLORS.primary,
    fontWeight: '600',
  },
  budgetBar: {
    height: 8,
    backgroundColor: COLORS.border,
    borderRadius: 4,
    marginBottom: 8,
  },
  budgetFill: {
    height: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: 4,
  },
  budgetRemaining: {
    ...FONTS.small,
    color: COLORS.textLight,
  },
});