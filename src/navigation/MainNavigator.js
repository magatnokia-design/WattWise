import React from 'react';
import { View, Text, StyleSheet, Platform, Pressable } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { AnalyticsScreen } from '../screens/Analytics/AnalyticsScreen';
import HistoryScreen from '../screens/History/HistoryScreen';
import ScheduleScreen from '../screens/Timer/ScheduleScreen';
import SettingsScreen from '../screens/Settings/SettingsScreen';
import OutletsScreen from '../screens/Outlets/OutletsScreen';
import { COLORS } from '../constants/colors';
import useUnreadCount from '../screens/Notifications/hooks/useUnreadCount';
import PowerSafetyScreen from '../screens/PowerSafetyManagement/PowerSafetyScreen';
import BudgetTrackingScreen from '../screens/BudgetTracking/BudgetTrackingScreen';
import ReferenceComparisonScreen from '../screens/ReferenceComparison/ReferenceComparisonScreen';
import ApplianceCostsScreen from '../screens/ApplianceCosts/ApplianceCostsScreen';
import HelpCenterScreen from '../screens/Help/HelpCenterScreen';
import DocumentScreen from '../screens/Help/DocumentScreen';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

/**
 * Bottom bar: Budget · Analytics · [Outlets] · History · Settings.
 *
 * Home was removed (Oct 2026). Its parts moved: the notification bell and the
 * set-your-rates prompt to Budget, which took its place; Compare Usage to
 * Analytics; the stuck-relay warning and the Hub setup card to Outlets. The
 * app now opens on Outlets.
 *
 * Outlets is the raised centre button (Oct 2026: "stand out in the middle,
 * like GCash"). Five slots put it exactly in the middle, so Schedule left the
 * bar and opens from the Outlets screen instead - timers are about outlets.
 *
 * Icons are Ionicons (bundled with Expo, already used across the app) rather
 * than emoji, filled when the tab is selected and outlined otherwise.
 */

const TabIcon = ({ icon, label, focused, dot = false }) => (
  <View style={styles.tabIconContainer}>
    <View>
      <Ionicons
        name={focused ? icon : `${icon}-outline`}
        size={22}
        color={focused ? COLORS.primary : COLORS.textLight}
      />
      {dot ? <View style={styles.tabDot} /> : null}
    </View>
    <Text style={[styles.tabLabel, focused && styles.tabLabelFocused]} numberOfLines={1}>
      {label}
    </Text>
  </View>
);

// Settings carries the notification bell, so it carries the unread dot too:
// a red dot on the tab whenever something has not been read (Oct 2026).
const SettingsTabIcon = ({ focused }) => {
  const unread = useUnreadCount();
  return <TabIcon icon="settings" label="Settings" focused={focused} dot={unread > 0} />;
};

// The raised centre button. A custom tabBarButton so it can sit above the bar.
const OutletsTabButton = ({ onPress, accessibilityState }) => {
  const focused = Boolean(accessibilityState?.selected);
  return (
    <Pressable
      onPress={onPress}
      style={styles.centerSlot}
      accessibilityRole="button"
      accessibilityLabel="Outlets"
      accessibilityState={accessibilityState}
    >
      <View style={[styles.centerButton, focused && styles.centerButtonFocused]}>
        <MaterialCommunityIcons name="power-socket-us" size={32} color={COLORS.white} />
      </View>
      <Text style={[styles.centerLabel, focused && styles.tabLabelFocused]}>Outlets</Text>
    </Pressable>
  );
};

const MainTabs = () => {
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      initialRouteName="Outlets"
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: COLORS.white,
          borderTopWidth: 1,
          borderTopColor: COLORS.border,
          height: Platform.OS === 'android' ? 60 + insets.bottom : 64 + insets.bottom,
          paddingBottom: Platform.OS === 'android' ? insets.bottom + 4 : insets.bottom,
          paddingTop: 6,
          elevation: 8,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.05,
          shadowRadius: 4,
        },
        tabBarShowLabel: false,
      }}
    >
      {/* Named BudgetTracking, not Budget, so every existing
          navigate('BudgetTracking') (Settings) lands on this tab. */}
      <Tab.Screen
        name="BudgetTracking"
        component={BudgetTrackingScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon icon="wallet" label="Budget" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Analytics"
        component={AnalyticsScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon icon="stats-chart" label="Analytics" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Outlets"
        component={OutletsScreen}
        options={{
          tabBarButton: (props) => <OutletsTabButton {...props} />,
        }}
      />
      <Tab.Screen
        name="History"
        component={HistoryScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon icon="receipt" label="History" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarIcon: ({ focused }) => <SettingsTabIcon focused={focused} />,
        }}
      />
    </Tab.Navigator>
  );
};

export const MainNavigator = () => {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MainTabs" component={MainTabs} />
      {/* Opened from the Outlets tab ("Timers"), no longer a tab of its own. */}
      <Stack.Screen name="Schedule" component={ScheduleScreen} />
      <Stack.Screen
        name="PowerSafety"
        component={PowerSafetyScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ReferenceComparison"
        component={ReferenceComparisonScreen}
        options={{ headerShown: false }}
      />
      {/* Opened from the Analytics appliance cost card. */}
      <Stack.Screen
        name="ApplianceCosts"
        component={ApplianceCostsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="HelpCenter"
        component={HelpCenterScreen}
        options={{ headerShown: false }}
      />
      {/* About and Privacy share one screen; `document` selects which. */}
      <Stack.Screen
        name="Document"
        component={DocumentScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
};

const styles = StyleSheet.create({
  tabDot: {
    position: 'absolute',
    top: -1,
    right: -3,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: COLORS.error,
    borderWidth: 1.5,
    borderColor: COLORS.white,
  },
  tabIconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 68,
    gap: 2,
  },
  tabLabel: {
    fontSize: 10,
    color: COLORS.textLight,
  },
  tabLabelFocused: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  centerSlot: {
    flex: 1,
    alignItems: 'center',
  },
  // Lifted half its height above the bar, ringed in white so it reads as a
  // button sitting on the bar rather than a circle cut out of it.
  centerButton: {
    width: 62,
    height: 62,
    borderRadius: 31,
    marginTop: -26,
    backgroundColor: COLORS.primary,
    borderWidth: 4,
    borderColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#00401F',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  centerButtonFocused: {
    backgroundColor: COLORS.primaryDark,
  },
  centerLabel: {
    marginTop: 2,
    fontSize: 10,
    color: COLORS.textLight,
  },
});
