import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '../../constants/colors';
import SettingsRow from './components/SettingsRow';
import ElectricityRateModal from './components/ElectricityRateModal';
import { useSettings } from './hooks/useSettings';
import { formatRate, formatVersion } from './utils/settingsHelpers';
import { authService } from '../../services/firebase/authService';

const SectionHeader = ({ title }) => (
  <Text style={styles.sectionHeader}>{title}</Text>
);

const SectionCard = ({ children }) => (
  <View style={styles.sectionCard}>{children}</View>
);

const Separator = () => <View style={styles.separator} />;

const SettingsScreen = () => {
  const { width } = useWindowDimensions();
  const [rateModalVisible, setRateModalVisible] = useState(false);

  const {
    settings,
    updateElectricityRate,
    updateNotifications,
  } = useSettings();

  const handleRatePress = useCallback(() => {
    setRateModalVisible(true);
  }, []);

  const handleRateClose = useCallback(() => {
    setRateModalVisible(false);
  }, []);

  const handleRateSave = useCallback((rate) => {
    updateElectricityRate(rate);
    // TODO: Save to Firebase when backend is ready
  }, [updateElectricityRate]);

  const handleNotificationsToggle = useCallback((value) => {
    updateNotifications(value);
    // TODO: Save to Firebase when backend is ready
  }, [updateNotifications]);

  const handleLogout = useCallback(() => {
  Alert.alert(
    'Logout',
    'Are you sure you want to logout?',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          try {
            await authService.logout();
          } catch (err) {
            Alert.alert('Error', 'Failed to logout. Please try again.');
          }
        },
      },
    ]
  );
}, []);

  const handleAbout = useCallback(() => {
    Alert.alert(
      'About WattWise',
      'WattWise is a smart energy monitoring app for apartment rooms.\n\nVersion: 1.0.0',
      [{ text: 'OK' }]
    );
  }, []);

  const handleHelp = useCallback(() => {
    // TODO: Navigate to help screen or open URL
    Alert.alert('Help', 'Help center coming soon.');
  }, []);

  const handlePrivacy = useCallback(() => {
    // TODO: Navigate to privacy policy
    Alert.alert('Privacy Policy', 'Privacy policy coming soon.');
  }, []);

  const handleESP32Settings = useCallback(() => {
    // TODO: Navigate to ESP32 device settings when backend is ready
    Alert.alert('Device Settings', 'ESP32 device configuration coming soon.');
  }, []);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
        <Text style={styles.headerSub}>Manage your preferences</Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Account Section */}
        <SectionHeader title="Account" />
        <SectionCard>
          <SettingsRow
            icon="👤"
            label="Profile"
            showArrow
            onPress={() => Alert.alert('Profile', 'Profile settings coming soon.')}
          />
          <Separator />
          <SettingsRow
            icon="🔒"
            label="Change Password"
            showArrow
            onPress={() => Alert.alert('Password', 'Change password coming soon.')}
          />
          <Separator />
          <SettingsRow
            icon="📧"
            label="Email"
            value="--"
            showArrow
            onPress={() => Alert.alert('Email', 'Email settings coming soon.')}
          />
        </SectionCard>

        {/* Energy Settings */}
        <SectionHeader title="Energy Settings" />
        <SectionCard>
          <SettingsRow
            icon="⚡"
            label="Electricity Rate"
            value={formatRate(settings.electricityRate)}
            showArrow
            onPress={handleRatePress}
          />
          <Separator />
          {/* TODO: Budget settings will connect to BudgetTracking screen */}
          <SettingsRow
            icon="💰"
            label="Monthly Budget"
            value="₱0.00"
            showArrow
            onPress={() => Alert.alert('Budget', 'Budget settings coming soon.')}
          />
        </SectionCard>

        {/* Device Settings */}
        <SectionHeader title="Device Settings" />
        <SectionCard>
          {/* TODO: Connect to ESP32 when backend is ready */}
          <SettingsRow
            icon="📡"
            label="ESP32 Device"
            value="Not connected"
            showArrow
            onPress={handleESP32Settings}
          />
          <Separator />
          <SettingsRow
            icon="🔌"
            label="Outlet 1 Name"
            value="Outlet 1"
            showArrow
            onPress={() => Alert.alert('Outlet 1', 'Outlet name settings coming soon.')}
          />
          <Separator />
          <SettingsRow
            icon="🔌"
            label="Outlet 2 Name"
            value="Outlet 2"
            showArrow
            onPress={() => Alert.alert('Outlet 2', 'Outlet name settings coming soon.')}
          />
        </SectionCard>

        {/* Preferences */}
        <SectionHeader title="Preferences" />
        <SectionCard>
          <SettingsRow
            icon="🔔"
            label="Notifications"
            isSwitch
            switchValue={settings.notifications}
            onSwitchChange={handleNotificationsToggle}
          />
          <Separator />
          <SettingsRow
            icon="🌙"
            label="Dark Mode"
            value="Coming Soon"
            disabled
          />
        </SectionCard>

        {/* About */}
        <SectionHeader title="About" />
        <SectionCard>
          <SettingsRow
            icon="ℹ️"
            label="About WattWise"
            showArrow
            onPress={handleAbout}
          />
          <Separator />
          <SettingsRow
            icon="❓"
            label="Help Center"
            showArrow
            onPress={handleHelp}
          />
          <Separator />
          <SettingsRow
            icon="📄"
            label="Privacy Policy"
            showArrow
            onPress={handlePrivacy}
          />
          <Separator />
          <SettingsRow
            icon="🏷️"
            label="Version"
            value={formatVersion()}
          />
        </SectionCard>

        {/* Logout */}
        <SectionHeader title="" />
        <SectionCard>
          <SettingsRow
            icon="🚪"
            label="Logout"
            isDestructive
            onPress={handleLogout}
          />
        </SectionCard>

        <View style={styles.footer}>
          <Text style={styles.footerText}>WattWise {formatVersion()}</Text>
          <Text style={styles.footerSub}>Smart Energy Monitoring</Text>
        </View>
      </ScrollView>

      {/* Electricity Rate Modal */}
      <ElectricityRateModal
        visible={rateModalVisible}
        currentRate={settings.electricityRate}
        onClose={handleRateClose}
        onSave={handleRateSave}
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textLight,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
  },
  sectionCard: {
    backgroundColor: COLORS.white,
    marginHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  separator: {
    height: 1,
    backgroundColor: COLORS.border,
    marginLeft: 66,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  footerText: {
    fontSize: 13,
    color: COLORS.textLight,
    fontWeight: '500',
  },
  footerSub: {
    fontSize: 12,
    color: COLORS.textLight,
    marginTop: 4,
  },
});

export default SettingsScreen;