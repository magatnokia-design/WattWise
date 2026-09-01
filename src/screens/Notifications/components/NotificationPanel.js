import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  FlatList,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '../../../constants/colors';
import NotificationItem from './NotificationItem';
import { OfflineState } from '../../../components/common/OfflineNotice';
import { useNotifications } from '../hooks/useNotifications';

const NotificationPanel = ({ visible, onClose }) => {
  const { width, height } = useWindowDimensions();

  const {
    notifications,
    unreadCount,
    unreadKnown,
    markAsRead,
    markAllAsRead,
    clearAll,
    showOfflineState,
  } = useNotifications();

  const handleMarkAllRead = useCallback(() => {
    markAllAsRead();
  }, [markAllAsRead]);

  const handleClearAll = useCallback(() => {
    clearAll();
  }, [clearAll]);

  const handleItemPress = useCallback((id) => {
    markAsRead(id);
  }, [markAsRead]);

  const renderItem = useCallback(({ item, index }) => (
    <>
      <NotificationItem item={item} onPress={handleItemPress} />
      {index < notifications.length - 1 && <View style={styles.separator} />}
    </>
  ), [handleItemPress, notifications.length]);

  // "You're all caught up" is a claim, and an empty list offline does not
  // support it - the notifications are on the account, unread, and simply were
  // not fetched. Saying the opposite is how a missed budget or safety alert
  // gets read as no alert at all.
  const renderEmpty = useMemo(() => (
    showOfflineState ? (
      <OfflineState
        compact
        style={styles.offline}
        title="Can't load your notifications"
        body="They are stored on your account and need a connection to read. Any you have not seen are still there."
      />
    ) : (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyIcon}>🔔</Text>
        <Text style={styles.emptyTitle}>No Notifications</Text>
        <Text style={styles.emptySub}>You&apos;re all caught up!</Text>
      </View>
    )
  ), [showOfflineState]);

  // "All read" is the same claim as "You're all caught up!" in miniature, and
  // an unread count that never arrived cannot support it. With nothing read,
  // the header says how much it knows, which is nothing.
  const renderHeader = useMemo(() => (
    <View style={styles.listHeader}>
      <Text style={styles.listHeaderText}>
        {unreadKnown
          ? (unreadCount > 0 ? `${unreadCount} unread` : 'All read')
          : 'Not loaded'}
      </Text>
      {notifications.length > 0 && (
        <TouchableOpacity onPress={handleClearAll} activeOpacity={0.7}>
          <Text style={styles.clearAllText}>Clear All</Text>
        </TouchableOpacity>
      )}
    </View>
  ), [unreadCount, unreadKnown, notifications.length, handleClearAll]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity
          style={styles.backdrop}
          onPress={onClose}
          activeOpacity={1}
        />
        <View style={[styles.panel, { width, height: height * 0.75 }]}>
          <SafeAreaView edges={['bottom']} style={styles.safeArea}>
            {/* Handle Bar */}
            <View style={styles.handleBar} />

            {/* Panel Header */}
            <View style={styles.panelHeader}>
              <View style={styles.panelTitleRow}>
                <Text style={styles.panelTitle}>Notifications</Text>
                {unreadCount > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{unreadCount}</Text>
                  </View>
                )}
              </View>
              <View style={styles.panelActions}>
                {unreadCount > 0 && (
                  <TouchableOpacity
                    onPress={handleMarkAllRead}
                    activeOpacity={0.7}
                    style={styles.markReadBtn}
                  >
                    <Text style={styles.markReadText}>Mark all read</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
                  <Text style={styles.closeBtn}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Notification List */}
            <FlatList
              data={notifications}
              keyExtractor={(item, index) => index.toString()}
              renderItem={renderItem}
              ListEmptyComponent={renderEmpty}
              ListHeaderComponent={renderHeader}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.listContent}
            />
          </SafeAreaView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  panel: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  safeArea: {
    flex: 1,
  },
  handleBar: {
    width: 40,
    height: 4,
    backgroundColor: COLORS.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  panelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  panelTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  panelTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  badge: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.white,
  },
  panelActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  markReadBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: COLORS.primary + '15',
  },
  markReadText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.primary,
  },
  closeBtn: {
    fontSize: 18,
    color: COLORS.textLight,
    padding: 4,
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  listHeaderText: {
    fontSize: 12,
    color: COLORS.textLight,
    fontWeight: '500',
  },
  clearAllText: {
    fontSize: 12,
    color: '#EF4444',
    fontWeight: '600',
  },
  listContent: {
    flexGrow: 1,
    backgroundColor: COLORS.white,
    marginHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  separator: {
    height: 1,
    backgroundColor: COLORS.border,
    marginLeft: 70,
  },
  offline: {
    margin: 20,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
  },
  emptySub: {
    fontSize: 13,
    color: COLORS.textLight,
  },
});

export default NotificationPanel;