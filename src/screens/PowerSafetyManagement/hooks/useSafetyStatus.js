import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { safetyService } from '../../../services/firebase';
import { auth } from '../../../services/firebase/config';
import { areReadingsStale } from '../utils/safetyHelpers';

const STALE_CHECK_MS = 5000;

/**
 * Just the safety stage, for the status pill in the Outlets header.
 *
 * A listener on power_safety/settings and nothing else - none of usePowerSafety's
 * thresholds, alert history or load tracking. `loaded` is false until the first
 * snapshot, and the pill shows nothing until then rather than a "Safe" it has
 * not read.
 */
const useSafetyStatus = () => {
  const [stage, setStage] = useState('normal');
  const [lastReadingWriteMs, setLastReadingWriteMs] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    let unsubscribeSafety = null;
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (unsubscribeSafety) {
        unsubscribeSafety();
        unsubscribeSafety = null;
      }
      setLoaded(false);
      if (!user?.uid) return;

      unsubscribeSafety = safetyService.subscribeToSafetyData(
        user.uid,
        (data) => {
          setStage(data?.currentStage || 'normal');
          setLastReadingWriteMs(Number(data?.lastReadingWriteMs || 0));
          setNowMs(Date.now());
          setLoaded(true);
        },
        (error) => console.error('Safety status subscription error:', error)
      );
    });

    return () => {
      if (unsubscribeSafety) unsubscribeSafety();
      unsubscribeAuth();
    };
  }, []);

  // A Hub that goes quiet sends no snapshot, so staleness is re-asked on a clock.
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), STALE_CHECK_MS);
    return () => clearInterval(id);
  }, []);

  return {
    stage,
    stale: areReadingsStale(lastReadingWriteMs, nowMs),
    loaded,
  };
};

export default useSafetyStatus;
