// Dashboard Screen
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS } from '../../constants/colors';
import { SIZES, FONTS } from '../../constants/theme';
import { describeRelayFault } from '../../constants/relayFault';
import NotificationPanel from '../Notifications/components/NotificationPanel';
import { useNotifications } from '../Notifications/hooks/useNotifications';
import { RateNotice } from '../../components/common/RateNotice';
import { OfflineState } from '../../components/common/OfflineNotice';
import { useDismissibleNotice } from '../../hooks/useDismissibleNotice';
import { useOutletControl } from './hooks/useOutletControl';
import { useSafetyStage } from './hooks/useSafetyStage';
import { getSafetyStageConfig } from '../PowerSafetyManagement/utils/safetyHelpers';
import { budgetService } from '../../services/firebase';
import { auth } from '../../services/firebase/config';
import { Wordmark } from '../../components/common/Wordmark';
import LinkHubCard from '../Outlets/components/LinkHubCard';

const toMetricNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * A kWh figure at a precision that can actually show it.
 *
 * Two decimals is right for a month and useless for an hour: a 16 W lamp running
 * for four minutes is 0.001 kWh, which printed as "0.00 kWh" beside a live power
 * reading that was plainly not zero. The web client shows three decimals and so
 * the two clients disagreed on screen about whether anything had been measured.
 *
 * Below 1 kWh the third decimal is the only one carrying information, so it is
 * shown; above that it is noise on a figure people read in whole kWh.
 */
// Built once each, not per call. `toLocaleString` with options constructs an
// Intl.NumberFormat internally every time, which is one of the more expensive
// things available in Hermes - and this runs three times per render on a screen
// that re-renders with every telemetry post.
const KWH_FORMATTERS = {
  2: new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  3: new Intl.NumberFormat(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 }),
};

const formatEnergyKwh = (value) => {
  const parsed = toMetricNumber(value);
  const decimals = parsed > 0 && Math.abs(parsed) < 1 ? 3 : 2;

  return `${KWH_FORMATTERS[decimals].format(parsed)} kWh`;
};

const formatPeso = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : '0.00';
};

export const DashboardScreen = ({ navigation }) => {
  const [notificationVisible, setNotificationVisible] = useState(false);

  // Only the count is used here - the panel loads its own list when opened.
  const { unreadCount } = useNotifications();
  const rateNotice = useDismissibleNotice('rate-notice');

  // The card below used to be two hardcoded strings. It read the same document
  // the Power Safety screen does - it just never asked for it.
  const safetyStage = useSafetyStage();

  // Outlet control hook
  const {
    outlet1Status,
    outlet2Status,
    outlet1HasReading,
    outlet2HasReading,
    outlet1RelayStuck,
    outlet2RelayStuck,
    hasNeverReported,
    outletsUnreachable,
    totalEnergyKwh,
    totalPowerW,
    estimatedCost,
    estimatedCostPerHour,
    effectiveRate,
    hasSupplyRates,
  } = useOutletControl();

  // Staleness comes from the outlets, not from the safety document's own
  // 40-second rule. Both live on this screen now, and with two different
  // definitions the card read "All systems operating within safe parameters"
  // beside an outlet badge reading "On - no reading". The safety doc is written
  // every 15s so it needs the wider window on its own screen; here the outlets
  // are the same signal the badges use, so the screen cannot contradict itself.
  const safetyConfig = getSafetyStageConfig(
    safetyStage,
    !outlet1HasReading && !outlet2HasReading
  );

  const activeOutletsCount = (outlet1Status === true ? 1 : 0) + (outlet2Status === true ? 1 : 0);

  // Budget summary. Reloaded whenever the screen regains focus so a change made
  // on the Budget Tracking screen is reflected on returning here.
  const [budget, setBudget] = useState({ monthlyBudget: 0, currentSpending: 0 });
  // Whether the figures above came from a read that returned.
  const [budgetKnown, setBudgetKnown] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      const loadBudget = async () => {
        const userId = auth.currentUser?.uid;
        if (!userId) return;

        const result = await budgetService.getCurrentMonthBudget(userId);
        if (!active) return;

        // A failed read left this card sitting at ₱0.00 / ₱0.00 with "Tap to
        // set a monthly budget" - directly below the card that had just said
        // the app could not reach Dagitab. Two panels on one screen, one of
        // them confidently wrong.
        if (!result.success) {
          setBudgetKnown(false);
          return;
        }

        setBudgetKnown(true);
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

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Header */}
        <View style={styles.header}>
          <Wordmark height={30} />
          <TouchableOpacity
            style={styles.notificationButton}
            onPress={() => setNotificationVisible(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.notificationIcon}>🔔</Text>
            {unreadCount > 0 && (
              <View style={styles.notificationBadge}>
                <Text style={styles.notificationBadgeText}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Compact live snapshot - deliberately small so Smart Outlets leads */}
        {!hasSupplyRates && rateNotice.visible && (
          <RateNotice
            onPress={() => navigation.navigate('Settings')}
            onDismiss={rateNotice.dismiss}
          />
        )}

        {/*
          Above the snapshot strip and not dismissible. Every other notice on
          this screen describes something the user may reasonably choose to
          ignore; this one describes an outlet that is live and that Dagitab
          cannot open, so the auto-cutoff cannot protect it either. The only
          action that ends the condition is physical, which is why the text says
          so plainly instead of pointing at a screen.
        */}
        {[
          { number: 1, stuck: outlet1RelayStuck, fresh: outlet1HasReading },
          { number: 2, stuck: outlet2RelayStuck, fresh: outlet2HasReading },
        ].filter((item) => item.stuck).map((item) => (
          <View key={`relay-stuck-${item.number}`} style={styles.relayFaultNotice}>
            <Text style={styles.relayFaultTitle}>
              ⚠️ Outlet {item.number} is not switching off
            </Text>
            <Text style={styles.relayFaultBody}>
              {describeRelayFault(item.fresh)}
            </Text>
          </View>
        ))}

        {/* Three figures that are each an assertion about the account, sitting
            directly above a card that admits it could not reach the outlets.
            With no read behind them they all collapse to zero, and "0.00 kWh /
            ₱0.00 / 0/2 Active" is exactly what a real, idle, fully-read account
            looks like - the reader has no way to tell the two apart. History's
            summary tiles solved this by printing an em-dash, and that is the
            pattern here: no number at all beats a number that means nothing. */}
        <View style={styles.snapshotStrip}>
          <View style={styles.snapshotItem}>
            <Text style={styles.snapshotValue}>
              {outletsUnreachable ? '—' : formatEnergyKwh(totalEnergyKwh)}
            </Text>
            <Text style={styles.snapshotLabel}>Total energy</Text>
          </View>
          <View style={styles.snapshotDivider} />
          <View style={styles.snapshotItem}>
            <Text style={styles.snapshotValue}>
              {outletsUnreachable ? '—' : `₱${formatPeso(estimatedCost)}`}
            </Text>
            <Text style={styles.snapshotLabel}>Est. cost</Text>
          </View>
          <View style={styles.snapshotDivider} />
          <View style={styles.snapshotItem}>
            <Text style={styles.snapshotValue}>
              {outletsUnreachable ? '—' : `${activeOutletsCount}/2`}
            </Text>
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
            <Text style={styles.safetyStatus}>{safetyConfig.description}</Text>
          </View>
          {/* "Normal" and "Safe" were literals here, so this card asserted the
              system was safe during an active cutoff - with the cutoff's own
              push notification on screen directly above it, and the Power
              Safety screen one tap away reading "Cut-off Active". */}
          {/* textColor: the darker shade. White on the amber `color` is 2.1:1. */}
          <View style={[styles.safetyBadge, { backgroundColor: safetyConfig.textColor || safetyConfig.color }]}>
            <Text style={styles.safetyBadgeText}>{safetyConfig.label}</Text>
          </View>
        </TouchableOpacity>

        {/* The outlet cards moved to the Outlets tab (Oct 2026). Home keeps the
            two things that are about the account rather than one outlet: the
            offline notice, and the setup prompt for an account with no Hub yet -
            this is the first screen after sign-up. */}
        {outletsUnreachable ? (
          <OfflineState
            body={
              'Your outlets and readings are safe — the app just needs a ' +
              'connection to load them. Check your wi-fi or mobile data, then ' +
              'pull down to refresh.'
            }
          />
        ) : hasNeverReported ? (
          <LinkHubCard
            style={styles.linkHub}
            onPress={() => navigation.navigate('Settings')}
          />
        ) : null}

        {/* Budget Overview */}
        <TouchableOpacity
          style={styles.budgetCard}
          onPress={() => navigation.navigate('BudgetTracking')}
          activeOpacity={0.8}
        >
          <View style={styles.budgetHeader}>
            <Text style={styles.budgetTitle}>Monthly Budget</Text>
            <Text style={styles.budgetAmount}>
              {budgetKnown
                ? `₱${formatPeso(budget.currentSpending)} / ₱${formatPeso(budget.monthlyBudget)}`
                : '—'}
            </Text>
          </View>
          <View style={styles.budgetBar}>
            <View style={[styles.budgetFill, { width: `${budgetKnown ? budgetPercent : 0}%` }]} />
          </View>
          <Text style={styles.budgetRemaining}>
            {!budgetKnown
              ? 'Not loaded — needs a connection'
              : budget.monthlyBudget > 0
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
  linkHub: {
    marginBottom: 16,
  },
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
  notificationBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.white,
  },
  notificationBadgeText: {
    color: COLORS.white,
    fontSize: 10,
    fontWeight: '700',
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
    gap: 8,
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
    // Colour now comes from the stage config; this is the fallback only.
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    // "Cut-off Active" and "No readings" are longer than "Safe" ever was.
    flexShrink: 0,
  },
  safetyBadgeText: {
    ...FONTS.small,
    color: COLORS.white,
    fontWeight: '600',
  },
  // Kept mounted rather than unmounted so the outlet cards do not have to
  // re-initialise the moment the first telemetry arrives.
  // The appliance line is the part that may wrap; the pill keeps its width.
  // "Not <name>" - the measurements contradict the label. Amber rather than red:
  // a swapped appliance is something to correct, not a fault. Matches the web
  // client's treatment and the notice that explains how to clear it.
  // Amber, the tone this app already uses for "in flight or needs attention,
  // not broken" - the same treatment as the swapped-appliance notice.
  // Red, and the only place this badge uses it. Amber already means "in flight
  // or needs attention, not broken", which is exactly what a stuck relay is
  // not - reusing it here would have put the one uncontrollable outlet in the
  // same colour as a normal switch-off waiting on a poll.
  relayFaultNotice: {
    backgroundColor: COLORS.error + '12',
    borderWidth: 1,
    borderColor: COLORS.error + '40',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 12,
    gap: 4,
  },
  relayFaultTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.error,
  },
  relayFaultBody: {
    fontSize: 12,
    lineHeight: 17,
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