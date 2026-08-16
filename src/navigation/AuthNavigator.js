// Auth Navigation Stack
import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { LoginScreen } from '../screens/Auth/Login/LoginScreen';
import { RegisterScreen } from '../screens/Auth/Register/RegisterScreen';
import { ForgotPasswordScreen } from '../screens/Auth/ForgotPassword/ForgotPasswordScreen';
import DocumentScreen from '../screens/Help/DocumentScreen';

const Stack = createStackNavigator();

export const AuthNavigator = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      {/* Registration asks the user to agree to the terms, so the terms have to
          be readable before they have an account. Same screen the signed-in
          side uses; `document` selects which one. */}
      <Stack.Screen name="Document" component={DocumentScreen} />
    </Stack.Navigator>
  );
};