import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';
import SafetyStatusCard from './components/SafetyStatusCard';
import ThresholdCard from './components/ThresholdCard';
import ProtectionSettings from './components/ProtectionSettings';
import AlertHistoryList from './components/AlertHistoryList';
import { OfflineState } from '../../components/common/OfflineNotice';
import usePowerSafety from './hooks/usePowerSafety';
import { useOfflineRetry } from '../../hooks/useOfflineRetry';

// Compact since Oct 2026: current status, outlet status, protection settings
// and alert history only. The emergency-numbers card and the explanatory
// paragraphs were removed on request.
const PowerSafetyScreen = ({ navigation }) => {
  const {
    safetyStage,
    readingsAreStale,
    outlet1Status,
    outlet2Status,
    thresholds,
    protectionEnabled,
    settingsLoaded,
    alertHistory,
    showOfflineState,
    handleToggleProtection,
    handleSaveThresholds,
    handleRefresh,
  } = usePowerSafety();

  // Recovers on its own when the connection returns. This screen matters more
  // than most: until a read lands it cannot say what the user's limits are.
  useOfflineRetry(showOfflineState, handleRefresh);

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await handleRefresh();
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="arrow-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <View style={styles.headerTitles}>
          <Text style={styles.headerTitle}>Power Safety</Text>
          <Text style={styles.headerSub}>Limits and cut-off for your outlets</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[COLORS.primary]}
            tintColor={COLORS.primary}
          />
        }
      >
        {/* Nothing below here may be drawn from placeholder values. Both the
            limits and the alert history are claims about this account, and
            until a read returns, the hook is holding its own defaults - which
            on this screen would read as "your ceiling is 500 W" and "you have
            never had an alert". */}
        {showOfflineState ? (
          <View style={styles.section}>
            <OfflineState
              title="Can't reach your safety settings"
              body="Your limits and alert history live on your account, and the app needs a connection to read them. The Hub is unaffected — it enforces its limits on the device itself, with no connection involved."
              onRetry={onRefresh}
            />
          </View>
        ) : settingsLoaded ? (
          <>
            {/* Not drawn before the read: "Normal" from the hook's placeholder
                stage is a verdict nobody has read. */}
            <SafetyStatusCard stage={safetyStage} readingsAreStale={readingsAreStale} />

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Outlet status</Text>
              <View style={styles.stack}>
                <ThresholdCard
                  outletName="Outlet 1"
                  status={outlet1Status}
                  thresholds={thresholds}
                  isStale={readingsAreStale}
                />
                <ThresholdCard
                  outletName="Outlet 2"
                  status={outlet2Status}
                  thresholds={thresholds}
                  isStale={readingsAreStale}
                />
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Protection settings</Text>
              <ProtectionSettings
                enabled={protectionEnabled}
                onToggle={handleToggleProtection}
                thresholds={thresholds}
                onSaveThresholds={handleSaveThresholds}
              />
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Alert history</Text>
              <AlertHistoryList alerts={alertHistory} />
            </View>
          </>
        ) : (
          <View style={styles.section}>
            <View style={styles.pending}>
              <Text style={styles.pendingText}>Reading your safety settings…</Text>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  backButton: {
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
  scrollView: {
    flex: 1,
  },
  // Clears the Android navigation bar so the last card is fully reachable.
  scrollContent: {
    paddingBottom: 32,
  },
  section: {
    marginTop: 16,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 8,
  },
  stack: {
    gap: 8,
  },
  pending: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 28,
    alignItems: 'center',
  },
  pendingText: {
    fontSize: 13,
    color: COLORS.textLight,
  },
});

export default PowerSafetyScreen;
