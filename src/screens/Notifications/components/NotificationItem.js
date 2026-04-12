import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { COLORS } from '../../../constants/colors';
import {
  getNotificationIcon,
  getNotificationColor,
  formatNotificationTime,
  formatNotificationDate,
} from '../utils/notificationHelpers';

const NotificationItem = ({ item, onPress }) => {
  const { width } = useWindowDimensions();

  const detailLines = [
    `Type: ${item.type || 'general'}`,
    `Date: ${formatNotificationDate(item.timestamp)}`,
    `Time: ${formatNotificationTime(item.timestamp)}`,
    item.outlet ? `Outlet: ${item.outlet}` : null,
    item.metadata && Object.keys(item.metadata).length > 0
      ? `Details: ${JSON.stringify(item.metadata)}`
      : null,
  ].filter(Boolean);

  const handlePress = useCallback(() => {
    Alert.alert(item.title || 'Notification', [item.message || '--', ...detailLines].join('\n'));
    if (onPress) onPress(item.id);
  }, [item, onPress, detailLines]);

  const iconColor = getNotificationColor(item.type);
  const icon = getNotificationIcon(item.type);

  return (
    <TouchableOpacity
      style={[styles.item, !item.read && styles.itemUnread]}
      onPress={handlePress}
      activeOpacity={0.7}
    >
      {/* Icon */}
      <View style={[styles.iconContainer, { backgroundColor: iconColor + '20' }]}>
        <Text style={styles.icon}>{icon}</Text>
      </View>

      {/* Content */}
      <View style={styles.content}>
        <Text style={[styles.title, !item.read && styles.titleUnread]}>
          {item.title || 'Notification'}
        </Text>
        <Text style={styles.message} numberOfLines={2}>
          {item.message || '--'}
        </Text>
        <Text style={styles.time}>
          {formatNotificationTime(item.timestamp)} · {formatNotificationDate(item.timestamp)}
        </Text>
      </View>

      {/* Unread Dot */}
      {!item.read && (
        <View style={[styles.unreadDot, { backgroundColor: iconColor }]} />
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: COLORS.white,
  },
  itemUnread: {
    backgroundColor: COLORS.primary + '08',
  },
  iconContainer: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  icon: {
    fontSize: 20,
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.text,
    marginBottom: 4,
  },
  titleUnread: {
    fontWeight: '700',
  },
  message: {
    fontSize: 13,
    color: COLORS.textLight,
    lineHeight: 18,
    marginBottom: 6,
  },
  time: {
    fontSize: 11,
    color: COLORS.textLight,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 4,
    marginLeft: 8,
  },
});

export default NotificationItem;