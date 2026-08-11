// Main App Entry
import React from 'react';
import { StatusBar } from 'react-native';
import { AppNavigator } from './navigation/AppNavigator';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { COLORS } from './constants/colors';

export default function App() {
  return (
    <>
      <StatusBar
        barStyle="dark-content"
        backgroundColor={COLORS.white}
      />
      {/* Outside the navigator on purpose: a render error thrown while the
          navigator itself is mounting would escape a boundary placed inside
          it, which is the case that closes the app with a blank screen. */}
      <ErrorBoundary>
        <AppNavigator />
      </ErrorBoundary>
    </>
  );
}