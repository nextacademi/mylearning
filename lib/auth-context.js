"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  createUserWithEmailAndPassword,
  FacebookAuthProvider,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db, firebaseConfigured } from "./firebase";

export const ROLES = [
  "Guest",
  "Student",
  "Volunteer",
  "Facilitator",
  "Teacher",
  "Director",
  "Admin",
];
const AuthContext = createContext(null);

function readableError(error) {
  const messages = {
    "auth/invalid-credential": "The email or password is incorrect.",
    "auth/email-already-in-use":
      "An account already exists for this email. Please login instead.",
    "auth/weak-password": "Use a password with at least six characters.",
    "auth/popup-closed-by-user": "The sign-in window was closed.",
    "auth/unauthorized-domain":
      "Add this domain to Firebase Authentication settings.",
    "auth/email-not-verified": "Please verify your email before logging in.",
    "auth/too-many-requests":
      "Too many attempts. Please wait a moment before trying again.",
    "auth/invalid-action-code":
      "This verification link is invalid or has already been used.",
    "auth/expired-action-code":
      "This verification link has expired. Please request a new one.",
    "auth/user-disabled": "This account has been disabled.",
  };
  return (
    messages[error?.code] ||
    error?.message ||
    "Authentication failed. Please try again."
  );
}

// Firebase's standard email-verification LINK flow (replaces the old
// custom 6-digit OTP system). `handleCodeInApp: true` + this `url` means
// clicking the emailed link brings the user back to THIS app's own
// /verify-email route (instead of Firebase's generic hosted page), where
// applyActionCode() finishes the verification — see app/verify-email.
// Built lazily (never at module load) from NEXT_PUBLIC_BASE_URL so the
// link always points at whichever domain is configured for the current
// deployment (local dev, the Firebase App Hosting domain, or a future
// custom domain) purely via env config — falls back to the browser's own
// origin only if that var is ever left unset.
function verificationActionCodeSettings() {
  const base = process.env.NEXT_PUBLIC_BASE_URL || window.location.origin;
  return {
    url: `${base}/verify-email`,
    handleCodeInApp: true,
  };
}

// Only the Admin SDK can safely mint a User ID (the `_userIds` uniqueness
// registry is denied to client writes by Firestore rules), so every
// self-registered account's unified User ID is assigned here via a
// self-scoped server endpoint right after their profile exists — for
// every role, not just Student. Best-effort: a failure here must never
// block sign-in — the same call retries on the account's next login until
// it succeeds.
async function ensureUserId(user) {
  try {
    const token = await user.getIdToken();
    const response = await fetch("/api/auth/ensure-user-id", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();
    return response.ok ? data.userId : null;
  } catch {
    return null;
  }
}

async function createProfile(user, role = "Guest") {
  if (!db) return { uid: user.uid, role };
  const profileRef = doc(db, "users", user.uid);
  const existing = await getDoc(profileRef);
  if (!existing.exists()) {
    // Every self-registered account starts as "Guest" — active immediately,
    // no approval gate, no dashboard blocked. Guest is deliberately
    // low-privilege (see roleConfig.Guest in app/dashboard/[role]/page.jsx)
    // rather than gated; a Guest becomes a "Student" automatically the
    // moment they're enrolled in a training (lib/server/enrollment-core.js)
    // or a Director/Admin promotes them by hand via the Users screen.
    const status = "active";
    await setDoc(profileRef, {
      uid: user.uid,
      email: user.email || "",
      displayName: user.displayName || "",
      photoURL: user.photoURL || "",
      role,
      status,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    const userId = await ensureUserId(user);
    return { uid: user.uid, role, status, ...(userId ? { userId } : {}) };
  }
  const data = existing.data();
  if (!data.userId) {
    const userId = await ensureUserId(user);
    if (userId) return { uid: user.uid, ...data, userId };
  }
  return { uid: user.uid, ...data };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(Boolean(auth));
  const [error, setError] = useState("");

  useEffect(() => {
    if (!auth) {
      return undefined;
    }
    return onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      if (nextUser) {
        try {
          setProfile(await createProfile(nextUser));
        } catch (profileError) {
          setError(readableError(profileError));
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
  }, []);

  const actions = useMemo(
    () => ({
      clearError: () => setError(""),
      // Re-read the current user's own Firestore profile doc into context —
      // used after an in-app profile edit (e.g. a new avatar) so every
      // component reading `useAuth().profile` picks up the change without a
      // reload. Does not touch auth state / tokens / roles.
      async refreshProfile() {
        if (!auth?.currentUser || !db) return null;
        try {
          const snapshot = await getDoc(doc(db, "users", auth.currentUser.uid));
          const next = snapshot.exists()
            ? { uid: auth.currentUser.uid, ...snapshot.data() }
            : null;
          setProfile(next);
          return next;
        } catch {
          return null;
        }
      },
      async register(email, password, displayName) {
        setError("");
        if (!auth)
          throw new Error(
            "Firebase is not configured. Add values to .env.local.",
          );
        try {
          const result = await createUserWithEmailAndPassword(
            auth,
            email,
            password,
          );
          if (displayName) await updateProfile(result.user, { displayName });
          const nextProfile = await createProfile({
            ...result.user,
            displayName: displayName || result.user.displayName,
          });
          setProfile(nextProfile);
          // Send the Firebase verification link right away. Best-effort: the
          // account and profile already exist at this point, and the
          // /verify-email page the caller navigates to next has its own
          // "Resend" button, so a transient send failure here never leaves
          // the user stuck.
          try {
            await sendEmailVerification(result.user, verificationActionCodeSettings());
          } catch {
            // Ignored — resend is available on /verify-email.
          }
          return result.user;
        } catch (authError) {
          setError(readableError(authError));
          throw authError;
        }
      },
      async login(email, password) {
        setError("");
        if (!auth)
          throw new Error(
            "Firebase is not configured. Add values to .env.local.",
          );
        try {
          const result = await signInWithEmailAndPassword(
            auth,
            email,
            password,
          );
          return {
            user: result.user,
            requiresVerification: !result.user.emailVerified,
          };
        } catch (authError) {
          setError(readableError(authError));
          throw authError;
        }
      },
      async socialLogin(providerName) {
        setError("");
        if (!auth)
          throw new Error(
            "Firebase is not configured. Add values to .env.local.",
          );
        const provider =
          providerName === "google"
            ? new GoogleAuthProvider()
            : new FacebookAuthProvider();
        try {
          const result = await signInWithPopup(auth, provider);
          await createProfile(result.user);
          return result.user;
        } catch (authError) {
          setError(readableError(authError));
          throw authError;
        }
      },
      async resetPassword(email) {
        setError("");
        if (!auth)
          throw new Error(
            "Firebase is not configured. Add values to .env.local.",
          );
        try {
          await sendPasswordResetEmail(auth, email);
        } catch (authError) {
          setError(readableError(authError));
          throw authError;
        }
      },
      // Sends (or re-sends) Firebase's standard verification link to the
      // signed-in user — replaces the old custom 6-digit OTP email.
      async sendVerificationEmail() {
        if (!auth?.currentUser)
          throw new Error("Sign in to request a verification email.");
        setError("");
        try {
          await sendEmailVerification(
            auth.currentUser,
            verificationActionCodeSettings(),
          );
        } catch (authError) {
          const message = readableError(authError);
          setError(message);
          throw new Error(message);
        }
      },
      // `await user.reload()` then read `user.emailVerified` straight off
      // the (same, now up-to-date) Firebase user object — the object is
      // mutated in place by reload(), so every existing place that reads
      // `useAuth().user.emailVerified` (AuthGate, the dashboard route) sees
      // the fresh value on its next render without any other change.
      async checkEmailVerified() {
        if (!auth?.currentUser) return false;
        await auth.currentUser.reload();
        setUser(auth.currentUser);
        return auth.currentUser.emailVerified;
      },
      async logout() {
        if (auth) await signOut(auth);
      },
    }),
    [],
  );

  return (
    <AuthContext.Provider
      value={{ user, profile, loading, error, firebaseConfigured, ...actions }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
