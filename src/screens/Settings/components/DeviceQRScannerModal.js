import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '../../../constants/colors';
import { parseDeviceQrPayload } from '../utils/deviceQr';

// expo-camera ships native code, so it is missing from any dev client built
// before it was added. A top-level import would throw during module evaluation
// and take the whole app down at startup, so resolve it defensively and degrade
// to manual entry instead.
let ExpoCamera = null;
try {
  // eslint-disable-next-line global-require
  ExpoCamera = require('expo-camera');
} catch {
  ExpoCamera = null;
}

const isCameraAvailable = !!ExpoCamera?.CameraView && !!ExpoCamera?.useCameraPermissions;

/**
 * Camera half of the scanner. Kept in its own component because it calls
 * expo-camera hooks, which must not run when the native module is absent.
 */
const CameraScanner = ({ visible, onClose, onScanned }) => {
  const [permission, requestPermission] = ExpoCamera.useCameraPermissions();
  const CameraView = ExpoCamera.CameraView;
  const [status, setStatus] = useState({ state: 'scanning', message: '' });
  // A single QR sits in frame for many frames; without this the handler fires
  // repeatedly and would submit the same pairing over and over.
  const handledRef = useRef(false);

  useEffect(() => {
    if (!visible) return;
    handledRef.current = false;
    setStatus({ state: 'scanning', message: '' });
  }, [visible]);

  const handleBarcodeScanned = useCallback(async ({ data }) => {
    if (handledRef.current) return;
    handledRef.current = true;

    const parsed = parseDeviceQrPayload(data);

    if (!parsed.success) {
      setStatus({ state: 'error', message: parsed.error });
      return;
    }

    setStatus({ state: 'saving', message: 'Linking device...' });

    const result = await onScanned({
      deviceId: parsed.deviceId,
      deviceToken: parsed.token,
    });

    if (result?.success) {
      setStatus({ state: 'done', message: `Linked ${parsed.deviceId}` });
      onClose();
      return;
    }

    setStatus({
      state: 'error',
      message: result?.error || 'Could not link this device.',
    });
  }, [onScanned, onClose]);

  const handleRetry = useCallback(() => {
    handledRef.current = false;
    setStatus({ state: 'scanning', message: '' });
  }, []);

  const renderBody = () => {
    if (!permission) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      );
    }

    if (!permission.granted) {
      return (
        <View style={styles.centered}>
          <Text style={styles.permissionIcon}>📷</Text>
          <Text style={styles.permissionTitle}>Camera access needed</Text>
          <Text style={styles.permissionText}>
            WattWise needs the camera to scan the QR code on your device.
          </Text>
          <TouchableOpacity style={styles.primaryButton} onPress={requestPermission}>
            <Text style={styles.primaryButtonText}>Grant access</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.cameraWrapper}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={status.state === 'scanning' ? handleBarcodeScanned : undefined}
        />
        <View style={styles.reticle} pointerEvents="none" />

        <View style={styles.statusBar}>
          {status.state === 'scanning' ? (
            <Text style={styles.statusText}>
              Point the camera at the QR code on your ESP32
            </Text>
          ) : null}

          {status.state === 'saving' ? (
            <View style={styles.statusRow}>
              <ActivityIndicator color={COLORS.white} size="small" />
              <Text style={styles.statusText}>{status.message}</Text>
            </View>
          ) : null}

          {status.state === 'error' ? (
            <>
              <Text style={styles.errorText}>{status.message}</Text>
              <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
                <Text style={styles.retryText}>Try again</Text>
              </TouchableOpacity>
            </>
          ) : null}
        </View>
      </View>
    );
  };

  return renderBody();
};

/**
 * Shown when the running build predates expo-camera. The app stays usable and
 * pairing still works through manual entry.
 */
const CameraUnavailableNotice = () => (
  <View style={styles.centered}>
    <Text style={styles.permissionIcon}>🛠️</Text>
    <Text style={styles.permissionTitle}>Scanner needs a new build</Text>
    <Text style={styles.permissionText}>
      The camera module is not part of the app build currently installed.
      Rebuild the development client to enable QR scanning.
      {'\n\n'}
      In the meantime you can pair the device using
      {' '}
      <Text style={styles.emphasis}>Enter details manually</Text>.
    </Text>
  </View>
);

/**
 * Scans the QR code supplied with an ESP32 unit and links it to the account.
 * The scanned payload feeds the same save path as manual entry, so pairing and
 * re-pairing behave identically.
 */
const DeviceQRScannerModal = ({ visible, onClose, onScanned }) => (
  <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent={false}>
    {/* Full-screen modals sit outside the screen's SafeAreaView, so this needs
        its own insets or the header renders under the status bar. */}
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.title}>Scan Device QR</Text>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={styles.close}>✕</Text>
        </TouchableOpacity>
      </View>

      {isCameraAvailable ? (
        <CameraScanner visible={visible} onClose={onClose} onScanned={onScanned} />
      ) : (
        <CameraUnavailableNotice />
      )}
    </SafeAreaView>
  </Modal>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
  },
  close: {
    fontSize: 18,
    color: COLORS.textLight,
    padding: 4,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  permissionIcon: {
    fontSize: 44,
    marginBottom: 14,
  },
  permissionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 8,
  },
  permissionText: {
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.textLight,
    textAlign: 'center',
    marginBottom: 20,
  },
  emphasis: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  primaryButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 10,
  },
  primaryButtonText: {
    color: COLORS.white,
    fontWeight: '700',
    fontSize: 14,
  },
  cameraWrapper: {
    flex: 1,
    backgroundColor: '#000',
  },
  reticle: {
    position: 'absolute',
    top: '28%',
    left: '15%',
    width: '70%',
    aspectRatio: 1,
    borderWidth: 3,
    borderColor: COLORS.primary,
    borderRadius: 18,
  },
  statusBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 32,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusText: {
    color: COLORS.white,
    fontSize: 13,
    textAlign: 'center',
  },
  errorText: {
    color: '#FCA5A5',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 10,
  },
  retryButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 8,
  },
  retryText: {
    color: COLORS.white,
    fontWeight: '700',
    fontSize: 13,
  },
});

export default DeviceQRScannerModal;
