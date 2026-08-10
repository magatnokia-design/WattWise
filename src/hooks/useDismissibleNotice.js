import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * A banner the user can dismiss for good.
 *
 * Dismissal is stored on the device rather than in Firestore: it is a UI
 * preference about this phone's screen, not account state worth syncing, and
 * keeping it local means dismissing never waits on the network.
 *
 * Starts hidden and appears once storage has been read, so a previously
 * dismissed banner never flashes on screen during the async read.
 */
export const useDismissibleNotice = (key) => {
  const storageKey = `notice_dismissed_${key}`;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let active = true;

    AsyncStorage.getItem(storageKey)
      .then((value) => {
        if (active) setVisible(value !== 'true');
      })
      .catch(() => {
        // A storage failure should not suppress the warning it guards.
        if (active) setVisible(true);
      });

    return () => {
      active = false;
    };
  }, [storageKey]);

  const dismiss = useCallback(() => {
    setVisible(false);
    AsyncStorage.setItem(storageKey, 'true').catch(() => {
      // Dismissed for this session either way; it returns next launch.
    });
  }, [storageKey]);

  return { visible, dismiss };
};

export default useDismissibleNotice;
