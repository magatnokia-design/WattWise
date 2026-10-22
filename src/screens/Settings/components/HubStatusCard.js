import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../../constants/colors';
import { formatDeviceHealthValue } from '../utils/settingsHelpers';

/**
 * The Dagitab Hub at a glance - compact (Oct 2026): the top row of the Hub
 * card in Settings, above its actions, rather than a card of its own.
 *
 * "Hub" rather than "ESP32" throughout. The unit is branded Dagitab Hub on its
 * own sticker and in the setup guide; nobody outside this project knows what an
 * ESP32 is.
 */
const TONE = {
  online: { dot: COLORS.primary, chip: '#ECF8EF', text: COLORS.primaryDark },
  warning: { dot: '#F59E0B', chip: '#FEF3C7', text: '#92400E' },
  offline: { dot: COLORS.textLight, chip: '#F3F4F6', text: COLORS.textLight },
};

// The Hub posts every 5 s even when idle (METRICS_INTERVAL_IDLE_MS), so a
// minute of silence means it is off power or off Wi-Fi.
const OFFLINE_AFTER_MS = 60000;

const formatClock = (ms) => new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

const toneFor = (status, linked) => {
  if (!linked) return TONE.offline;
  if (status === 'online') return TONE.online;
  if (status === 'stale' || status === 'degraded') return TONE.warning;
  return TONE.offline;
};

export const HubStatusCard = ({ settings = {} }) => {
  const linked = Boolean(settings.esp32Linked);
  // The stored status is the Hub's last word, and a Hub that goes silent
  // never says "offline" - so "online" stayed on screen beside "43 min ago"
  // (Oct 2026). Judged against the clock instead, the way every live reading
  // in this app is (see CLAUDE.md on stored vs live readings).
  const lastSeenMs = Number(settings.esp32LastSeenAtMs || 0);
  const silent = !(lastSeenMs > 0 && Date.now() - lastSeenMs < OFFLINE_AFTER_MS);
  const status = linked && silent && settings.esp32HealthStatus === 'online'
    ? 'offline'
    : settings.esp32HealthStatus;
  const tone = toneFor(status, linked);

  const statusText = linked
    ? (status === 'offline' ? 'Offline' : formatDeviceHealthValue(status, settings.esp32LastSeenAtMs))
    : 'Not linked';

  // Only when there is something to explain. A permanent "reason" reading "ok"
  // is noise that trains people to skip the line.
  // Linked but silent is a power or Wi-Fi question, not a pairing one - and
  // rescanning, which is what people tried, cannot fix it.
  const offlineHint = linked && status === 'offline'
    ? (lastSeenMs > 0
      ? `Linked · last heard ${formatClock(lastSeenMs)} - check its power and Wi-Fi`
      : 'Linked · waiting for its first reading')
    : null;
  const detail = offlineHint || (linked
    ? [
      settings.esp32HealthReason && settings.esp32HealthStatus !== 'online'
        ? settings.esp32HealthReason
        : null,
      settings.esp32LastAckStatus ? `Last command: ${settings.esp32LastAckStatus}` : null,
    ].filter(Boolean).join(' · ')
    : 'Scan the QR code on your Hub to link it');

  return (
    <View style={styles.row}>
      <View style={styles.icon}>
        <Ionicons name="hardware-chip-outline" size={20} color={COLORS.white} />
      </View>
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={1}>
          {linked ? settings.esp32DeviceId || 'Dagitab Hub' : 'Dagitab Hub'}
        </Text>
        {detail ? <Text style={styles.detail} numberOfLines={2}>{detail}</Text> : null}
      </View>
      <View style={[styles.chip, { backgroundColor: tone.chip }]}>
        <View style={[styles.dot, { backgroundColor: tone.dot }]} />
        <Text style={[styles.chipText, { color: tone.text }]} numberOfLines={1}>{statusText}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  detail: {
    fontSize: 12,
    color: COLORS.textLight,
    marginTop: 1,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    maxWidth: '40%',
  },
  dot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  chipText: { fontSize: 11, fontWeight: '700', flexShrink: 1 },
});

export default HubStatusCard;
