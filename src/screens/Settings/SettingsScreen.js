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
import RatePlanModal from './components/RatePlanModal';
import ESP32DeviceModal from './components/ESP32DeviceModal';
import DeviceQRScannerModal from './components/DeviceQRScannerModal';
import { useSettings } from './hooks/useSettings';
import { RATE_PROFILES } from '../../utils/billing';
import {
  formatRate,
  formatVersion,
  formatCurrency,
  formatDeviceHealthValue,
} from './utils/settingsHelpers';
import { authService } from '../../services/firebase/authService';

const SectionHeader = ({ title }) => (
  <Text style={styles.sectionHeader}>{title}</Text>
);

const SectionCard = ({ children }) => (
  <View style={styles.sectionCard}>{children}</View>
);

const Separator = () => <View style={styles.separator} />;

// Short "how it was learned" summary shown next to each saved appliance.
const formatApplianceSignature = (appliance) => {
  const meanPower = Number(appliance?.meanPower) || 0;
  return meanPower > 0 ? `~${meanPower.toFixed(1)} W` : 'Learned';
};

const SettingsScreen = ({ navigation }) => {
  const [rateModalVisible, setRateModalVisible] = useState(false);
  const [ratePlanModalVisible, setRatePlanModalVisible] = useState(false);
  const [deviceModalVisible, setDeviceModalVisible] = useState(false);
  const [scannerVisible, setScannerVisible] = useState(false);
  const {
    settings,
    savedAppliances,
    loading,
    error,
    updateElectricityRate,
    updateRateProfile,
    updateNotifications,
    updateDeviceSettings,
    clearDeviceSettings,
    removeSavedAppliance,
  } = useSettings();

  const handleRemoveSavedAppliance = useCallback((label) => {
    Alert.alert(
      'Remove Saved Appliance',
      `Forget the learned power signature for "${label}"? Detection will fall back to the built-in appliance profiles.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const result = await removeSavedAppliance(label);
            if (!result.success) {
              Alert.alert('Remove Failed', result.error || 'Unable to remove saved appliance.');
            }
          },
        },
      ]
    );
  }, [removeSavedAppliance]);

  const rateProfileOptions = Array.isArray(RATE_PROFILES) ? RATE_PROFILES : [];
  const currentRateProfile = rateProfileOptions.find(
    (profile) => profile.id === settings.rateProfileId
  );
  const ratePlanLabel = settings.rateProfileId
    ? (currentRateProfile?.name || 'Custom rate plan')
    : 'Auto (by date)';

  const handleRatePress = useCallback(() => {
    setRateModalVisible(true);
  }, []);

  const handleRateClose = useCallback(() => {
    setRateModalVisible(false);
  }, []);

  const handleRatePlanPress = useCallback(() => {
    setRatePlanModalVisible(true);
  }, []);

  const handleRatePlanClose = useCallback(() => {
    setRatePlanModalVisible(false);
  }, []);

  const handleRateSave = useCallback(async (rate) => {
    const result = await updateElectricityRate(rate);

    if (!result.success) {
      Alert.alert('Unable to save rate', result.error || 'Please try again.');
      return result;
    }

    return { success: true };
  }, [updateElectricityRate]);

  const handleRatePlanSave = useCallback(async (profileId) => {
    const result = await updateRateProfile(profileId);

    if (!result.success) {
      Alert.alert('Unable to save rate plan', result.error || 'Please try again.');
      return result;
    }

    return { success: true };
  }, [updateRateProfile]);

  const handleNotificationsToggle = useCallback(async (value) => {
    const result = await updateNotifications(value);

    if (!result.success) {
      Alert.alert('Unable to update notifications', result.error || 'Please try again.');
    }
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
    setDeviceModalVisible(true);
  }, []);

  const handleDeviceModalClose = useCallback(() => {
    setDeviceModalVisible(false);
  }, []);

  const handleDeviceSave = useCallback(async (deviceData) => {
    const result = await updateDeviceSettings(deviceData);
    if (!result.success) {
      Alert.alert('Unable to save device settings', result.error || 'Please try again.');
      return result;
    }

    return { success: true };
  }, [updateDeviceSettings]);

  const handleDeviceUnlink = useCallback(() => {
    if (!settings.esp32Linked) {
      Alert.alert('No Linked Device', 'There is no device linked to this account.');
      return;
    }

    Alert.alert(
      'Remove Device',
      `Remove ${settings.esp32DeviceId} from this account? Telemetry and commands from this hardware will be rejected until you link it again by scanning its QR code.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const result = await clearDeviceSettings();
            if (!result.success) {
              Alert.alert('Unable to remove device', result.error || 'Please try again.');
            }
          },
        },
      ]
    );
  }, [clearDeviceSettings, settings.esp32DeviceId, settings.esp32Linked]);

  const handleScanDeviceQR = useCallback(() => {
    setScannerVisible(true);
  }, []);

  const handleScannerClose = useCallback(() => {
    setScannerVisible(false);
  }, []);

  // Scanned pairing reuses the manual-entry save path, so both routes produce
  // identical device state.
  const handleDeviceScanned = useCallback(async (deviceData) => {
    const result = await updateDeviceSettings(deviceData);
    if (result.success) {
      Alert.alert('Device Linked', `${deviceData.deviceId} is now linked to your account.`);
    }
    return result;
  }, [updateDeviceSettings]);

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
          <SettingsRow
            icon="🧾"
            label="Rate Plan"
            value={ratePlanLabel}
            showArrow
            onPress={handleRatePlanPress}
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

        {/* Device */}
        <SectionHeader title="Device" />
        <SectionCard>
          {/* Pairing is a single action: scan the QR on the unit. Scanning
              again simply re-pairs, which is why there is no unlink step. */}
          <SettingsRow
            icon="📷"
            label={settings.esp32Linked ? 'Scan to re-link device' : 'Scan device QR'}
            value={settings.esp32Linked ? settings.esp32DeviceId : 'Not linked'}
            showArrow
            onPress={handleScanDeviceQR}
          />
          <Separator />
          <SettingsRow
            icon="🩺"
            label="Device Status"
            value={formatDeviceHealthValue(settings.esp32HealthStatus, settings.esp32LastSeenAtMs)}
          />
          <Separator />
          <SettingsRow
            icon="⌨️"
            label="Enter details manually"
            showArrow
            onPress={handleESP32Settings}
          />
          <Separator />
          <SettingsRow
            icon="🗑️"
            label="Remove Device"
            value={settings.esp32Linked ? settings.esp32DeviceId : 'Nothing linked'}
            isDestructive
            showArrow
            onPress={handleDeviceUnlink}
            disabled={!settings.esp32Linked}
          />
        </SectionCard>

        {/* Saved Appliances */}
        <SectionHeader title="Saved Appliances" />
        <SectionCard>
          {savedAppliances.length === 0 ? (
            <View style={styles.emptyAppliances}>
              <Text style={styles.emptyAppliancesText}>
                No saved appliances yet. Confirm an appliance name on the Dashboard
                while it is running and WattWise will learn its power signature.
              </Text>
            </View>
          ) : (
            savedAppliances.map((appliance, index) => (
              <React.Fragment key={appliance.label}>
                {index > 0 && <Separator />}
                <SettingsRow
                  icon="🔖"
                  label={appliance.label}
                  value={formatApplianceSignature(appliance)}
                  showArrow
                  onPress={() => handleRemoveSavedAppliance(appliance.label)}
                />
              </React.Fragment>
            ))
          )}
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

      <RatePlanModal
        visible={ratePlanModalVisible}
        currentProfileId={settings.rateProfileId}
        profiles={rateProfileOptions}
        onClose={handleRatePlanClose}
        onSave={handleRatePlanSave}
      />

      <ESP32DeviceModal
        visible={deviceModalVisible}
        currentDeviceId={settings.esp32DeviceId}
        currentDeviceToken={settings.esp32DeviceToken}
        onClose={handleDeviceModalClose}
        onSave={handleDeviceSave}
      />

      <DeviceQRScannerModal
        visible={scannerVisible}
        onClose={handleScannerClose}
        onScanned={handleDeviceScanned}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  emptyAppliances: {
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  emptyAppliancesText: {
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.textLight,
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