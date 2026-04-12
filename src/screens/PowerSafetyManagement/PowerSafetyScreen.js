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
import usePowerSafety from './hooks/usePowerSafety';

const PowerSafetyScreen = ({ navigation }) => {
  const {
    safetyStage,
    outlet1Status,
    outlet2Status,
    thresholds,
    protectionEnabled,
    alertHistory,
    loading,
    handleToggleProtection,
    handleSaveThresholds,
    handleRefresh,
  } = usePowerSafety();

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await handleRefresh();
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Power Safety</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[COLORS.primary]}
            tintColor={COLORS.primary}
          />
        }
      >
        {/* Current Safety Stage */}
        <SafetyStatusCard stage={safetyStage} />

        {/* Outlet Status Cards */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Outlet Status</Text>
          <View style={styles.outletContainer}>
            <ThresholdCard
              outletName="Outlet 1"
              status={outlet1Status}
              thresholds={thresholds}
            />
            <ThresholdCard
              outletName="Outlet 2"
              status={outlet2Status}
              thresholds={thresholds}
            />
          </View>
        </View>

        {/* Protection Settings */}
        <ProtectionSettings
          enabled={protectionEnabled}
          onToggle={handleToggleProtection}
          thresholds={thresholds}
          onSaveThresholds={handleSaveThresholds}
        />

        {/* Alert History */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Alert History</Text>
          <AlertHistoryList alerts={alertHistory} />
        </View>

        {/* Info Footer */}
        <View style={styles.infoFooter}>
          <Ionicons name="information-circle" size={16} color={COLORS.textLight} />
          <Text style={styles.infoText}>
            Protection system monitors voltage, current, and power levels to ensure safe operation
          </Text>
        </View>
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
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
  },
  placeholder: {
    width: 32,
  },
  scrollView: {
    flex: 1,
  },
  section: {
    marginTop: 20,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 12,
  },
  outletContainer: {
    gap: 12,
  },
  infoFooter: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: COLORS.white,
    padding: 16,
    marginHorizontal: 20,
    marginVertical: 20,
    borderRadius: 12,
    gap: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: COLORS.textLight,
    lineHeight: 18,
  },
});

export default PowerSafetyScreen;