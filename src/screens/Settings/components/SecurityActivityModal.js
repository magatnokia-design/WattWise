import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { COLORS } from '../../../constants/colors';
import { securityService } from '../../../services/firebase/securityService';
import { describeSecurityEvents } from '../../../utils/securityActivity';

/**
 * Recent security activity on the account.
 *
 * Read-only, with no "clear" and no "mark as read". Both would be writes, and
 * the rules forbid every client from writing here on purpose: an actor who
 * could delete entries could erase the record of what they did. A log a user
 * can empty is a log an intruder can empty.
 *
 * Live rather than fetched once, because the thing worth showing - a device
 * token being guessed at - is happening now, not last time the screen opened.
 */
export const SecurityActivityModal = ({ visible, userId, onClose }) => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible || !userId) return undefined;

    setLoading(true);
    setError('');

    const unsubscribe = securityService.subscribeSecurityEvents(
      userId,
      (next) => {
        setEvents(next);
        setLoading(false);
      },
      (err) => {
        setError(err?.message || 'Could not load security activity');
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [visible, userId]);

  const rows = describeSecurityEvents(events);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Security activity</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.close}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.subtitle}>
            Sign-ins and device changes on your account, kept for 90 days.
          </Text>

          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator color={COLORS.primary} />
            </View>
          ) : error ? (
            <View style={styles.center}>
              <Text style={styles.error}>{error}</Text>
            </View>
          ) : rows.length === 0 ? (
            <View style={styles.center}>
              <Text style={styles.emptyTitle}>Nothing to report</Text>
              <Text style={styles.emptyBody}>
                Nothing unusual has happened on your account. Device changes and
                refused sign-ins would appear here.
              </Text>
            </View>
          ) : (
            <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
              {rows.map((row) => (
                <View
                  key={row.id}
                  style={[styles.row, row.tone === 'alert' && styles.rowAlert]}
                >
                  <View style={styles.rowHead}>
                    <Text style={styles.rowTitle}>{row.title}</Text>
                    <Text style={styles.rowWhen}>{row.when}</Text>
                  </View>
                  <Text style={styles.rowBody}>{row.body}</Text>
                  {row.deviceId ? (
                    <Text style={styles.rowMeta}>Unit: {row.deviceId}</Text>
                  ) : null}
                </View>
              ))}
            </ScrollView>
          )}
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
    paddingHorizontal: 20,
  },
  sheet: {
    backgroundColor: COLORS.white,
    borderRadius: 14,
    padding: 18,
    maxHeight: '78%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  close: { fontSize: 16, color: COLORS.textLight, paddingHorizontal: 4 },
  subtitle: { fontSize: 12, color: COLORS.textLight, marginTop: 4, marginBottom: 14 },
  center: { paddingVertical: 28, alignItems: 'center' },
  error: { fontSize: 13, color: COLORS.error, textAlign: 'center' },
  emptyTitle: { fontSize: 14, fontWeight: '600', color: COLORS.text, marginBottom: 6 },
  emptyBody: {
    fontSize: 12,
    color: COLORS.textLight,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 12,
  },
  list: { marginHorizontal: -2 },
  row: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  // Yellow, not red. Almost every entry here is something the user did
  // themselves, and a log that shouts at them teaches them to stop reading it -
  // which is exactly how the one entry that matters gets missed.
  rowAlert: {
    borderColor: '#F59E0B',
    backgroundColor: '#FEF3C7',
  },
  rowHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 3,
  },
  rowTitle: { fontSize: 13, fontWeight: '700', color: COLORS.text, flex: 1, paddingRight: 8 },
  rowWhen: { fontSize: 11, color: COLORS.textLight },
  rowBody: { fontSize: 12, color: COLORS.textLight, lineHeight: 17 },
  rowMeta: { fontSize: 11, color: COLORS.textLight, marginTop: 6, fontWeight: '600' },
});

export default SecurityActivityModal;
