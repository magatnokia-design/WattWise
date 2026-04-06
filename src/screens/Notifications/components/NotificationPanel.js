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
import { useNotifications } from '../hooks/useNotifications';

const NotificationPanel = ({ visible, onClose }) => {
  const { width, height } = useWindowDimensions();

  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    clearAll,
  } = useNotifications();

  const handleMarkAllRead = useCallback(() => {
    markAllAsRead();
    // TODO: Update Firebase when backend is ready
  }, [markAllAsRead]);

  const handleClearAll = useCallback(() => {
    clearAll();
    // TODO: Delete from Firebase when backend is ready
  }, [clearAll]);

  const handleItemPress = useCallback((id) => {
    markAsRead(id);
    // TODO: Update Firebase when backend is ready
  }, [markAsRead]);

  const renderItem = useCallback(({ item, index }) => (
    <>
      <NotificationItem item={item} onPress={handleItemPress} />
      {index < notifications.length - 1 && <View style={styles.separator} />}
    </>
  ), [handleItemPress, notifications.length]);

  const renderEmpty = useMemo(() => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyIcon}>🔔</Text>
      <Text style={styles.emptyTitle}>No Notifications</Text>
      <Text style={styles.emptySub}>You're all caught up!</Text>
    </View>
  ), []);

  const renderHeader = useMemo(() => (
    <View style={styles.listHeader}>
      <Text style={styles.listHeaderText}>
        {unreadCount > 0 ? `${unreadCount} unread` : 'All read'}
      </Text>
      {notifications.length > 0 && (
        <TouchableOpacity onPress={handleClearAll} activeOpacity={0.7}>
          <Text style={styles.clearAllText}>Clear All</Text>
        </TouchableOpacity>
      )}
    </View>
  ), [unreadCount, notifications.length, handleClearAll]);

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