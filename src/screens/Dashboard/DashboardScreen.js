// Dashboard Screen
import React, { useState } from 'react';
import {
  View,
  Text,
  Alert,
  Button,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '../../constants/colors';
import { SIZES, FONTS } from '../../constants/theme';
import NotificationPanel from '../Notifications/components/NotificationPanel';
import OutletControlModal from './components/OutletControlModal';
import EditApplianceNameModal from './components/EditApplianceNameModal';
import { useOutletControl } from './hooks/useOutletControl';
import { auth, notificationService } from '../../services/firebase';

const formatSuggestionLabel = (suggestion) => {
  if (!suggestion?.name) return '';

  if (typeof suggestion.confidencePercent === 'number') {
    return `Suggested: ${suggestion.name} (${suggestion.confidencePercent}%)`;
  }

  return `Suggested: ${suggestion.name}`;
};

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

const formatRuntimeLabel = (runtimeSeconds) => {
  const seconds = toMetricNumber(runtimeSeconds);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '';
  }

  const roundedSeconds = Math.round(seconds);
  if (roundedSeconds < 60) {
    return `${roundedSeconds}s`;
  }

  const totalMinutes = Math.floor(roundedSeconds / 60);
  if (totalMinutes < 60) {
    return `${totalMinutes}m`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
};

const formatSuggestionWhy = (suggestion) => {
  const details = [];

  if (typeof suggestion?.meanPowerW === 'number') {
    details.push(`Avg power ${toMetricNumber(suggestion.meanPowerW).toFixed(1)} W`);
  }

  const runtimeLabel = formatRuntimeLabel(suggestion?.runtimeSeconds);
  if (runtimeLabel) {
    details.push(`Runtime ${runtimeLabel}`);
  }

  if (typeof suggestion?.confidencePercent === 'number') {
    details.push(`Confidence ${suggestion.confidencePercent}%`);
  }

  if (typeof suggestion?.sampleCount === 'number') {
    details.push(`Samples ${Math.max(0, Math.round(suggestion.sampleCount))}`);
  }

  return details.length > 0
    ? details.join(' • ')
    : 'Based on recent live power telemetry.';
};

export const DashboardScreen = ({ navigation }) => {
  const [notificationVisible, setNotificationVisible] = useState(false);
  const [expandedSuggestionOutlet, setExpandedSuggestionOutlet] = useState(null);

  // Outlet control hook
  const {
    outlet1Status,
    outlet2Status,
    outlet1Name,
    outlet2Name,
    outlet1Metrics,
    outlet2Metrics,
    outlet1Suggestion,
    outlet2Suggestion,
    isToggling,
    toggleOutlet,
    updateApplianceName,
  } = useOutletControl();

  const totalEnergyKwh = toMetricNumber(outlet1Metrics.energy) + toMetricNumber(outlet2Metrics.energy);
  const activeOutletsCount = (outlet1Status === true ? 1 : 0) + (outlet2Status === true ? 1 : 0);

  // Modal states
  const [controlModal, setControlModal] = useState({ visible: false, outlet: null });
  const [editModal, setEditModal] = useState({ visible: false, outlet: null });

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

  // Handle edit name
  const handleEditName = (outletNumber) => {
    setEditModal({ visible: true, outlet: outletNumber });
  };

  // Save appliance name
  const handleSaveName = async (newName) => {
    const { outlet } = editModal;
    const result = await updateApplianceName(outlet, newName);
    if (!result.success) {
      Alert.alert('Update Failed', result.error || 'Unable to update appliance name right now.');
      return;
    }
    setEditModal({ visible: false, outlet: null });
  };

  const toggleSuggestionWhy = (outletNumber) => {
    setExpandedSuggestionOutlet((current) => (current === outletNumber ? null : outletNumber));
  };

  const handleAcceptSuggestion = async (outletNumber) => {
    const suggestion = outletNumber === 1 ? outlet1Suggestion : outlet2Suggestion;
    if (!suggestion?.canAccept || !suggestion?.name) {
      return;
    }

    const result = await updateApplianceName(outletNumber, suggestion.name, {
      source: 'auto_suggestion',
      confidencePercent: suggestion.confidencePercent,
      modelVersion: suggestion.modelVersion,
    });
    if (!result.success) {
      Alert.alert('Update Failed', result.error || 'Unable to apply suggested appliance name.');
      return;
    }

    setExpandedSuggestionOutlet((current) => (current === outletNumber ? null : current));
  };

  const createTestNotification = async () => {
    const user = auth.currentUser;
    if (!user) return;

    await notificationService.createNotification(user.uid, {
      type: 'high_usage',
      title: 'Test Notification',
      message: 'This is a test notification from the app',
      outlet: 1,
      metadata: {
        source: 'dashboard-test-button',
        severity: 'info',
      },
    });

    Alert.alert('Success', 'Test notification created!');
  };

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

        <Button
          title="Create Test Notification"
          onPress={createTestNotification}
        />

        {/* Total Energy Summary Card */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryGlowCircle} />
          <View style={styles.summaryTopRow}>
            <View>
              <Text style={styles.summaryEyebrow}>Live Household Snapshot</Text>
              <Text style={styles.summaryTitle}>Total Energy Usage</Text>
            </View>
            <View style={styles.summaryIconBadge}>
              <Ionicons name="flash" size={18} color={COLORS.white} />
            </View>
          </View>

          <Text style={styles.summaryValue}>{formatEnergyKwh(totalEnergyKwh)}</Text>

          <View style={styles.summaryPillRow}>
            <View style={styles.summaryPill}>
              <Text style={styles.summaryPillValue}>₱0.00</Text>
              <Text style={styles.summaryPillLabel}>Estimated Cost</Text>
            </View>
            <View style={styles.summaryPill}>
              <Text style={styles.summaryPillValue}>{activeOutletsCount}</Text>
              <Text style={styles.summaryPillLabel}>Active Outlets</Text>
            </View>
          </View>
        </View>

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

        {/* Outlets Section */}
        <Text style={styles.sectionTitle}>Smart Outlets</Text>

        {/* Outlet Cards */}
        <View style={styles.outletsContainer}>
          {/* Outlet 1 */}
          <View style={styles.outletCard}>
            <View style={styles.outletHeader}>
              <View>
                <View style={styles.outletTitleRow}>
                  <Text style={styles.outletTitle}>{outlet1Name}</Text>
                  <TouchableOpacity
                    style={styles.editButton}
                    onPress={() => handleEditName(1)}
                  >
                    <Ionicons name="create-outline" size={16} color={COLORS.primary} />
                  </TouchableOpacity>
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

            {outlet1Suggestion.showBadge ? (
              <>
                <View style={styles.suggestionRow}>
                  <Text style={styles.suggestionText}>{formatSuggestionLabel(outlet1Suggestion)}</Text>
                  <View style={styles.suggestionActions}>
                    <TouchableOpacity
                      style={[
                        styles.suggestionMetaButton,
                        expandedSuggestionOutlet === 1 && styles.suggestionMetaButtonActive,
                      ]}
                      onPress={() => toggleSuggestionWhy(1)}
                    >
                      <Ionicons name="information-circle-outline" size={14} color={COLORS.primary} />
                      <Text style={styles.suggestionMetaText}>Why</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.suggestionAction, isToggling && styles.suggestionActionDisabled]}
                      onPress={() => handleAcceptSuggestion(1)}
                      disabled={isToggling}
                    >
                      <Text style={styles.suggestionActionText}>Accept</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {expandedSuggestionOutlet === 1 ? (
                  <View style={styles.suggestionDetailCard}>
                    <Text style={styles.suggestionDetailTitle}>Why this suggestion?</Text>
                    <Text style={styles.suggestionDetailText}>{formatSuggestionWhy(outlet1Suggestion)}</Text>
                  </View>
                ) : null}
              </>
            ) : null}

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
                <View style={styles.outletTitleRow}>
                  <Text style={styles.outletTitle}>{outlet2Name}</Text>
                  <TouchableOpacity
                    style={styles.editButton}
                    onPress={() => handleEditName(2)}
                  >
                    <Ionicons name="create-outline" size={16} color={COLORS.primary} />
                  </TouchableOpacity>
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

            {outlet2Suggestion.showBadge ? (
              <>
                <View style={styles.suggestionRow}>
                  <Text style={styles.suggestionText}>{formatSuggestionLabel(outlet2Suggestion)}</Text>
                  <View style={styles.suggestionActions}>
                    <TouchableOpacity
                      style={[
                        styles.suggestionMetaButton,
                        expandedSuggestionOutlet === 2 && styles.suggestionMetaButtonActive,
                      ]}
                      onPress={() => toggleSuggestionWhy(2)}
                    >
                      <Ionicons name="information-circle-outline" size={14} color={COLORS.primary} />
                      <Text style={styles.suggestionMetaText}>Why</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.suggestionAction, isToggling && styles.suggestionActionDisabled]}
                      onPress={() => handleAcceptSuggestion(2)}
                      disabled={isToggling}
                    >
                      <Text style={styles.suggestionActionText}>Accept</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {expandedSuggestionOutlet === 2 ? (
                  <View style={styles.suggestionDetailCard}>
                    <Text style={styles.suggestionDetailTitle}>Why this suggestion?</Text>
                    <Text style={styles.suggestionDetailText}>{formatSuggestionWhy(outlet2Suggestion)}</Text>
                  </View>
                ) : null}
              </>
            ) : null}

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
          outletName={controlModal.outlet === 1 ? outlet1Name : outlet2Name}
          currentStatus={controlModal.outlet === 1 ? outlet1Status : outlet2Status}
          onConfirm={handleConfirmToggle}
          isLoading={isToggling}
        />

        <EditApplianceNameModal
          visible={editModal.visible}
          onClose={() => setEditModal({ visible: false, outlet: null })}
          outletNumber={editModal.outlet}
          currentName={editModal.outlet === 1 ? outlet1Name : outlet2Name}
          onSave={handleSaveName}
        />

        {/* Budget Overview */}
        <TouchableOpacity
          style={styles.budgetCard}
          onPress={() => navigation.navigate('BudgetTracking')}
          activeOpacity={0.8}
        >
          <View style={styles.budgetHeader}>
            <Text style={styles.budgetTitle}>Monthly Budget</Text>
            <Text style={styles.budgetAmount}>₱0.00 / ₱0.00</Text>
          </View>
          <View style={styles.budgetBar}>
            <View style={[styles.budgetFill, { width: '0%' }]} />
          </View>
          <Text style={styles.budgetRemaining}>₱0.00 remaining</Text>
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
    borderWidth: 1,
    borderColor: COLORS.primaryDark,
    overflow: 'hidden',
    marginBottom: 16,
  },
  summaryGlowCircle: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: COLORS.white,
    opacity: 0.08,
    top: -48,
    right: -36,
  },
  summaryTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  summaryEyebrow: {
    ...FONTS.small,
    color: COLORS.white,
    opacity: 0.84,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  summaryTitle: {
    ...FONTS.body,
    color: COLORS.white,
    opacity: 0.95,
    fontWeight: '600',
  },
  summaryIconBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.white + '2E',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.white + '4D',
  },
  summaryValue: {
    fontSize: 40,
    fontWeight: 'bold',
    color: COLORS.white,
    marginBottom: 14,
    letterSpacing: 0.3,
  },
  summaryPillRow: {
    flexDirection: 'row',
    gap: 10,
  },
  summaryPill: {
    flex: 1,
    backgroundColor: COLORS.white + '1F',
    borderWidth: 1,
    borderColor: COLORS.white + '2E',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  summaryPillValue: {
    ...FONTS.h4,
    color: COLORS.white,
    fontWeight: 'bold',
  },
  summaryPillLabel: {
    ...FONTS.small,
    color: COLORS.white,
    opacity: 0.82,
    marginTop: 4,
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
    alignItems: 'center',
    marginBottom: 16,
  },
  outletTitle: {
    ...FONTS.h4,
    color: COLORS.textDark,
    fontWeight: 'bold',
  },
  outletTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  editButton: {
    padding: 4,
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
  suggestionRow: {
    marginTop: -4,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.primary + '12',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.primary + '40',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
  },
  suggestionText: {
    flex: 1,
    ...FONTS.small,
    color: COLORS.textDark,
    fontWeight: '600',
  },
  suggestionActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  suggestionMetaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.primary + '55',
    backgroundColor: COLORS.white,
  },
  suggestionMetaButtonActive: {
    backgroundColor: COLORS.primary + '14',
    borderColor: COLORS.primary,
  },
  suggestionMetaText: {
    ...FONTS.small,
    color: COLORS.primary,
    fontWeight: '700',
  },
  suggestionAction: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: COLORS.primary,
  },
  suggestionActionDisabled: {
    opacity: 0.55,
  },
  suggestionActionText: {
    ...FONTS.small,
    color: COLORS.white,
    fontWeight: '700',
  },
  suggestionDetailCard: {
    marginTop: -2,
    marginBottom: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  suggestionDetailTitle: {
    ...FONTS.small,
    color: COLORS.textDark,
    fontWeight: '700',
    marginBottom: 4,
  },
  suggestionDetailText: {
    ...FONTS.small,
    color: COLORS.textLight,
    lineHeight: 16,
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