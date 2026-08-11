import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { COLORS } from '../../constants/colors';

/**
 * Catches a render error anywhere below it and shows a recovery screen.
 *
 * Without this, an exception thrown while rendering unmounts the whole React
 * tree. In a development build that surfaces as the red box; in a release build
 * it leaves a blank window or closes the app outright, with nothing on screen
 * explaining why. The user's only recourse is to relaunch, and during a live
 * demonstration it reads as a crash.
 *
 * A class component by necessity: `componentDidCatch` and
 * `getDerivedStateFromError` have no hook equivalent.
 *
 * "Try again" clears the error and re-renders the same tree. That genuinely
 * recovers a transient fault - a bad Firestore document, a value that was
 * briefly undefined mid-update - and simply re-throws for a deterministic one,
 * which is the honest outcome rather than a false promise.
 */
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    // Kept as console output rather than written to Firestore: the failure may
    // well be *in* the data layer, and a boundary whose own reporting can throw
    // is worse than no boundary. Visible in `adb logcat` and in Expo's console.
    console.error('Unhandled render error:', error, errorInfo?.componentStack);
  }

  handleRetry = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;

    if (!error) return this.props.children;

    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.icon}>⚡</Text>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.body}>
            WattWise hit an unexpected problem on this screen. Your outlets and
            safety cutoff are unaffected - they run on the device itself, not in
            this app.
          </Text>

          <TouchableOpacity
            style={styles.button}
            onPress={this.handleRetry}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonText}>Try again</Text>
          </TouchableOpacity>

          {__DEV__ ? (
            <Text style={styles.detail}>{String(error?.message || error)}</Text>
          ) : null}
        </ScrollView>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  icon: {
    fontSize: 40,
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 10,
    textAlign: 'center',
  },
  body: {
    fontSize: 14,
    color: COLORS.textLight,
    lineHeight: 21,
    textAlign: 'center',
    marginBottom: 26,
  },
  button: {
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    paddingHorizontal: 36,
    borderRadius: 12,
  },
  buttonText: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: '700',
  },
  detail: {
    marginTop: 26,
    fontSize: 11,
    color: COLORS.textLight,
    textAlign: 'center',
  },
});

export default ErrorBoundary;
