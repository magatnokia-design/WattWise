/**
 * Just the safety stage, for the Dashboard's summary card.
 *
 * The card first used `usePowerSafety`, the Power Safety screen's hook. That
 * hook does considerably more than the card needs: on top of the document
 * listener it fetches the safety doc a second time, fetches and sorts the alert
 * history, and sets six pieces of state per snapshot - so every telemetry write
 * re-rendered the whole Dashboard, outlet cards and all, to update one word.
 * The Dashboard already carries its own outlet listener and a 6-second timer,
 * and stacking that on top made the Home tab visibly slow.
 *
 * One listener, one document, two values.
 */
import { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../../../services/firebase/config';
import { safetyService } from '../../../services/firebase';

export const useSafetyStage = () => {
  const [stage, setStage] = useState('normal');

  useEffect(() => {
    let unsubscribeSafety = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (unsubscribeSafety) {
        unsubscribeSafety();
        unsubscribeSafety = null;
      }

      if (!user?.uid) {
        setStage('normal');
        return;
      }

      unsubscribeSafety = safetyService.subscribeToSafetyData(
        user.uid,
        (safetyData) => {
          // Only re-render when the word on screen would actually change. The
          // document is rewritten every 15 seconds with fresh readings even
          // while the stage holds, and the card does not show those readings.
          setStage((previous) => (
            previous === safetyData.currentStage ? previous : safetyData.currentStage
          ));
        },
        (error) => {
          console.error('Safety stage subscription error:', error);
        }
      );
    });

    return () => {
      if (unsubscribeSafety) unsubscribeSafety();
      unsubscribeAuth();
    };
  }, []);

  return stage;
};

export default useSafetyStage;
