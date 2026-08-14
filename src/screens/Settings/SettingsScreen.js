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
import { useFocusEffect } from '@react-navigation/native';
import { COLORS } from '../../constants/colors';
import SettingsRow from './components/SettingsRow';
import SupplyRateModal from './components/SupplyRateModal';
import ESP32DeviceModal from './components/ESP32DeviceModal';
import DeviceQRScannerModal from './components/DeviceQRScannerModal';
import ProfileNameModal from './components/ProfileNameModal';
import OutletNameModal from './components/OutletNameModal';
import { useSettings } from './hooks/useSettings';
import {
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
  const [deviceModalVisible, setDeviceModalVisible] = useState(false);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [nameModalVisible, setNameModalVisible] = useState(false);
  // Which saved appliance is being renamed, or null. Holds the label rather than
  // a boolean so the modal knows what it is editing.
  const [renamingAppliance, setRenamingAppliance] = useState(null);
  const {
    settings,
    savedAppliances,
    loading,
    error,
    fetchSettings,
    updateSupplyRates,
    updateNotifications,
    updateDeviceSettings,
    clearDeviceSettings,
    removeSavedAppliance,
    renameSavedAppliance,
  } = useSettings();

  // Budget and rates are edited on other screens, so this screen reloads on
  // focus rather than only once at mount - returning from Budget Tracking used
  // to show the value from before the change.
  useFocusEffect(
    useCallback(() => {
      fetchSettings();
    }, [fetchSettings])
  );

  // Tapping a saved appliance offers both actions. Renaming used to mean
  // forgetting and re-teaching, which discards the measured run the signature
  // was built from - so the non-destructive option is offered first.
  const handleSavedAppliancePress = useCallback((label) => {
    Alert.alert(
      label,
      'Rename keeps the measured power signature. Forget deletes it, and detection falls back to the built-in appliance profiles.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Rename', onPress: () => setRenamingAppliance(label) },
        {
          text: 'Forget',
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

  const handleRenameSavedAppliance = useCallback(
    async (newName) => renameSavedAppliance(renamingAppliance, newName),
    [renameSavedAppliance, renamingAppliance]
  );

  // Shows the generation rate specifically, not the Block 1 sum - it is the
  // number printed on the bill, so the user can eyeball that it matches.
  const generationRateLabel = settings.supplyRates?.generation
    ? `₱${Number(settings.supplyRates.generation).toFixed(4)}/kWh`
    : 'Not set';

  const handleRatePress = useCallback(() => {
    setRateModalVisible(true);
  }, []);

  const handleRateClose = useCallback(() => {
    setRateModalVisible(false);
  }, []);

  const handleRateSave = useCallback(async (rates) => {
    const result = await updateSupplyRates(rates);

    if (!result.success) {
      Alert.alert('Unable to save rates', result.error || 'Please try again.');
      return result;
    }

    return { success: true };
  }, [updateSupplyRates]);

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

  const handleEditName = useCallback(() => {
    setNameModalVisible(true);
  }, []);

  const handleNameSave = useCallback(async (name) => {
    const result = await authService.updateDisplayName(name);
    if (!result.success) return result;

    // Pull the profile back so the row reflects the new name immediately.
    await fetchSettings();
    return { success: true };
  }, [fetchSettings]);

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
      [
        'WattWise is a smart energy monitoring system for apartment rooms, pairing an ESP32 with PZEM-004T meters to two switchable outlets.',
        '',
        'WHAT IT DOES',
        '• Live voltage, current and power per outlet',
        '• Remote on/off switching from anywhere',
        '• Automatic appliance detection from power signatures',
        '• Scheduled and countdown timers',
        '• Power safety monitoring with automatic cutoff',
        '• Monthly budget tracking with threshold alerts',
        '• Cost estimates and monthly statements',
        '',
        'BILLING',
        'All costs use the PELCO III residential tariff (Pampanga III Electric Cooperative). Distribution and government charges are ERC-approved constants; generation and transmission are entered by you each month from pelco3.org/rates.php.',
        '',
        'SAFETY LIMITS',
        `Low-voltage appliances only. Maximum ${500} W per outlet and ${1000} W combined. Not for air conditioners, heaters, irons, or motors.`,
        '',
        `Version ${formatVersion()}`,
      ].join('\n'),
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
            label="Profile Name"
            value={settings.profileName || 'User'}
            showArrow
            onPress={handleEditName}
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
          <View style={styles.tariffBanner}>
            <Text style={styles.tariffBannerTitle}>
              Billed on the PELCO III residential tariff
            </Text>
            <Text style={styles.tariffBannerBody}>
              Every peso figure in WattWise — dashboard, analytics and your monthly
              statement — is computed with PELCO III&apos;s published rate structure.
              Enter the generation rate from your bill so the estimate matches it.
            </Text>
          </View>
          <SettingsRow
            icon="⚡"
            label="Electricity Rates"
            value={settings.hasSupplyRates ? generationRateLabel : 'Not set'}
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
                  onPress={() => handleSavedAppliancePress(appliance.label)}
                />
              </React.Fragment>
            ))
          )}

          {/* Written as an instruction, and placed where the choice is being
              reconsidered rather than after it. The owner plugged in a ceiling
              fan, was offered LED Lamp, scanned for "Ceiling Fan", did not find
              it, and stopped to ask whether picking LED Lamp was allowed. It
              was - he did the right thing on instinct - but nothing on screen
              said so, and hesitating there is the difference between naming an
              appliance and abandoning the flow. */}
          <Separator />
          <View style={styles.namingGuidance}>
            <Text style={styles.namingGuidanceTitle}>Not seeing your appliance?</Text>
            <Text style={styles.namingGuidanceText}>
              These eight are the only names WattWise can guess from wattage alone.{' '}
              <Text style={styles.namingGuidanceStrong}>
                Pick whichever is closest, then rename it.
              </Text>{' '}
              The signature it saves is measured from your appliance, so the name
              it started from stops mattering — a 14 W ceiling fan will suggest
              LED Lamp, and once renamed it is a ceiling fan every time it comes
              back.
            </Text>
          </View>
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

      <ProfileNameModal
        visible={nameModalVisible}
        currentName={settings.profileName}
        onClose={() => setNameModalVisible(false)}
        onSave={handleNameSave}
      />

      {/* PELCO III Block 1 rate editor */}
      <SupplyRateModal
        visible={rateModalVisible}
        currentRates={settings.supplyRates}
        onClose={handleRateClose}
        onSave={handleRateSave}
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

      {/* Rename a learned signature, keeping its measurements. */}
      <OutletNameModal
        visible={renamingAppliance !== null}
        currentName={renamingAppliance || ''}
        title="Rename Appliance"
        subtitle="The learned power signature is kept, and any outlet using this name is renamed with it."
        placeholder="Appliance name"
        fieldLabel="Appliance name"
        onClose={() => setRenamingAppliance(null)}
        onSave={handleRenameSavedAppliance}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  tariffBanner: {
    backgroundColor: COLORS.background,
    borderRadius: 10,
    padding: 14,
    marginBottom: 4,
  },
  tariffBannerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primary,
    marginBottom: 4,
  },
  tariffBannerBody: {
    fontSize: 12,
    color: COLORS.textLight,
    lineHeight: 17,
  },
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
  namingGuidance: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  namingGuidanceTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textDark,
    marginBottom: 4,
  },
  namingGuidanceText: {
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.textLight,
  },
  namingGuidanceStrong: {
    fontWeight: '700',
    color: COLORS.textDark,
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