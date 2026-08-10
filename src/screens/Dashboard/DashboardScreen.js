// Dashboard Screen
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  Alert,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS } from '../../constants/colors';
import { SIZES, FONTS } from '../../constants/theme';
import NotificationPanel from '../Notifications/components/NotificationPanel';
import OutletControlModal from './components/OutletControlModal';
import ApplianceSuggestion from './components/ApplianceSuggestion';
import { useOutletControl } from './hooks/useOutletControl';
import { budgetService } from '../../services/firebase';
import { auth } from '../../services/firebase/config';

const toMetricNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatMetric = (value, unit, decimals = 1) => {
  const formatted = toMetricNumber(value).toFixed(decimals);
  return `${formatted} ${unit}`;
};

const formatEnergyKwh = (value) => {
  const formatted = toMetricNumber(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${formatted} kWh`;
};

/**
 * Appliance line under each outlet title. It reflects what is actually drawing
 * power right now: while loading we stay blank rather than flashing "Not set",
 * and with no live load we say so instead of showing a stale saved name.
 */
const formatApplianceName = (name, { hasLoad, isLoading }) => {
  if (isLoading) return '—';
  if (!hasLoad) return 'Nothing plugged in';

  const normalized = String(name || '').trim();
  return normalized ? normalized : 'Not set';
};

const formatPeso = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : '0.00';
};

export const DashboardScreen = ({ navigation }) => {
  const [notificationVisible, setNotificationVisible] = useState(false);
  const [expandedSuggestionOutlet, setExpandedSuggestionOutlet] = useState(null);

  // Outlet control hook
  const {
    outlet1Status,
    outlet2Status,
    outlet1ApplianceName,
    outlet2ApplianceName,
    outlet1Metrics,
    outlet2Metrics,
    outlet1Suggestion,
    outlet2Suggestion,
    outlet1HasLoad,
    outlet2HasLoad,
    isLoadingOutlets,
    totalEnergyKwh,
    totalPowerW,
    estimatedCost,
    estimatedCostPerHour,
    effectiveRate,
    isToggling,
    toggleOutlet,
    updateApplianceName,
  } = useOutletControl();

  const outlet1Label = 'Outlet 1';
  const outlet2Label = 'Outlet 2';
  const outlet1ApplianceLabel = formatApplianceName(outlet1ApplianceName, {
    hasLoad: outlet1HasLoad,
    isLoading: isLoadingOutlets,
  });
  const outlet2ApplianceLabel = formatApplianceName(outlet2ApplianceName, {
    hasLoad: outlet2HasLoad,
    isLoading: isLoadingOutlets,
  });

  const activeOutletsCount = (outlet1Status === true ? 1 : 0) + (outlet2Status === true ? 1 : 0);

  // Budget summary. Reloaded whenever the screen regains focus so a change made
  // on the Budget Tracking screen is reflected on returning here.
  const [budget, setBudget] = useState({ monthlyBudget: 0, currentSpending: 0 });

  useFocusEffect(
    useCallback(() => {
      let active = true;

      const loadBudget = async () => {
        const userId = auth.currentUser?.uid;
        if (!userId) return;

        const result = await budgetService.getCurrentMonthBudget(userId);
        if (!active || !result.success) return;

        setBudget({
          monthlyBudget: toMetricNumber(result.data?.monthlyBudget),
          currentSpending: toMetricNumber(result.data?.currentSpending),
        });
      };

      loadBudget();
      return () => {
        active = false;
      };
    }, [])
  );

  const budgetRemaining = Math.max(0, budget.monthlyBudget - budget.currentSpending);
  const budgetPercent = budget.monthlyBudget > 0
    ? Math.min(100, (budget.currentSpending / budget.monthlyBudget) * 100)
    : 0;

  // Modal states
  const [controlModal, setControlModal] = useState({ visible: false, outlet: null });
  // Outlet number currently being named, so its suggestion buttons disable
  // during the round trip instead of queueing duplicate writes.
  const [isNamingOutlet, setIsNamingOutlet] = useState(null);

  // Handle toggle outlet
  const handleToggleOutlet = (outletNumber) => {
    setControlModal({ visible: true, outlet: outletNumber });
  };

  // Confirm toggle
  const handleConfirmToggle = async () => {
    const { outlet } = controlModal;
    const currentStatus = outlet === 1 ? outlet1Status : outlet2Status;
    const result = await toggleOutlet(outlet, !currentStatus);

    if (result.success) {
      setControlModal({ visible: false, outlet: null });
      return;
    }

    Alert.alert('Toggle Failed', result.error || 'Unable to update outlet status right now.');
  };

  const toggleSuggestionWhy = (outletNumber) => {
    setExpandedSuggestionOutlet((current) => (current === outletNumber ? null : outletNumber));
  };

  // Confirms an appliance for an outlet - either the top suggestion or one of
  // the same-wattage alternatives the user picked instead.
  const handleChooseAppliance = async (outletNumber, chosenName) => {
    const suggestion = outletNumber === 1 ? outlet1Suggestion : outlet2Suggestion;
    const name = String(chosenName || '').trim();
    if (!name || isNamingOutlet) {
      return;
    }

    const isTopSuggestion = name === suggestion?.name;
    setIsNamingOutlet(outletNumber);

    try {
      const result = await updateApplianceName(outletNumber, name, {
        source: isTopSuggestion ? 'auto_suggestion' : 'user_choice',
        confidencePercent: isTopSuggestion ? suggestion?.confidencePercent : undefined,
        modelVersion: suggestion?.modelVersion,
      });

      if (!result.success) {
        Alert.alert('Update Failed', result.error || 'Unable to apply the appliance name.');
        return;
      }

      setExpandedSuggestionOutlet((current) => (current === outletNumber ? null : current));

      // Naming always lands; learning the signature needs a few seconds of live
      // measurement, so say so instead of failing silently.
      if (!result.learned) {
        Alert.alert(
          'Saved as name only',
          result.learnError ||
            'Named, but not saved as a signature yet - keep it running for a few seconds and confirm again.'
        );
      }
    } finally {
      setIsNamingOutlet(null);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>WattWise</Text>
          <TouchableOpacity
            style={styles.notificationButton}
            onPress={() => setNotificationVisible(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.notificationIcon}>🔔</Text>
          </TouchableOpacity>
        </View>

        {/* Compact live snapshot - deliberately small so Smart Outlets leads */}
        <View style={styles.snapshotStrip}>
          <View style={styles.snapshotItem}>
            <Text style={styles.snapshotValue}>{formatEnergyKwh(totalEnergyKwh)}</Text>
            <Text style={styles.snapshotLabel}>Total energy</Text>
          </View>
          <View style={styles.snapshotDivider} />
          <View style={styles.snapshotItem}>
            <Text style={styles.snapshotValue}>₱{formatPeso(estimatedCost)}</Text>
            <Text style={styles.snapshotLabel}>Est. cost</Text>
          </View>
          <View style={styles.snapshotDivider} />
          <View style={styles.snapshotItem}>
            <Text style={styles.snapshotValue}>{activeOutletsCount}/2</Text>
            <Text style={styles.snapshotLabel}>Active</Text>
          </View>
        </View>

        {/* Live draw + what it costs per hour at the user's rate */}
        {totalPowerW > 0 ? (
          <View style={styles.liveRateRow}>
            <Ionicons name="flash" size={13} color={COLORS.primary} />
            <Text style={styles.liveRateText}>
              Drawing {totalPowerW.toFixed(1)} W · ≈₱{formatPeso(estimatedCostPerHour)}/hr at ₱
              {effectiveRate.toFixed(2)}/kWh
            </Text>
          </View>
        ) : null}

        {/* Power Safety Status */}
        <TouchableOpacity
          style={styles.safetyCard}
          onPress={() => navigation.navigate('PowerSafety')}
          activeOpacity={0.8}
        >
          <Text style={styles.safetyIcon}>🛡️</Text>
          <View style={styles.safetyInfo}>
            <Text style={styles.safetyTitle}>Power Safety Status</Text>
            <Text style={styles.safetyStatus}>Normal</Text>
          </View>
          <View style={styles.safetyBadge}>
            <Text style={styles.safetyBadgeText}>Safe</Text>
          </View>
        </TouchableOpacity>

        {/* Outlets Section - the primary content of this screen */}
        <View style={styles.sectionHeaderRow}>
          <View style={styles.sectionAccent} />
          <Text style={styles.sectionTitle}>Smart Outlets</Text>
        </View>

        {/* Outlet Cards */}
        <View style={styles.outletsContainer}>
          {/* Outlet 1 */}
          <View style={styles.outletCard}>
            <View style={styles.outletHeader}>
              <View>
                <Text style={styles.outletTitle}>{outlet1Label}</Text>
                <View style={styles.applianceRow}>
                  <Text style={styles.applianceLabel}>Appliance:</Text>
                  <Text
                    style={[
                      styles.applianceValue,
                      (!outlet1HasLoad || !outlet1ApplianceName) && styles.applianceValuePlaceholder,
                    ]}
                  >
                    {outlet1ApplianceLabel}
                  </Text>
                </View>
              </View>
              <View style={[styles.statusBadge, outlet1Status ? styles.statusOn : styles.statusOff]}>
                <View style={[styles.statusDot, outlet1Status ? styles.dotOn : styles.dotOff]} />
                <Text style={[styles.statusText, outlet1Status ? styles.statusTextOn : styles.statusTextOff]}>
                  {outlet1Status ? 'ON' : 'OFF'}
                </Text>
              </View>
            </View>

            <View style={styles.metricsGrid}>
              <View style={styles.metricItem}>
                <Ionicons name="flash" size={20} color={COLORS.primary} />
                <Text style={styles.metricValue}>{formatMetric(outlet1Metrics.power, 'W', 1)}</Text>
                <Text style={styles.metricLabel}>Power</Text>
              </View>
              <View style={styles.metricItem}>
                <Ionicons name="speedometer" size={20} color={COLORS.primary} />
                <Text style={styles.metricValue}>{formatMetric(outlet1Metrics.voltage, 'V', 1)}</Text>
                <Text style={styles.metricLabel}>Voltage</Text>
              </View>
              <View style={styles.metricItem}>
                <Ionicons name="pulse" size={20} color={COLORS.primary} />
                <Text style={styles.metricValue}>{formatMetric(outlet1Metrics.current, 'A', 3)}</Text>
                <Text style={styles.metricLabel}>Current</Text>
              </View>
              <View style={styles.metricItem}>
                <Ionicons name="time" size={20} color={COLORS.primary} />
                <Text style={styles.metricValue}>{formatEnergyKwh(outlet1Metrics.energy)}</Text>
                <Text style={styles.metricLabel}>Energy</Text>
              </View>
            </View>

            <ApplianceSuggestion
              suggestion={outlet1Suggestion}
              expanded={expandedSuggestionOutlet === 1}
              disabled={isNamingOutlet === 1}
              onToggleWhy={() => toggleSuggestionWhy(1)}
              onChoose={(name) => handleChooseAppliance(1, name)}
            />

            <TouchableOpacity
              style={[styles.toggleButton, outlet1Status ? styles.toggleButtonOn : styles.toggleButtonOff]}
              onPress={() => handleToggleOutlet(1)}
              disabled={isToggling}
            >
              <Ionicons
                name={outlet1Status ? 'power' : 'power-outline'}
                size={20}
                color={COLORS.white}
              />
              <Text style={styles.toggleButtonText}>
                {outlet1Status ? 'Turn OFF' : 'Turn ON'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Outlet 2 */}
          <View style={styles.outletCard}>
            <View style={styles.outletHeader}>
              <View>
                <Text style={styles.outletTitle}>{outlet2Label}</Text>
                <View style={styles.applianceRow}>
                  <Text style={styles.applianceLabel}>Appliance:</Text>
                  <Text
                    style={[
                      styles.applianceValue,
                      (!outlet2HasLoad || !outlet2ApplianceName) && styles.applianceValuePlaceholder,
                    ]}
                  >
                    {outlet2ApplianceLabel}
                  </Text>
                </View>
              </View>
              <View style={[styles.statusBadge, outlet2Status ? styles.statusOn : styles.statusOff]}>
                <View style={[styles.statusDot, outlet2Status ? styles.dotOn : styles.dotOff]} />
                <Text style={[styles.statusText, outlet2Status ? styles.statusTextOn : styles.statusTextOff]}>
                  {outlet2Status ? 'ON' : 'OFF'}
                </Text>
              </View>
            </View>

            <View style={styles.metricsGrid}>
              <View style={styles.metricItem}>
                <Ionicons name="flash" size={20} color={COLORS.primary} />
                <Text style={styles.metricValue}>{formatMetric(outlet2Metrics.power, 'W', 1)}</Text>
                <Text style={styles.metricLabel}>Power</Text>
              </View>
              <View style={styles.metricItem}>
                <Ionicons name="speedometer" size={20} color={COLORS.primary} />
                <Text style={styles.metricValue}>{formatMetric(outlet2Metrics.voltage, 'V', 1)}</Text>
                <Text style={styles.metricLabel}>Voltage</Text>
              </View>
              <View style={styles.metricItem}>
                <Ionicons name="pulse" size={20} color={COLORS.primary} />
                <Text style={styles.metricValue}>{formatMetric(outlet2Metrics.current, 'A', 3)}</Text>
                <Text style={styles.metricLabel}>Current</Text>
              </View>
              <View style={styles.metricItem}>
                <Ionicons name="time" size={20} color={COLORS.primary} />
                <Text style={styles.metricValue}>{formatEnergyKwh(outlet2Metrics.energy)}</Text>
                <Text style={styles.metricLabel}>Energy</Text>
              </View>
            </View>

            <ApplianceSuggestion
              suggestion={outlet2Suggestion}
              expanded={expandedSuggestionOutlet === 2}
              disabled={isNamingOutlet === 2}
              onToggleWhy={() => toggleSuggestionWhy(2)}
              onChoose={(name) => handleChooseAppliance(2, name)}
            />

            <TouchableOpacity
              style={[styles.toggleButton, outlet2Status ? styles.toggleButtonOn : styles.toggleButtonOff]}
              onPress={() => handleToggleOutlet(2)}
              disabled={isToggling}
            >
              <Ionicons
                name={outlet2Status ? 'power' : 'power-outline'}
                size={20}
                color={COLORS.white}
              />
              <Text style={styles.toggleButtonText}>
                {outlet2Status ? 'Turn OFF' : 'Turn ON'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Modals */}
        <OutletControlModal
          visible={controlModal.visible}
          onClose={() => setControlModal({ visible: false, outlet: null })}
          outletNumber={controlModal.outlet}
          outletName={controlModal.outlet === 1 ? outlet1Label : outlet2Label}
          currentStatus={controlModal.outlet === 1 ? outlet1Status : outlet2Status}
          onConfirm={handleConfirmToggle}
          isLoading={isToggling}
        />

        {/* Budget Overview */}
        <TouchableOpacity
          style={styles.budgetCard}
          onPress={() => navigation.navigate('BudgetTracking')}
          activeOpacity={0.8}
        >
          <View style={styles.budgetHeader}>
            <Text style={styles.budgetTitle}>Monthly Budget</Text>
            <Text style={styles.budgetAmount}>
              ₱{formatPeso(budget.currentSpending)} / ₱{formatPeso(budget.monthlyBudget)}
            </Text>
          </View>
          <View style={styles.budgetBar}>
            <View style={[styles.budgetFill, { width: `${budgetPercent}%` }]} />
          </View>
          <Text style={styles.budgetRemaining}>
            {budget.monthlyBudget > 0
              ? `₱${formatPeso(budgetRemaining)} remaining`
              : 'Tap to set a monthly budget'}
          </Text>
        </TouchableOpacity>

        {/* Reference Comparison Card */}
        <TouchableOpacity
          style={styles.comparisonCard}
          onPress={() => navigation.navigate('ReferenceComparison')}
        >
          <View style={styles.comparisonIcon}>
            <Ionicons name="bar-chart" size={24} color={COLORS.primary} />
          </View>
          <View style={styles.comparisonContent}>
            <Text style={styles.comparisonTitle}>Compare Usage</Text>
            <Text style={styles.comparisonSubtitle}>View month-over-month trends</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={COLORS.textLight} />
        </TouchableOpacity>
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
  snapshotStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: SIZES.radius,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 12,
    paddingHorizontal: 8,
    marginBottom: 10,
  },
  snapshotItem: {
    flex: 1,
    alignItems: 'center',
  },
  snapshotValue: {
    ...FONTS.body,
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textDark,
  },
  snapshotLabel: {
    ...FONTS.small,
    fontSize: 11,
    color: COLORS.textLight,
    marginTop: 2,
  },
  snapshotDivider: {
    width: 1,
    height: 26,
    backgroundColor: COLORS.border,
  },
  liveRateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  liveRateText: {
    ...FONTS.small,
    fontSize: 11,
    color: COLORS.textLight,
    flexShrink: 1,
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
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    marginTop: 4,
  },
  sectionAccent: {
    width: 4,
    height: 20,
    borderRadius: 2,
    backgroundColor: COLORS.primary,
  },
  sectionTitle: {
    ...FONTS.h3,
    color: COLORS.textDark,
    fontWeight: 'bold',
  },
  outletsContainer: {
    marginBottom: 8,
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
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  outletTitle: {
    ...FONTS.h4,
    color: COLORS.textDark,
    fontWeight: 'bold',
  },
  applianceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 6,
  },
  applianceLabel: {
    ...FONTS.small,
    color: COLORS.textLight,
  },
  applianceValue: {
    ...FONTS.body,
    color: COLORS.textDark,
    fontWeight: '600',
    fontSize: 13,
  },
  applianceValuePlaceholder: {
    color: COLORS.textLight,
    fontWeight: '500',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  statusOn: {
    backgroundColor: COLORS.success + '20',
  },
  statusOff: {
    backgroundColor: COLORS.textLight + '20',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotOn: {
    backgroundColor: COLORS.success,
  },
  dotOff: {
    backgroundColor: COLORS.textLight,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  statusTextOn: {
    color: COLORS.success,
  },
  statusTextOff: {
    color: COLORS.textLight,
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
  toggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
    marginTop: 12,
  },
  toggleButtonOn: {
    backgroundColor: COLORS.error,
  },
  toggleButtonOff: {
    backgroundColor: COLORS.success,
  },
  toggleButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.white,
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
  comparisonCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    padding: 16,
    marginHorizontal: 20,
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  comparisonIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.primaryLight + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  comparisonContent: {
    flex: 1,
  },
  comparisonTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 2,
  },
  comparisonSubtitle: {
    fontSize: 12,
    color: COLORS.textLight,
  },
});