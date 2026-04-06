// TODO: Expand when backend is ready

export const formatNotificationTime = (timestamp) => {
  // TODO: Format Firebase timestamp
  return '--:--';
};

export const formatNotificationDate = (timestamp) => {
  // TODO: Format Firebase timestamp
  return '-- --- ----';
};

export const getNotificationIcon = (type) => {
  switch (type) {
    case 'high_usage': return '⚡';
    case 'warning': return '⚠️';
    case 'cutoff': return '🔴';
    case 'budget': return '💰';
    case 'schedule': return '⏱️';
    case 'device': return '🔌';
    default: return '🔔';
  }
};

export const getNotificationColor = (type) => {
  switch (type) {
    case 'high_usage': return '#F59E0B';
    case 'warning': return '#F97316';
    case 'cutoff': return '#EF4444';
    case 'budget': return '#8B5CF6';
    case 'schedule': return '#10B981';
    case 'device': return '#3B82F6';
    default: return '#6B7280';
  }
};