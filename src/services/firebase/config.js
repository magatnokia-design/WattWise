// Firebase Configuration
import { initializeApp, getApps, getApp } from "firebase/app";
import { initializeAuth, getAuth, getReactNativePersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: "AIzaSyD0jBN6PpEPyWuw1On83_T9BIXWhhCoqMo",
  authDomain: "wattwise-fe394.firebaseapp.com",
  projectId: "wattwise-fe394",
  storageBucket: "wattwise-fe394.firebasestorage.app",
  messagingSenderId: "421489842338",
  appId: "1:421489842338:web:8ff17e69503589123d1ffb"
};

// Reuse app/auth instances in Fast Refresh to avoid duplicate initialization issues.
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

let auth;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage)
  });
} catch (error) {
  auth = getAuth(app);
}

export { auth };

// Initialize Firestore
export const db = getFirestore(app);

// Initialize Cloud Functions (region: asia-southeast1)
export const functions = getFunctions(app, 'asia-southeast1');

export default app;