// Main App Navigator with Auth State Handler
import React, { useEffect, useState, useCallback } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SplashScreen } from '../screens/Splash/SplashScreen';
import { AuthNavigator } from './AuthNavigator';
import { MainNavigator } from './MainNavigator';
import { OnboardingScreen } from '../screens/Onboarding/OnboardingScreen';
import { useAuth } from '../hooks/useAuth';
import { Loading } from '../components/common/Loading';

const Stack = createStackNavigator();

export const AppNavigator = () => {
  const { user, loading } = useAuth();
  const [onboardingComplete, setOnboardingComplete] = useState(null);
  const [checkingOnboarding, setCheckingOnboarding] = useState(false);

  const checkOnboarding = useCallback(async () => {
    setCheckingOnboarding(true);
    try {
      const value = await AsyncStorage.getItem('onboarding_complete');
      setOnboardingComplete(value === 'true');
    } catch (error) {
      setOnboardingComplete(false);
    } finally {
      setCheckingOnboarding(false);
    }
  }, []);

 useEffect(() => {
  if (!loading) {
    if (user) {
      checkOnboarding();
    } else {
      setOnboardingComplete(null);
      setCheckingOnboarding(false);
    }
  }
}, [user, loading, checkOnboarding]);

  // Wait for Firebase auth + onboarding check to complete
  if (loading || checkingOnboarding || (user && onboardingComplete === null)) {
    return <Loading />;
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          <>
            <Stack.Screen name="Splash" component={SplashScreen} />
            <Stack.Screen name="Auth" component={AuthNavigator} />
          </>
        ) : !onboardingComplete ? (
          <Stack.Screen name="Onboarding">
            {() => <OnboardingScreen onFinish={checkOnboarding} />}
          </Stack.Screen>
        ) : (
          <Stack.Screen name="Main" component={MainNavigator} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};