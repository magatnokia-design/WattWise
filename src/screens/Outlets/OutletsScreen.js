import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';
import AppDialog from '../../components/common/AppDialog';
import { OfflineState } from '../../components/common/OfflineNotice';
import { isConnectivityError } from '../../utils/connectivity';
import OutletControlModal from '../Dashboard/components/OutletControlModal';
import ApplianceSuggestion from '../Dashboard/components/ApplianceSuggestion';
import { useOutletControl } from '../Dashboard/hooks/useOutletControl';
import { resolveOutletBadge } from '../Dashboard/utils/outletBadge';
import LinkHubCard from './components/LinkHubCard';
import SafetyStatusPill from '../PowerSafetyManagement/components/SafetyStatusPill';
import { formatApplianceName, toMetricNumber } from './utils/outletLabels';
import { describeRelayFault } from '../../constants/relayFault';

/**
 * The two outlets, and nothing else - the centre tab (Oct 2026: "an Outlet tab
 * that stands out in the middle ... only two outlets, Power and Voltage").
 *
 * Moved here from Home, not rebuilt: the same useOutletControl hook, the same
 * confirmation modal, the same suggestion card and the same two failure
 * messages, so switching an outlet behaves exactly as it did. What changed is
 * what is shown: Power and Voltage only, large, with current and energy gone -
 * energy totals live on Home and in Analytics.
 *
 * Power and voltage are only shown while the outlet is reporting
 * (`hasReading`, the 12 s freshness rule). A frozen reading is printed as "—",
 * never as the last value the Hub sent - see "A stored reading is not a live
 * one" in CLAUDE.md.
 */

const TONES = {
  good: { bg: '#ECF8EF', fg: COLORS.primaryDark },
  warn: { bg: '#FFFBEB', fg: '#B45309' },
  danger: { bg: '#FEF2F2', fg: COLORS.error },
  off: { bg: COLORS.background, fg: COLORS.textLight },
};

const OutletCard = ({
  number,
  isOn,
  badge,
  applianceLabel,
  applianceMuted,
  metrics,
  hasReading,
  suggestion,
  suggestionExpanded,
  naming,
  onToggleWhy,
  onChoose,
  onToggle,
  disabled,
}) => {
  const tone = TONES[badge.tone] || TONES.off;
  const live = hasReading;
  const power = live ? `${toMetricNumber(metrics.power).toFixed(1)}` : '—';
  const voltage = live ? `${toMetricNumber(metrics.voltage).toFixed(0)}` : '—';

  return (
    <View style={[styles.card, isOn && styles.cardOn]}>
      <View style={styles.cardTop}>
        <View style={[styles.socket, isOn && styles.socketOn]}>
          <MaterialCommunityIcons
            name="power-socket-us"
            size={26}
            color={isOn ? COLORS.white : COLORS.textLight}
          />
        </View>
        <View style={styles.cardTitleBlock}>
          <Text style={styles.cardTitle}>Outlet {number}</Text>
          <Text
            style={[styles.appliance, applianceMuted && styles.applianceMuted]}
            numberOfLines={1}
          >
            {applianceLabel}
          </Text>
        </View>
        <View style={[styles.badge, { backgroundColor: tone.bg }]}>
          <View style={[styles.badgeDot, { backgroundColor: tone.fg }]} />
          <Text style={[styles.badgeText, { color: tone.fg }]}>{badge.text}</Text>
        </View>
      </View>

      <View style={styles.metrics}>
        <View style={styles.metric}>
          <View style={styles.metricHead}>
            <Ionicons name="flash" size={16} color={COLORS.primary} />
            <Text style={styles.metricLabel}>Power</Text>
          </View>
          <Text style={styles.metricValue}>
            {power}
            <Text style={styles.metricUnit}>{live ? ' W' : ''}</Text>
          </Text>
        </View>
        <View style={styles.metricDivider} />
        <View style={styles.metric}>
          <View style={styles.metricHead}>
            <Ionicons name="speedometer" size={16} color={COLORS.primary} />
            <Text style={styles.metricLabel}>Voltage</Text>
          </View>
          <Text style={styles.metricValue}>
            {voltage}
            <Text style={styles.metricUnit}>{live ? ' V' : ''}</Text>
          </Text>
        </View>
      </View>

      <ApplianceSuggestion
        suggestion={suggestion}
        expanded={suggestionExpanded}
        disabled={naming}
        onToggleWhy={onToggleWhy}
        onChoose={onChoose}
      />

      <TouchableOpacity
        style={[styles.toggle, isOn ? styles.toggleOff : styles.toggleOn]}
        onPress={onToggle}
        disabled={disabled}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={`${isOn ? 'Turn off' : 'Turn on'} outlet ${number}`}
      >
        <Ionicons name="power" size={20} color={isOn ? COLORS.error : COLORS.white} />
        <Text style={[styles.toggleText, isOn && styles.toggleTextOff]}>
          {isOn ? 'Turn off' : 'Turn on'}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const OutletsScreen = ({ navigation }) => {
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
    outlet1HasReading,
    outlet2HasReading,
    outlet1SwitchingTo,
    outlet2SwitchingTo,
    outlet1RelayStuck,
    outlet2RelayStuck,
    isLoadingOutlets,
    hasNeverReported,
    outletsUnreachable,
    isToggling,
    toggleOutlet,
    updateApplianceName,
  } = useOutletControl();

  const [controlModal, setControlModal] = useState({ visible: false, outlet: null });
  const [expandedSuggestion, setExpandedSuggestion] = useState(null);
  // Outlet being named, so its suggestion buttons disable during the round trip.
  const [namingOutlet, setNamingOutlet] = useState(null);
  const [dialog, setDialog] = useState(null);

  const outlets = [1, 2].map((number) => {
    const one = number === 1;
    const suggestion = one ? outlet1Suggestion : outlet2Suggestion;
    const hasLoad = one ? outlet1HasLoad : outlet2HasLoad;
    const hasReading = one ? outlet1HasReading : outlet2HasReading;
    const applianceName = one ? outlet1ApplianceName : outlet2ApplianceName;
    const isOn = one ? outlet1Status : outlet2Status;
    return {
      number,
      isOn,
      suggestion,
      hasReading,
      metrics: one ? outlet1Metrics : outlet2Metrics,
      applianceLabel: formatApplianceName(applianceName, {
        hasLoad,
        hasReading,
        isLoading: isLoadingOutlets,
        identityState: suggestion.identityState,
        unsupported: suggestion.unsupported,
        unsupportedReason: suggestion.unsupportedReason,
        measuredPowerW: suggestion.measuredPowerW,
      }),
      applianceMuted: !hasLoad || !applianceName,
      // Shared with the web client, byte-identical.
      badge: resolveOutletBadge({
        isOn,
        isDrawing: hasLoad,
        telemetryFresh: hasReading,
        switchingTo: one ? outlet1SwitchingTo : outlet2SwitchingTo,
        relayStuck: one ? outlet1RelayStuck : outlet2RelayStuck,
      }),
    };
  });

  const handleConfirmToggle = async () => {
    const { outlet } = controlModal;
    const current = outlet === 1 ? outlet1Status : outlet2Status;
    const result = await toggleOutlet(outlet, !current);

    setControlModal({ visible: false, outlet: null });
    if (result.success) return;

    // A connectivity failure means the command never left this phone; anything
    // else reached the server and was refused there. Deferred past the modal's
    // fade so the dialog does not render behind it.
    const offline = isConnectivityError(result);
    setTimeout(() => {
      setDialog(offline ? {
        icon: '📡',
        tone: 'warning',
        title: 'No connection',
        message: 'The command could not leave this phone, so the outlet has not changed. Check your wi-fi or mobile data and try again — the Hub is fine.',
      } : {
        icon: '⚠️',
        tone: 'danger',
        title: 'The outlet did not switch',
        message: result.error
          || 'The command reached Dagitab but could not be carried out. Check that the Hub is powered and online, then try again.',
      });
    }, 300);
  };

  const handleChooseAppliance = async (number, chosenName) => {
    const suggestion = number === 1 ? outlet1Suggestion : outlet2Suggestion;
    const name = String(chosenName || '').trim();
    if (!name || namingOutlet) return;

    const isTop = name === suggestion?.name;
    setNamingOutlet(number);
    try {
      const result = await updateApplianceName(number, name, {
        source: isTop ? 'auto_suggestion' : 'user_choice',
        confidencePercent: isTop ? suggestion?.confidencePercent : undefined,
        modelVersion: suggestion?.modelVersion,
      });

      if (!result.success) {
        setDialog({
          icon: '⚠️',
          tone: 'danger',
          title: 'The name was not applied',
          message: result.error || 'The outlet kept its previous name. Please try again.',
        });
        return;
      }

      setExpandedSuggestion((current) => (current === number ? null : current));
      if (!result.learned) {
        setDialog({
          icon: '📝',
          tone: 'warning',
          title: 'Saved as a name only',
          message: result.learnError
            || 'The outlet is named, but its power signature was not learned yet. Keep the appliance running for a few seconds and confirm again.',
        });
      }
    } finally {
      setNamingOutlet(null);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        // The appliance-name field lives in the cards: let Save register on
        // the first tap instead of only dismissing the keyboard.
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          {/* Power safety at a glance in place of an "Outlets" title, which
              the raised tab already says (Oct 2026). Opens Power Safety. */}
          <SafetyStatusPill onPress={() => navigation.navigate('PowerSafety')} />
          <TouchableOpacity
            style={styles.scheduleButton}
            onPress={() => navigation.navigate('Schedule')}
            activeOpacity={0.8}
            accessibilityRole="button"
          >
            <Ionicons name="timer-outline" size={18} color={COLORS.primary} />
            <Text style={styles.scheduleText}>Timers</Text>
          </TouchableOpacity>
        </View>

        {/* Moved from Home when it was removed (Oct 2026). Not dismissible:
            the outlet is live and Dagitab cannot open it, so the auto-cutoff
            cannot protect it either, and only a physical fix ends it. */}
        {[
          { number: 1, stuck: outlet1RelayStuck, fresh: outlet1HasReading },
          { number: 2, stuck: outlet2RelayStuck, fresh: outlet2HasReading },
        ].filter((item) => item.stuck).map((item) => (
          <View key={`relay-stuck-${item.number}`} style={styles.relayFaultNotice}>
            <View style={styles.relayFaultHead}>
              <Ionicons name="warning" size={16} color={COLORS.error} />
              <Text style={styles.relayFaultTitle}>Outlet {item.number} is not switching off</Text>
            </View>
            <Text style={styles.relayFaultBody}>{describeRelayFault(item.fresh)}</Text>
          </View>
        ))}

        {outletsUnreachable ? (
          <OfflineState
            body="Your outlets are safe — the app just needs a connection to load them. Check your wi-fi or mobile data."
          />
        ) : hasNeverReported ? (
          <LinkHubCard onPress={() => navigation.navigate('Settings')} />
        ) : isLoadingOutlets ? (
          <ActivityIndicator style={styles.loading} size="large" color={COLORS.primary} />
        ) : (
          outlets.map((o) => (
            <OutletCard
              key={o.number}
              number={o.number}
              isOn={o.isOn}
              badge={o.badge}
              applianceLabel={o.applianceLabel}
              applianceMuted={o.applianceMuted}
              metrics={o.metrics}
              hasReading={o.hasReading}
              suggestion={o.suggestion}
              suggestionExpanded={expandedSuggestion === o.number}
              naming={namingOutlet === o.number}
              onToggleWhy={() => setExpandedSuggestion((c) => (c === o.number ? null : o.number))}
              onChoose={(name) => handleChooseAppliance(o.number, name)}
              onToggle={() => setControlModal({ visible: true, outlet: o.number })}
              disabled={isToggling}
            />
          ))
        )}
      </ScrollView>

      <OutletControlModal
        visible={controlModal.visible}
        onClose={() => setControlModal({ visible: false, outlet: null })}
        outletNumber={controlModal.outlet}
        outletName={`Outlet ${controlModal.outlet || ''}`}
        currentStatus={controlModal.outlet === 1 ? outlet1Status : outlet2Status}
        onConfirm={handleConfirmToggle}
        isLoading={isToggling}
      />

      {dialog ? (
        <AppDialog {...dialog} confirmLabel="Got it" onConfirm={() => setDialog(null)} />
      ) : null}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  scheduleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#ECF8EF',
  },
  scheduleText: {
    color: COLORS.primary,
    fontWeight: '600',
    fontSize: 14,
  },
  loading: {
    marginVertical: 60,
  },
  relayFaultNotice: {
    backgroundColor: COLORS.error + '12',
    borderWidth: 1,
    borderColor: COLORS.error + '40',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 4,
  },
  relayFaultHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 16,
    shadowColor: '#071B2C',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  cardOn: {
    borderColor: '#B4E5C2',
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  socket: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  socketOn: {
    backgroundColor: COLORS.primary,
  },
  cardTitleBlock: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  appliance: {
    marginTop: 2,
    fontSize: 14,
    color: COLORS.textDark,
  },
  applianceMuted: {
    color: COLORS.textLight,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    maxWidth: 130,
  },
  badgeDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 1,
  },
  metrics: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: COLORS.background,
    borderRadius: 16,
    paddingVertical: 14,
  },
  metric: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  metricHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metricLabel: {
    fontSize: 13,
    color: COLORS.textLight,
    fontWeight: '500',
  },
  metricValue: {
    fontSize: 30,
    fontWeight: '700',
    color: COLORS.text,
  },
  metricUnit: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textLight,
  },
  metricDivider: {
    width: 1,
    backgroundColor: COLORS.border,
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 50,
    borderRadius: 14,
  },
  toggleOn: {
    backgroundColor: COLORS.primary,
  },
  toggleOff: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  toggleText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.white,
  },
  toggleTextOff: {
    color: COLORS.error,
  },
});

export default OutletsScreen;
