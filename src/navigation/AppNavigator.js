// Main App Navigator with Auth State Handler
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SplashScreen } from '../screens/Splash/SplashScreen';
import { AuthNavigator } from './AuthNavigator';
import { MainNavigator } from './MainNavigator';
import { OnboardingScreen } from '../screens/Onboarding/OnboardingScreen';
import { VerifyEmailScreen } from '../screens/Auth/VerifyEmail/VerifyEmailScreen';
import { useAuth } from '../hooks/useAuth';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { Loading } from '../components/common/Loading';

const Stack = createStackNavigator();

// Accounts created before this date are exempt from the email check.
//
// Verification did not exist when they signed up, so every one of them has
// emailVerified:false. Applying the gate retroactively would lock all of them
// out at once - and the only way back in is a link sent to an address that was
// never confirmed, which may not even be reachable. New accounts get verified
// at registration, so this exemption stops mattering as the old accounts age
// out.
const VERIFICATION_REQUIRED_FROM_MS = Date.parse('2026-08-11T00:00:00Z');

const needsEmailVerification = (user) => {
  if (!user || user.emailVerified) return false;

  // An unparseable creation time means we cannot tell whether the account
  // predates the gate. Let it through: wrongly blocking a real user is worse
  // than wrongly exempting one.
  const createdMs = Date.parse(user.metadata?.creationTime || '');
  if (!Number.isFinite(createdMs)) return false;

  return createdMs >= VERIFICATION_REQUIRED_FROM_MS;
};

export const AppNavigator = () => {
  const { user, loading } = useAuth();
  const [onboardingComplete, setOnboardingComplete] = useState(null);
  const [checkingOnboarding, setCheckingOnboarding] = useState(false);
  // Bumped when the verify screen confirms the address. `reload()` mutates the
  // existing user object rather than emitting a new one, so onAuthStateChanged
  // stays silent and nothing else would re-render to notice the change.
  const [verifiedTick, setVerifiedTick] = useState(0);

  // Registers this device for push once signed in. Best-effort by design: a
  // denied permission leaves the user on email + in-app alerts.
  usePushNotifications(user?.uid);

  // verifiedTick is a dependency rather than an argument: reload() mutates the
  // same user object, so the value this reads changes without the reference
  // changing, and only the tick can tell React to look again. Declared above
  // the loading early-return, since hooks cannot run conditionally.
  const mustVerifyEmail = useMemo(
    () => needsEmailVerification(user),
    [user, verifiedTick]
  );

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
        ) : mustVerifyEmail ? (
          // Ahead of onboarding: there is no point setting up an account whose
          // address may not be reachable, and every email the app sends later
          // depends on this one being confirmed.
          <Stack.Screen name="VerifyEmail">
            {() => (
              <VerifyEmailScreen
                email={user.email}
                onVerified={() => setVerifiedTick((value) => value + 1)}
              />
            )}
          </Stack.Screen>
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