import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../../constants/colors';
import NotificationDetailModal from './NotificationDetailModal';
import { getNotificationColor, formatNotificationTime } from '../utils/notificationHelpers';
import { formatRelativeTime } from '../../../utils/datetime';
import { notificationIcon, cleanTitle } from './notificationDisplay';

const NotificationItem = ({ item, onPress }) => {
  const [showDetail, setShowDetail] = useState(false);

  const handlePress = useCallback(() => {
    setShowDetail(true);
    if (onPress) onPress(item.id);
  }, [item.id, onPress]);

  const color = getNotificationColor(item.type);
  const icon = notificationIcon(item.type);

  return (
    <TouchableOpacity
      style={[styles.item, !item.read && styles.itemUnread]}
      onPress={handlePress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${item.read ? '' : 'Unread. '}${cleanTitle(item.title)}`}
    >
      <View style={[styles.iconContainer, { backgroundColor: `${color}1F` }]}>
        <Ionicons name={icon} size={19} color={color} />
      </View>

      <View style={styles.content}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, !item.read && styles.titleUnread]} numberOfLines={1}>
            {cleanTitle(item.title)}
          </Text>
          <Text style={styles.time}>{formatRelativeTime(item.timestamp, formatNotificationTime(item.timestamp))}</Text>
        </View>
        <Text style={styles.message} numberOfLines={2}>
          {item.message || '--'}
        </Text>
      </View>

      {!item.read ? <View style={styles.unreadDot} /> : null}

      <NotificationDetailModal
        visible={showDetail}
        notification={item}
        onClose={() => setShowDetail(false)}
      />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: COLORS.white,
  },
  itemUnread: {
    backgroundColor: '#F4FBF6',
  },
  iconContainer: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  content: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  title: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.text,
  },
  titleUnread: {
    fontWeight: '700',
  },
  time: {
    fontSize: 11,
    color: COLORS.textLight,
  },
  message: {
    fontSize: 12.5,
    color: COLORS.textLight,
    lineHeight: 17,
    marginTop: 2,
  },
  // Red, like the dot on the Settings tab: unread is the one state that asks
  // to be looked at.
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
    marginLeft: 8,
    backgroundColor: COLORS.error,
  },
});

export default NotificationItem;
