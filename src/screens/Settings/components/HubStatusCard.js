import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '../../../constants/colors';
import { formatDeviceHealthValue } from '../utils/settingsHelpers';

/**
 * The WattWise Hub, at a glance.
 *
 * Replaces four identical-looking rows where the only way to tell whether the
 * hardware was working was to read a value squeezed onto the right-hand edge of
 * one of them. Device state is the first thing someone checks when the app
 * looks wrong, so it gets a shape of its own rather than a row among rows.
 *
 * "Hub" rather than "ESP32" throughout. The unit is branded WattWise Hub on its
 * own sticker and in the setup guide; nobody outside this project knows what an
 * ESP32 is, and the app was the last place still calling it that.
 */
const TONE = {
  online: { dot: COLORS.primary, chip: '#ECFDF5', text: COLORS.primaryDark },
  warning: { dot: '#F59E0B', chip: '#FEF3C7', text: '#92400E' },
  offline: { dot: COLORS.textLight, chip: '#F3F4F6', text: COLORS.textLight },
};

const toneFor = (status, linked) => {
  if (!linked) return TONE.offline;
  if (status === 'online') return TONE.online;
  if (status === 'stale' || status === 'degraded') return TONE.warning;
  return TONE.offline;
};

const Field = ({ label, value }) => (
  <View style={styles.field}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <Text style={styles.fieldValue} numberOfLines={1}>{value}</Text>
  </View>
);

export const HubStatusCard = ({ settings = {} }) => {
  const linked = Boolean(settings.esp32Linked);
  const tone = toneFor(settings.esp32HealthStatus, linked);

  const statusText = linked
    ? formatDeviceHealthValue(settings.esp32HealthStatus, settings.esp32LastSeenAtMs)
    : 'Not linked';

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.title}>WattWise Hub</Text>
        <View style={[styles.chip, { backgroundColor: tone.chip }]}>
          <View style={[styles.dot, { backgroundColor: tone.dot }]} />
          <Text style={[styles.chipText, { color: tone.text }]}>{statusText}</Text>
        </View>
      </View>

      {linked ? (
        <>
          <Field label="Device ID" value={settings.esp32DeviceId || '—'} />
          {settings.esp32LastAckStatus ? (
            <Field label="Last command" value={settings.esp32LastAckStatus} />
          ) : null}
          {/* Only shown when there is something to explain. A permanent "reason"
              row reading "ok" is noise that trains people to skip the block. */}
          {settings.esp32HealthReason && settings.esp32HealthStatus !== 'online' ? (
            <Field label="Reason" value={settings.esp32HealthReason} />
          ) : null}
        </>
      ) : (
        <Text style={styles.empty}>
          No Hub linked yet. Scan the QR code on your unit, or enter its details
          by hand, using the options below.
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 10,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  title: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  dot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  chipText: { fontSize: 11, fontWeight: '700' },
  field: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  fieldLabel: { fontSize: 12, color: COLORS.textLight },
  fieldValue: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.text,
    flexShrink: 1,
    paddingLeft: 12,
  },
  empty: { fontSize: 12, color: COLORS.textLight, lineHeight: 18 },
});

export default HubStatusCard;
