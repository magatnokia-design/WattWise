import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS } from '../../constants/colors';
import AppDialog from '../../components/common/AppDialog';
import { OfflineState } from '../../components/common/OfflineNotice';
import SettingsRow from './components/SettingsRow';
import SupplyRateModal from './components/SupplyRateModal';
import StatementsModal from './components/StatementsModal';
import ESP32DeviceModal from './components/ESP32DeviceModal';
import DeviceQRScannerModal from './components/DeviceQRScannerModal';
import ProfileNameModal from './components/ProfileNameModal';
import OutletNameModal from './components/OutletNameModal';
import DeleteAccountModal from './components/DeleteAccountModal';
import SecurityActivityModal from './components/SecurityActivityModal';
import HubStatusCard from './components/HubStatusCard';
import { Wordmark } from '../../components/common/Wordmark';
import NotificationPanel from '../Notifications/components/NotificationPanel';
import { useNotifications } from '../Notifications/hooks/useNotifications';
import { useAuth } from '../../hooks/useAuth';
import { securityService } from '../../services/firebase/securityService';
import { summariseSecurityEvents } from '../../utils/securityActivity';
import { useSettings } from './hooks/useSettings';
import { formatVersion } from './utils/settingsHelpers';
import { applianceIcon } from './utils/applianceIcon';
import { authService, hasPasswordSignIn } from '../../services/firebase/authService';

const SectionHeader = ({ title }) => (
  <Text style={styles.sectionHeader}>{title}</Text>
);

const SectionCard = ({ children }) => (
  <View style={styles.sectionCard}>{children}</View>
);

const Separator = () => <View style={styles.separator} />;

// The power each saved appliance was learned at, in whole watts as on the web.
const formatApplianceSignature = (appliance) => {
  const meanPower = Number(appliance?.meanPower) || 0;
  return meanPower > 0 ? `~${meanPower.toFixed(0)} W` : 'Learned';
};

const SettingsScreen = ({ navigation }) => {
  const [rateModalVisible, setRateModalVisible] = useState(false);
  const [statementsVisible, setStatementsVisible] = useState(false);
  const [deviceModalVisible, setDeviceModalVisible] = useState(false);
  const [scannerVisible, setScannerVisible] = useState(false);
  // One dialog at a time, held as its own props. A second setDialog replaces the
  // first, which is how "Send link" hands straight over to "Check your inbox"
  // without a frame where neither is on screen.
  const [dialog, setDialog] = useState(null);
  const [nameModalVisible, setNameModalVisible] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [securityModalVisible, setSecurityModalVisible] = useState(false);
  const [securityEvents, setSecurityEvents] = useState([]);
  // The notification bell lives here since Home was removed (Oct 2026).
  const [notificationVisible, setNotificationVisible] = useState(false);
  const { unreadCount } = useNotifications();
  const { user } = useAuth();

  /*
   * Fetched on focus rather than subscribed, because this only feeds the one
   * summary line on the row. The modal opens its own live listener - a
   * permanent one here would keep a read open on a screen most people leave
   * immediately, to keep a sentence current that nobody is looking at.
   */
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      if (!user?.uid) return undefined;

      securityService
        .getSecurityEvents(user.uid)
        .then((events) => {
          if (!cancelled) setSecurityEvents(events);
        })
        .catch(() => {
          // The row falls back to "Nothing to report"; a failure to summarise
          // must not stop the rest of Settings rendering.
        });

      return () => { cancelled = true; };
    }, [user?.uid])
  );
  // Which saved appliance is being renamed, or null. Holds the label rather than
  // a boolean so the modal knows what it is editing.
  const [renamingAppliance, setRenamingAppliance] = useState(null);
  // Sign-out is not instant - it clears this device's push token first - so the
  // row reports that it is working rather than appearing to have ignored the tap.
  const [isSigningOut, setIsSigningOut] = useState(false);
  const {
    settings,
    savedAppliances,
    loading,
    error,
    showOfflineState,
    fetchSettings,
    updateSupplyRates,
    switchToAutomaticRates,
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
  // The row's delete button (Oct 2026: rename and delete are icon buttons on the
  // row, as on the web, instead of one dialog offering both). Still confirmed.
  const handleForgetSavedAppliance = useCallback((label) => {
    const forget = async () => {
      setDialog(null);
      const result = await removeSavedAppliance(label);
      if (!result.success) {
        setDialog({
          icon: '⚠️',
          tone: 'danger',
          title: 'Could not forget it',
          message: result.error || 'The saved appliance is still there. Please try again.',
        });
      }
    };

    setDialog({
      icon: '🗑️',
      tone: 'danger',
      title: `Forget ${label}?`,
      message: `Dagitab forgets how ${label} draws power, and any outlet named ${label} goes back to unnamed - so the next time it runs, Dagitab suggests a name again.`,
      confirmLabel: 'Forget',
      cancelLabel: 'Keep',
      onConfirm: forget,
    });
  }, [removeSavedAppliance]);

  const handleRenameSavedAppliance = useCallback(
    async (newName) => renameSavedAppliance(renamingAppliance, newName),
    [renameSavedAppliance, renamingAppliance]
  );

  // Shows the generation rate specifically, not the Block 1 sum - it is the
  // number printed on the bill, so the user can eyeball that it matches.
  // An account that never saved rates reads ₱0.0000, not the built-in
  // default dressed up as the user's own figure.
  const ratesSet = Boolean(settings.hasSupplyRates && Number(settings.supplyRates?.generation) > 0);
  const generationRate = ratesSet ? Number(settings.supplyRates.generation) : 0;
  // Automatic (the default since Oct 2026): PELCO III's posted rate, kept
  // current by applyPelcoRates. Manual: the user typed their own.
  const ratesAutomatic = settings.rateMode !== 'manual';
  const RATE_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const rateMonth = /^d{4}-d{2}$/.test(String(settings.ratesSourceMonth || ''))
    ? `${RATE_MONTHS[Number(settings.ratesSourceMonth.slice(5)) - 1]} ${settings.ratesSourceMonth.slice(0, 4)}`
    : null;

  const handleRatePress = useCallback(() => {
    setRateModalVisible(true);
  }, []);

  const handleRateClose = useCallback(() => {
    setRateModalVisible(false);
  }, []);

  const handleRateSave = useCallback(async (rates) => {
    const result = await updateSupplyRates(rates);

    // No dialog on failure: SupplyRateModal stays open and prints the reason
    // under the fields the user has to correct. An alert on top of that said the
    // same thing twice and covered the form while doing it.
    if (!result.success) {
      return result;
    }

    return { success: true };
  }, [updateSupplyRates]);

  /*
   * Two separate switches, and confusing them is the obvious trap.
   *
   * This one is Dagitab's own preference: it lives on the account and decides
   * whether the backend sends anything at all (handlePushNotifications reads
   * `notificationsEnabled` before dispatching). Android's per-app notification
   * permission is the other one, and it decides whether the phone is allowed to
   * display what was sent. No app can change that from code - only the user, in
   * OS settings.
   *
   * So turning this on while Android's is off produces the silent failure worth
   * catching here: the account is willing to send, the phone will not show. The
   * toggle still saves - the preference is genuinely on - and the dialog offers
   * the one route to fixing the other half.
   */
  const handleNotificationsToggle = useCallback(async (value) => {
    const result = await updateNotifications(value);

    if (!result.success) {
      setDialog({
        icon: '⚠️',
        title: 'Could not save that',
        message: result.error || 'Something went wrong. Please try again.',
        tone: 'danger',
      });
      return;
    }

    if (!value) return;

    const permission = await Notifications.getPermissionsAsync().catch(() => null);
    if (!permission || permission.granted) return;

    setDialog({
      icon: '🔔',
      title: 'Android is blocking these',
      message:
        'Dagitab will send safety shut-offs, budget alerts and device events to this account. Android is set to hide notifications from this app, so they will not appear on your phone until you allow them.',
      tone: 'warning',
      confirmLabel: 'Open settings',
      cancelLabel: 'Not now',
      onConfirm: () => {
        setDialog(null);
        Linking.openSettings().catch(() => {});
      },
    });
  }, [updateNotifications]);

  const handleLogout = useCallback(() => {
    setDialog({
      icon: '🚪',
      title: 'Sign out?',
      // Says what actually changes. "Are you sure you want to logout?" asked the
      // user to confirm a decision without telling them its consequence.
      message: 'Your outlets keep running and keep recording. You will need to sign in again to control them.',
      tone: 'danger',
      confirmLabel: 'Sign out',
      cancelLabel: 'Stay',
      onConfirm: async () => {
        setDialog(null);
        // Signing out unregisters this phone's push token first, which is a
        // round trip to Firestore. The dialog closes immediately, so without
        // this the user was returned to an unchanged Settings screen for a
        // second or more with nothing to show the tap had registered - and
        // nothing stopping them tapping again.
        setIsSigningOut(true);
        try {
          const result = await authService.logout();
          // `logout` reports failure by returning, not by throwing, so the
          // catch below never saw one: a failed sign-out silently did nothing
          // at all. This is the branch that actually fires.
          if (!result?.success) {
            setIsSigningOut(false);
            setDialog({
              icon: '⚠️',
              title: 'Could not sign out',
              message: 'Something went wrong. Check your connection and try again.',
              tone: 'danger',
            });
          }
          // On success the auth listener unmounts this screen, so the flag is
          // deliberately left set - clearing it would flash the row back to
          // normal on the way out.
        } catch (err) {
          setIsSigningOut(false);
          setDialog({
            icon: '⚠️',
            title: 'Could not sign out',
            message: 'Something went wrong. Check your connection and try again.',
            tone: 'danger',
          });
        }
      },
    });
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
      setDialog({
        icon: '⚠️',
        title: 'No account email',
        message: 'Please sign in again, then try resetting your password.',
        tone: 'warning',
      });
      return;
    }

    setDialog({
      icon: '🔑',
      title: 'Reset your password',
      message: `We will email a reset link to ${email}. The link works once and expires after an hour.`,
      confirmLabel: 'Send link',
      cancelLabel: 'Cancel',
      onConfirm: async () => {
        const result = await authService.resetPassword(email);

        setDialog(
          result.success
            ? {
              icon: '📧',
              title: 'Check your inbox',
              message: `We sent a reset link to ${email}. If it is not there in a minute, look in spam.`,
            }
            : {
              icon: '⚠️',
              title: 'Could not send the email',
              message: result.error || 'Something went wrong. Please try again.',
              tone: 'danger',
            }
        );
      },
    });
  }, [settings.email]);

  // Was an Alert. The safety limits are the most important text in the app and
  // they sat at the bottom of a dialog body, which is the first thing a small
  // screen cuts off.
  const handleAbout = useCallback(() => {
    navigation.navigate('Document', { document: 'about' });
  }, [navigation]);

  const handleHelp = useCallback(() => {
    navigation.navigate('HelpCenter');
  }, [navigation]);

  const handleSupport = useCallback(() => {
    Linking.openURL('mailto:support@dagitab.site?subject=Dagitab%20help').catch(() => {
      setDialog({
        icon: '✉️',
        title: 'Email support@dagitab.site',
        message: 'No mail app opened on this phone. Write to support@dagitab.site from any email and we will reply there.',
      });
    });
  }, []);

  const handlePrivacy = useCallback(() => {
    navigation.navigate('Document', { document: 'privacy' });
  }, [navigation]);

  // The account is gone by the time this resolves, so there is nothing to
  // navigate to - the auth listener drops the app back to sign-in on its own.
  const handleDeleteAccount = useCallback(async (password) => {
    const result = await authService.deleteAccount(password);

    if (result.success) {
      setDeleteModalVisible(false);
    }

    return result;
  }, []);

  const handleESP32Settings = useCallback(() => {
    setDeviceModalVisible(true);
  }, []);

  const handleDeviceModalClose = useCallback(() => {
    setDeviceModalVisible(false);
  }, []);

  const handleDeviceSave = useCallback(async (deviceData) => {
    const result = await updateDeviceSettings(deviceData);

    // Same reasoning as the rates above - ESP32DeviceModal renders the error
    // inline beside the field that caused it.
    if (!result.success) {
      return result;
    }

    return { success: true };
  }, [updateDeviceSettings]);

  const handleDeviceUnlink = useCallback(() => {
    if (!settings.esp32Linked) {
      setDialog({
        icon: '📡',
        title: 'No device linked',
        message: 'There is no Hub linked to this account yet. Scan its QR code to pair one.',
      });
      return;
    }

    setDialog({
      icon: '🗑️',
      tone: 'danger',
      title: 'Remove this Hub?',
      message: `${settings.esp32DeviceId} stops reporting to this account until it is scanned again. To move it to another account, just scan it there - it does not need removing first.`,
      confirmLabel: 'Remove',
      cancelLabel: 'Keep',
      onConfirm: async () => {
        setDialog(null);
        const result = await clearDeviceSettings();
        if (!result.success) {
          setDialog({
            icon: '⚠️',
            tone: 'danger',
            title: 'Could not remove the device',
            message: result.error || 'It is still linked to this account. Please try again.',
          });
        }
      },
    });
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
    // Re-scanning the Hub this account already has changes nothing - and was
    // what people tried when it showed Offline, which is a power or Wi-Fi
    // matter (Oct 2026: four re-pairs in one afternoon, none needed). The save
    // still runs, so a new token on the same Hub is still picked up.
    const alreadyLinked = settings.esp32Linked && settings.esp32DeviceId === deviceData.deviceId;
    const result = await updateDeviceSettings(deviceData);

    if (result.success) {
      // Deferred past the scanner's slide-out. The scanner closes itself the
      // moment this returns, and a Modal mounted in the same frame as another
      // Modal's dismissal can end up behind it - so the confirmation waits for a
      // settled screen. `Alert.alert` did not need this; it was a native dialog
      // outside React's view hierarchy.
      setTimeout(() => {
        setDialog(alreadyLinked ? {
          icon: '✅',
          title: 'Already linked',
          message: `${deviceData.deviceId} was already linked to this account - one scan is all it ever needs. If it shows Offline, check that it has power and Wi-Fi.`,
          confirmLabel: 'Done',
        } : {
          icon: '✅',
          title: 'Hub linked',
          message: `${deviceData.deviceId} is now linked to your account. Readings appear on the Outlets tab within a few seconds. You will not need to scan it again.`,
          confirmLabel: 'Done',
        });
      }, 400);
    }

    return result;
  }, [updateDeviceSettings, settings.esp32Linked, settings.esp32DeviceId]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* The Dagitab logo and the notification bell, laid out as the old Home
          header was - both moved here when Home was removed (Oct 2026). */}
      <View style={styles.header}>
        <Wordmark height={30} />
        <TouchableOpacity
          style={styles.bellButton}
          onPress={() => setNotificationVisible(true)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        >
          <Ionicons name="notifications-outline" size={21} color={COLORS.text} />
          {unreadCount > 0 ? (
            <View style={styles.bellBadge}>
              <Text style={styles.bellBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
            </View>
          ) : null}
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Account - compact (Oct 2026): who is signed in, in one block, then
            the account actions. */}
        <SectionHeader title="Account" />
        <SectionCard>
          <TouchableOpacity
            style={styles.profile}
            onPress={handleEditName}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Edit profile name"
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {(settings.profileName || settings.email || 'U').trim().charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.profileText}>
              <Text style={styles.profileName} numberOfLines={1}>{settings.profileName || 'User'}</Text>
              <Text style={styles.profileEmail} numberOfLines={1}>{settings.email || '--'}</Text>
            </View>
            <Ionicons name="create-outline" size={18} color={COLORS.primary} />
          </TouchableOpacity>
          {/* A Google account has no password here to change - the reset email
              would set up a second sign-in method rather than change one. */}
          {hasPasswordSignIn(user) ? (
            <>
              <Separator />
              <SettingsRow
                icon="key-outline"
                label="Change password"
                showArrow
                onPress={handleChangePassword}
              />
            </>
          ) : null}
          <Separator />
          {/* The only destructive account row. The modal itemises what goes
              before offering any way forward. */}
          <SettingsRow
            icon="person-remove-outline"
            label="Delete account"
            isDestructive
            showArrow
            onPress={() => setDeleteModalVisible(true)}
          />
        </SectionCard>

        {/* Energy - the rate and the statements. Monthly Budget left this
            section (Oct 2026): Budget is a tab of its own now. */}
        <SectionHeader title="Energy" />
        <SectionCard>
          <TouchableOpacity
            style={styles.rateTile}
            onPress={handleRatePress}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Electricity rate"
          >
            <View style={styles.rateIcon}>
              <Ionicons name="flash" size={18} color={COLORS.white} />
            </View>
            <View style={styles.rateText}>
              <Text style={styles.rateLabel}>Electricity rate</Text>
              <Text style={[styles.rateValue, !ratesSet && styles.rateValueUnset]}>
                ₱{generationRate.toFixed(4)}
                <Text style={styles.rateUnit}> /kWh</Text>
              </Text>
              <Text style={styles.rateSub}>
                {ratesAutomatic
                  ? (ratesSet && rateMonth ? `Automatic · PELCO III ${rateMonth}` : 'Automatic · updating from PELCO III')
                  : 'Your own rate'}
              </Text>
            </View>
            <View style={styles.ratePill}>
              <Text style={styles.ratePillText}>{ratesAutomatic ? 'Auto' : 'Edit'}</Text>
            </View>
          </TouchableOpacity>
          <Separator />
          {/* The only route to finalizeInvoice. A statement is emailed as an
              estimate because PELCO III publishes the month's generation rate
              only after the period closes. */}
          <SettingsRow
            icon="document-text-outline"
            label="Monthly statements"
            value="View"
            showArrow
            onPress={() => setStatementsVisible(true)}
          />
        </SectionCard>

        {/* Dagitab Hub - compact (Oct 2026): the status heads the same card as
            the actions. Replaced by the offline notice while unreadable: with
            nothing read it would say "Not linked", a definite answer to a
            question that was never asked. */}
        <SectionHeader title="Dagitab Hub" />
        {showOfflineState ? (
          <OfflineState
            compact
            title="Can't check your Hub"
            body={
              'Your Hub and its settings are safe — the app just needs a ' +
              'connection to read them. Check your wi-fi or mobile data.'
            }
            onRetry={fetchSettings}
          />
        ) : null}
        <SectionCard>
          {!showOfflineState ? (
            <>
              <HubStatusCard settings={settings} />
              <Separator />
            </>
          ) : null}
          {/* Pairing is a single action: scan the QR on the unit. Scanning
              again simply re-pairs. */}
          <SettingsRow
            icon="qr-code-outline"
            label={settings.esp32Linked ? 'Re-link with QR code' : 'Scan QR code to link'}
            showArrow
            onPress={handleScanDeviceQR}
          />
          <Separator />
          <SettingsRow
            icon="keypad-outline"
            label="Enter details manually"
            showArrow
            onPress={handleESP32Settings}
          />
          <Separator />
          {/* Renamed from "Security activity" (Oct 2026): everything it can
              report is about the Hub - a refused token, a link, a transfer. */}
          <SettingsRow
            icon="pulse-outline"
            label="Hub activity"
            value={summariseSecurityEvents(securityEvents)}
            showArrow
            onPress={() => setSecurityModalVisible(true)}
          />
          {settings.esp32Linked ? (
            <>
              <Separator />
              <SettingsRow
                icon="close-circle-outline"
                label="Remove Hub"
                isDestructive
                showArrow
                onPress={handleDeviceUnlink}
              />
            </>
          ) : null}
        </SectionCard>

        {/* Saved appliances - just the appliances (Oct 2026): the naming
            guidance paragraphs were removed on request. Each row carries an
            icon for its kind and the power it was learned at. */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionHeaderInline}>Saved appliances</Text>
          {!showOfflineState && savedAppliances.length > 0 ? (
            <Text style={styles.sectionCount}>{savedAppliances.length}</Text>
          ) : null}
        </View>
        <SectionCard>
          {/* Offline first: an unread list is also length 0, and telling an
              owner who has trained four appliances that they have none would
              invite them to start over. */}
          {showOfflineState ? (
            <Text style={styles.emptyAppliancesText}>Can&rsquo;t load these without a connection.</Text>
          ) : savedAppliances.length === 0 ? (
            <Text style={styles.emptyAppliancesText}>None yet — name one on the Outlets tab.</Text>
          ) : (
            savedAppliances.map((appliance, index) => (
              <React.Fragment key={appliance.label}>
                {index > 0 && <Separator />}
                <SettingsRow
                  icon={applianceIcon(appliance.label)}
                  iconSet="mci"
                  label={appliance.label}
                  value={formatApplianceSignature(appliance)}
                  strongValue
                  actions={[
                    { icon: 'create-outline', label: `Rename ${appliance.label}`, onPress: () => setRenamingAppliance(appliance.label) },
                    { icon: 'trash-outline', label: `Forget ${appliance.label}`, onPress: () => handleForgetSavedAppliance(appliance.label), danger: true },
                  ]}
                />
              </React.Fragment>
            ))
          )}
        </SectionCard>

        {/* Notifications - the switch says what it currently means, and the
            icon follows it. */}
        <SectionHeader title="Notifications" />
        <SectionCard>
          <SettingsRow
            icon={settings.notifications ? 'notifications' : 'notifications-off-outline'}
            label="Push notifications"
            subtitle={settings.notifications ? 'Safety, budget and Hub alerts' : 'Off — no alerts on this phone'}
            isSwitch
            switchValue={settings.notifications}
            onSwitchChange={handleNotificationsToggle}
          />
        </SectionCard>

        {/* About - compact (Oct 2026): three tiles in one row. The version
            is in the footer, once. */}
        <SectionHeader title="About" />
        <View style={styles.aboutRow}>
          {[
            { icon: 'information-circle', label: 'About', onPress: handleAbout },
            { icon: 'help-circle', label: 'Help', onPress: handleHelp },
            { icon: 'lock-closed', label: 'Privacy', onPress: handlePrivacy },
            // support@dagitab.site, straight to the mail app.
            { icon: 'mail', label: 'Support', onPress: handleSupport },
          ].map((item) => (
            <TouchableOpacity
              key={item.label}
              style={styles.aboutTile}
              onPress={item.onPress}
              activeOpacity={0.7}
              accessibilityRole="button"
            >
              <View style={styles.aboutIcon}>
                <Ionicons name={item.icon} size={20} color={COLORS.primary} />
              </View>
              <Text style={styles.aboutLabel}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.signOut}>
          <SectionCard>
            <SettingsRow
              icon="exit-outline"
              label={isSigningOut ? 'Signing out…' : 'Sign out'}
              isDestructive
              busy={isSigningOut}
              onPress={handleLogout}
            />
          </SectionCard>
        </View>

        <View style={styles.footer}>
          {loading ? <Text style={styles.footerSub}>Syncing settings…</Text> : null}
          {!loading && error ? <Text style={styles.errorText}>{error}</Text> : null}
          <Text style={styles.footerText}>Dagitab {formatVersion()}</Text>
        </View>
      </ScrollView>

      <NotificationPanel
        visible={notificationVisible}
        onClose={() => setNotificationVisible(false)}
      />

      <ProfileNameModal
        visible={nameModalVisible}
        currentName={settings.profileName}
        onClose={() => setNameModalVisible(false)}
        onSave={handleNameSave}
      />

      <DeleteAccountModal
        visible={deleteModalVisible}
        email={settings.email}
        usesPassword={hasPasswordSignIn(user)}
        onClose={() => setDeleteModalVisible(false)}
        onConfirm={handleDeleteAccount}
      />

      <SecurityActivityModal
        visible={securityModalVisible}
        userId={user?.uid}
        onClose={() => setSecurityModalVisible(false)}
      />

      {/* PELCO III Block 1 rate editor */}
      <SupplyRateModal
        visible={rateModalVisible}
        currentRates={settings.supplyRates}
        hasSavedRates={ratesSet}
        rateMode={settings.rateMode}
        ratesSourceMonth={settings.ratesSourceMonth}
        onUseAutomatic={switchToAutomaticRates}
        onClose={handleRateClose}
        onSave={handleRateSave}
      />

      {/* Statements, and the one place a closed month can be finalized */}
      <StatementsModal
        visible={statementsVisible}
        userId={user?.uid}
        onClose={() => setStatementsVisible(false)}
      />

      <ESP32DeviceModal
        visible={deviceModalVisible}
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
        subtitle="Outlets using this name change too."
        placeholder="Appliance name"
        fieldLabel="Appliance name"
        onClose={() => setRenamingAppliance(null)}
        onSave={handleRenameSavedAppliance}
      />

      {/* Mounted only while there is something to say. A Modal left mounted with
          visible={false} still renders its children. */}
      {dialog ? (
        <AppDialog
          {...dialog}
          confirmLabel={dialog.confirmLabel || 'Got it'}
          onCancel={dialog.onCancel || (() => setDialog(null))}
          onDismiss={dialog.onDismiss || (() => setDialog(null))}
          onConfirm={dialog.onConfirm || (() => setDialog(null))}
        />
      ) : null}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  emptyAppliancesText: {
    fontSize: 13,
    color: COLORS.textLight,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 6,
  },
  sectionHeaderInline: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textLight,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  sectionCount: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primary,
    backgroundColor: '#ECF8EF',
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 1,
    overflow: 'hidden',
  },
  aboutRow: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 16,
  },
  aboutTile: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  aboutIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ECF8EF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  aboutLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
  },
  signOut: {
    marginTop: 16,
  },
  // Its own tinted block rather than a bare paragraph flush against the list.
  // Sitting inside the card with the same padding as the rows above it, this
  // read as one more list entry that happened to be long; the border and the
  // green tint mark it as help about the list rather than part of it.
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  bellButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellBadge: {
    position: 'absolute',
    top: 3,
    right: 3,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: COLORS.error,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.white,
  },
  bellBadgeText: {
    color: COLORS.white,
    fontSize: 10,
    fontWeight: '700',
  },
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: COLORS.white,
    fontSize: 17,
    fontWeight: '700',
  },
  profileText: {
    flex: 1,
  },
  profileName: {
    fontSize: 15.5,
    fontWeight: '700',
    color: COLORS.text,
  },
  profileEmail: {
    fontSize: 12.5,
    color: COLORS.textLight,
    marginTop: 1,
  },
  rateTile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  rateIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rateText: {
    flex: 1,
  },
  rateLabel: {
    fontSize: 12,
    color: COLORS.textLight,
  },
  rateValue: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.text,
    marginTop: 1,
  },
  rateValueUnset: {
    color: COLORS.textLight,
  },
  rateUnit: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textLight,
  },
  rateSub: {
    fontSize: 11.5,
    color: COLORS.textLight,
    marginTop: 1,
  },
  ratePill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#ECF8EF',
  },
  ratePillText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primary,
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
    paddingTop: 16,
    paddingBottom: 6,
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
    marginLeft: 58,
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