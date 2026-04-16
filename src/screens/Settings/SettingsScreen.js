import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '../../constants/colors';
import SettingsRow from './components/SettingsRow';
import ElectricityRateModal from './components/ElectricityRateModal';
import OutletNameModal from './components/OutletNameModal';
import { useSettings } from './hooks/useSettings';
import { formatRate, formatVersion, formatCurrency } from './utils/settingsHelpers';
import { authService } from '../../services/firebase/authService';

const SectionHeader = ({ title }) => (
  <Text style={styles.sectionHeader}>{title}</Text>
);

const SectionCard = ({ children }) => (
  <View style={styles.sectionCard}>{children}</View>
);

const Separator = () => <View style={styles.separator} />;

const SettingsScreen = ({ navigation }) => {
  const [rateModalVisible, setRateModalVisible] = useState(false);
  const [outletModalState, setOutletModalState] = useState({
    visible: false,
    outletNumber: 1,
    currentName: 'Outlet 1',
  });

  const {
    settings,
    loading,
    error,
    updateElectricityRate,
    updateNotifications,
    updateOutletName,
  } = useSettings();

  const handleRatePress = useCallback(() => {
    setRateModalVisible(true);
  }, []);

  const handleRateClose = useCallback(() => {
    setRateModalVisible(false);
  }, []);

  const handleRateSave = useCallback(async (rate) => {
    const result = await updateElectricityRate(rate);

    if (!result.success) {
      Alert.alert('Unable to save rate', result.error || 'Please try again.');
      return result;
    }

    return { success: true };
  }, [updateElectricityRate]);

  const handleNotificationsToggle = useCallback(async (value) => {
    const result = await updateNotifications(value);

    if (!result.success) {
      Alert.alert('Unable to update notifications', result.error || 'Please try again.');
    }
  }, [updateNotifications]);

  const handleOutletNamePress = useCallback((outletNumber) => {
    const currentName = outletNumber === 1 ? settings.outlet1Name : settings.outlet2Name;
    setOutletModalState({
      visible: true,
      outletNumber,
      currentName,
    });
  }, [settings.outlet1Name, settings.outlet2Name]);

  const handleOutletModalClose = useCallback(() => {
    setOutletModalState((prev) => ({ ...prev, visible: false }));
  }, []);

  const handleOutletNameSave = useCallback(async (newName) => {
    const result = await updateOutletName(outletModalState.outletNumber, newName);

    if (!result.success) {
      Alert.alert('Unable to update outlet name', result.error || 'Please try again.');
      return result;
    }

    return { success: true };
  }, [outletModalState.outletNumber, updateOutletName]);

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

  const handleChangePassword = useCallback(async () => {
    const email = settings.email;
    if (!email) {
      Alert.alert('No account email', 'Please sign in again and try resetting your password.');
      return;
    }

    Alert.alert(
      'Reset Password',
      `Send a password reset link to ${email}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send Link',
          onPress: async () => {
            const result = await authService.resetPassword(email);
            if (!result.success) {
              Alert.alert('Unable to send reset email', result.error || 'Please try again.');
              return;
            }

            Alert.alert('Reset Email Sent', 'Check your inbox for the password reset link.');
          },
        },
      ]
    );
  }, [settings.email]);

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
            value={settings.profileName || 'User'}
          />
          <Separator />
          <SettingsRow
            icon="🔒"
            label="Change Password"
            showArrow
            onPress={handleChangePassword}
          />
          <Separator />
          <SettingsRow
            icon="📧"
            label="Email"
            value={settings.email || '--'}
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
            value={formatCurrency(settings.monthlyBudget, settings.currency)}
            showArrow
            onPress={() => navigation.navigate('BudgetTracking')}
          />
        </SectionCard>

        {/* Device Settings */}
        <SectionHeader title="Device Settings" />
        <SectionCard>
          {/* TODO: Connect to ESP32 when backend is ready */}
          <SettingsRow
            icon="📡"
            label="ESP32 Device"
            value="Integration in progress"
            showArrow
            onPress={handleESP32Settings}
          />
          <Separator />
          <SettingsRow
            icon="🔌"
            label="Outlet 1 Name"
            value={settings.outlet1Name}
            showArrow
            onPress={() => handleOutletNamePress(1)}
          />
          <Separator />
          <SettingsRow
            icon="🔌"
            label="Outlet 2 Name"
            value={settings.outlet2Name}
            showArrow
            onPress={() => handleOutletNamePress(2)}
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
          {loading ? <Text style={styles.footerSub}>Syncing settings...</Text> : null}
          {!loading && error ? <Text style={styles.errorText}>{error}</Text> : null}
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

      <OutletNameModal
        visible={outletModalState.visible}
        outletNumber={outletModalState.outletNumber}
        currentName={outletModalState.currentName}
        onClose={handleOutletModalClose}
        onSave={handleOutletNameSave}
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
  errorText: {
    fontSize: 12,
    color: '#EF4444',
    marginBottom: 4,
  },
});

export default SettingsScreen;