import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import { COLORS } from '../../../constants/colors';
import {
  getNotificationIcon,
  getNotificationColor,
  formatNotificationTime,
  formatNotificationDate,
  describeNotificationDetails,
} from '../utils/notificationHelpers';

/**
 * The expanded view of one notification.
 *
 * Replaces an `Alert.alert` whose body was the message followed by
 * `JSON.stringify(metadata)` - so tapping a safety alert showed
 * `{"outlet1Current":0,"outlet1Voltage":242.3999939,…}`, braces, keys and all.
 * The information was there; it was just the stored document rather than
 * anything written for a reader.
 *
 * Laid out like the rest of the app rather than like a dialog: the type's own
 * colour on the header, the readings as a labelled table, and no decision to
 * make - it is something to read and dismiss.
 */
const NotificationDetailModal = ({ visible, notification, onClose }) => {
  const { width } = useWindowDimensions();

  if (!notification) return null;

  const accent = getNotificationColor(notification.type);
  const icon = getNotificationIcon(notification.type);
  const rows = describeNotificationDetails(notification);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <View style={[styles.card, { width: Math.min(width - 40, 400) }]}>
          <View style={styles.header}>
            <View style={[styles.iconContainer, { backgroundColor: `${accent}20` }]}>
              <Text style={styles.icon}>{icon}</Text>
            </View>
            <View style={styles.headerText}>
              <Text style={styles.title}>{notification.title || 'Notification'}</Text>
              <Text style={styles.timestamp}>
                {formatNotificationTime(notification.timestamp)}
                {'  ·  '}
                {formatNotificationDate(notification.timestamp)}
              </Text>
            </View>
          </View>

          <View style={[styles.messageBlock, { borderLeftColor: accent }]}>
            <Text style={styles.message}>{notification.message || '--'}</Text>
          </View>

          {/* Capped rather than free-growing: a metadata shape with many keys
              would otherwise push the close button off the screen. */}
          {rows.length > 0 ? (
            <ScrollView style={styles.rowsScroll} bounces={false}>
              <View style={styles.rows}>
                {rows.map((row, index) => (
                  <View
                    key={row.label}
                    style={[styles.row, index === rows.length - 1 && styles.rowLast]}
                  >
                    <Text style={styles.rowLabel}>{row.label}</Text>
                    <Text style={styles.rowValue}>{row.value}</Text>
                  </View>
                ))}
              </View>
            </ScrollView>
          ) : null}

          {notification.outlet ? (
            <Text style={styles.footnote}>Affects Outlet {notification.outlet}</Text>
          ) : null}

          <TouchableOpacity
            style={[styles.button, { backgroundColor: accent }]}
            onPress={onClose}
            activeOpacity={0.85}
          >
            <Text style={styles.buttonText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  icon: {
    fontSize: 20,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
    lineHeight: 22,
  },
  timestamp: {
    fontSize: 11,
    color: COLORS.textLight,
    marginTop: 3,
  },
  messageBlock: {
    borderLeftWidth: 3,
    paddingLeft: 12,
    paddingVertical: 2,
    marginBottom: 18,
  },
  message: {
    fontSize: 14,
    color: COLORS.textLight,
    lineHeight: 20,
  },
  rowsScroll: {
    maxHeight: 260,
  },
  rows: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowLabel: {
    fontSize: 13,
    color: COLORS.textLight,
    marginRight: 12,
  },
  rowValue: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    textAlign: 'right',
  },
  footnote: {
    fontSize: 12,
    color: COLORS.textLight,
    marginTop: 12,
  },
  button: {
    marginTop: 20,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.white,
  },
});

export default NotificationDetailModal;
