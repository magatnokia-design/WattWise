// Auth State Handler
import { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../services/firebase/config';
import { initializationService } from '../services/firebase/initializationService';

// Repair runs once per account per app session. initializationService also
// de-duplicates concurrent calls, since several screens mount this hook.
const initializedUserIds = new Set();

export const useAuth = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);

      if (!nextUser?.uid || initializedUserIds.has(nextUser.uid)) return;
      initializedUserIds.add(nextUser.uid);

      // Fire and forget: a half-built account is repaired in the background so
      // sign-in is never blocked on it, and a failure here must not sign
      // the user out.
      initializationService
        .ensureUserInitialized(nextUser.uid, {
          name: nextUser.displayName || '',
          email: nextUser.email || '',
        })
        .catch((error) => {
          console.error('Account initialization check failed:', error);
        });
    });

    // Cleanup listener on unmount
    return () => unsubscribe();
  }, []);

  return { user, loading };
};
