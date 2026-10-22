/**
 * How a notification is drawn on the phone (Oct 2026): an Ionicons name per
 * type in place of the emoji notificationHelpers returns, and the title without
 * the emoji the backend writes at its start. Kept beside the components rather
 * than in notificationHelpers.js, which is byte-identical with the web client.
 */
export const NOTIFICATION_TYPE_ICONS = {
  high_usage: 'flash',
  warning: 'warning',
  cutoff: 'flash-off',
  budget: 'wallet',
  schedule: 'timer',
  device: 'hardware-chip',
  charge: 'battery-charging',
  receipt: 'receipt',
  invoice: 'document-text',
};

export const notificationIcon = (type) => NOTIFICATION_TYPE_ICONS[type] || 'notifications';

/** "🔋 Charging looks finished" -> "Charging looks finished". Display only. */
export const cleanTitle = (title) =>
  String(title || 'Notification').replace(/^[^A-Za-z0-9₱(]+/, '').trim() || 'Notification';
