import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const firebaseConfigured = Object.values(firebaseConfig).every(Boolean);
const app = firebaseConfigured
  ? getApps().length
    ? getApp()
    : initializeApp(firebaseConfig)
  : null;

// This project has no separate local database/sync engine — Firestore's
// OWN built-in persistent cache (IndexedDB-backed, since Firebase v9.9)
// IS the offline layer: every `onSnapshot` listener already used
// throughout this app (subscribeProducts, subscribeMyAttendance, etc.)
// serves instantly from this cache when offline and reconciles
// automatically the moment the network returns — no custom sync code
// needed. Enabling it here, once, at the single shared `db` instance
// every other file already imports, is the entire "offline-first" change;
// it is not a second database. `persistentMultipleTabManager` lets it
// keep working correctly if the student has the dashboard open in more
// than one tab. Only ever runs in the browser — IndexedDB doesn't exist
// during server-side rendering, and this `db` export is never used from
// server code in this app anyway (server routes use lib/firebase-admin.js).
function createFirestore(firebaseApp) {
  if (typeof window === "undefined") return getFirestore(firebaseApp);
  try {
    return initializeFirestore(firebaseApp, {
      experimentalAutoDetectLongPolling: true,
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch (error) {
    // initializeFirestore throws if a Firestore instance for this app was
    // already created elsewhere (e.g. Fast Refresh re-evaluating this
    // module) — falling back to the already-initialized instance instead
    // of crashing the app.
    console.warn("[firebase] Falling back to default Firestore instance", error?.code || error?.message);
    return getFirestore(firebaseApp);
  }
}

export const auth = app ? getAuth(app) : null;
export const db = app ? createFirestore(app) : null;
export const storage = app ? getStorage(app) : null;
