import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DashboardScreen } from '../screens/Dashboard/DashboardScreen';
import { AnalyticsScreen } from '../screens/Analytics/AnalyticsScreen';
import HistoryScreen from '../screens/History/HistoryScreen';
import ScheduleScreen from '../screens/Timer/ScheduleScreen';
import SettingsScreen from '../screens/Settings/SettingsScreen';
import { COLORS } from '../constants/colors';
import PowerSafetyScreen from '../screens/PowerSafetyManagement/PowerSafetyScreen';
import BudgetTrackingScreen from '../screens/BudgetTracking/BudgetTrackingScreen';
import ReferenceComparisonScreen from '../screens/ReferenceComparison/ReferenceComparisonScreen';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

const TabIcon = ({ emoji, label, focused }) => (
  <View style={styles.tabIconContainer}>
    <Text style={styles.tabEmoji}>{emoji}</Text>
    <Text style={[styles.tabLabel, focused && styles.tabLabelFocused]}>
      {label}
    </Text>
  </View>
);

const MainTabs = () => {
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: COLORS.white,
          borderTopWidth: 1,
          borderTopColor: COLORS.border,
          height: Platform.OS === 'android' ? 56 + insets.bottom : 60 + insets.bottom,
          paddingBottom: Platform.OS === 'android' ? insets.bottom + 4 : insets.bottom,
          paddingTop: 4,
          elevation: 8,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.05,
          shadowRadius: 4,
        },
        tabBarShowLabel: false,
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon emoji="🏠" label="Home" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Analytics"
        component={AnalyticsScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon emoji="📊" label="Analytics" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="History"
        component={HistoryScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon emoji="📋" label="History" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Schedule"
        component={ScheduleScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon emoji="⏱️" label="Schedule" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon emoji="⚙️" label="Settings" focused={focused} />
          ),
        }}
      />
    </Tab.Navigator>
  );
};

export const MainNavigator = () => {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MainTabs" component={MainTabs} />
      <Stack.Screen
        name="PowerSafety"
        component={PowerSafetyScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="BudgetTracking"
        component={BudgetTrackingScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ReferenceComparison"
        component={ReferenceComparisonScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
};

const styles = StyleSheet.create({
  tabIconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 60,
  },
  tabEmoji: {
    fontSize: 18,
    marginBottom: 1,
  },
  tabLabel: {
    fontSize: 9,
    color: COLORS.textLight,
  },
  tabLabelFocused: {
    color: COLORS.primary,
    fontWeight: '600',
  },
});