"use client";

import { collection, doc, onSnapshot, query, updateDoc, where } from "firebase/firestore";
import { updateProfile as updateAuthProfile } from "firebase/auth";
import { getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";
import { auth, db, storage } from "./firebase";

// Role-agnostic self-profile write — every field it's ever called with is
// one the Firestore rule's self-update guard already permits (it only
// blocks uid/role/teacherIds/active/qrVersion). Kept separate from
// lib/teacher-data.js's updateTeacherProfile so the still-working, still
// reachable /teacher/profile route is never touched by this change.
//
// Also mirrors displayName/photoURL onto the Firebase Auth user record
// itself (not just the Firestore doc) when they're part of this write —
// auth.currentUser.displayName/photoURL otherwise never change after
// signup, which is stale wherever something reads the raw Auth user
// instead of the Firestore profile (e.g. Firebase's own account picker,
// any future integration reading auth.currentUser directly). Best-effort:
// never blocks the real Firestore save if this secondary sync fails.
export async function updateMyProfile(uid, fields) {
  if (!db) throw new Error("Firebase is not configured.");
  await updateDoc(doc(db, "users", uid), fields);
  if (auth?.currentUser?.uid === uid && ("displayName" in fields || "photoURL" in fields)) {
    try {
      await updateAuthProfile(auth.currentUser, {
        ...("displayName" in fields ? { displayName: fields.displayName || null } : {}),
        ...("photoURL" in fields ? { photoURL: fields.photoURL || null } : {}),
      });
    } catch {
      // Non-fatal — the Firestore profile (the source of truth this app
      // actually reads everywhere) already saved successfully above.
    }
  }
}

// Direct profile-photo upload — same "upload the file to Firebase Storage,
// then save its download URL onto the doc" flow lib/teacher-training.js
// already uses for course thumbnails. Storage path users/{uid}/avatar/…
// is authorized purely by `request.auth.uid == uid` in storage.rules (no
// broken cross-service role lookup), so the client can upload directly.
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function validateAvatarFile(file) {
  if (!file) return "Choose an image file.";
  if (!ALLOWED_AVATAR_TYPES.includes(file.type)) return "Use a JPG, PNG, or WEBP image.";
  if (file.size > MAX_AVATAR_BYTES) return "That image is too large — the limit is 5 MB.";
  return "";
}

// A Storage bucket that was never provisioned for this Firebase project
// (Console → Storage → "Get Started" never clicked) doesn't reject quickly —
// the SDK just keeps retrying the upload with no error surfaced, so without
// a hard timeout here the caller's "Uploading photo..." button would stay
// stuck forever with no way to recover short of a page reload. 20s is
// generous for a <=5MB image on any real connection; if it's not done by
// then, something is actually wrong and the caller should see that as an
// error, not silence.
const UPLOAD_TIMEOUT_MS = 20000;

function withTimeout(promise, ms, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}

export async function uploadProfilePhoto(uid, file) {
  if (!storage) throw new Error("File storage is not configured.");
  if (!uid) throw new Error("Your session has expired. Please sign in again.");
  const invalid = validateAvatarFile(file);
  if (invalid) throw new Error(invalid);
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `users/${uid}/avatar/${Date.now()}.${ext}`;
  const objectRef = storageRef(storage, path);
  await withTimeout(
    uploadBytes(objectRef, file, { contentType: file.type }),
    UPLOAD_TIMEOUT_MS,
    "Photo upload timed out. File storage may not be set up for this project yet — try again shortly, or contact an admin.",
  );
  const photoURL = await withTimeout(getDownloadURL(objectRef), UPLOAD_TIMEOUT_MS, "Could not retrieve the uploaded photo's URL. Please try again.");
  return { photoURL, photoPath: path };
}

// Deletes the caller's own account (Auth user + Firestore profile) via
// /api/profile/delete-account — see that route for why this can't be a
// direct client-side Firestore delete. Historical records (enrollments,
// submissions, certificates, ...) are left untouched, same as an
// admin-initiated deletion elsewhere in this app.
export async function deleteMyAccount() {
  if (!auth?.currentUser) throw new Error("Your session has expired. Please sign in again.");
  const token = await auth.currentUser.getIdToken();
  const response = await fetch("/api/profile/delete-account", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Unable to delete your account.");
  return data;
}

function ordered(snapshot) {
  return snapshot.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .sort((a, b) => String(b.issueDate?.toMillis?.() || "").localeCompare(String(a.issueDate?.toMillis?.() || "")));
}

// First code to exercise the "read my own certificate" branch the
// certificates rule already grants (resource.data.studentId == auth.uid) —
// certificates are only ever issued by a Teacher to a Student, so this
// naturally returns empty for every non-Student role.
export function subscribeMyCertificates(uid, onData, onError) {
  if (!db || !uid) return () => {};
  return onSnapshot(
    query(collection(db, "certificates"), where("studentId", "==", uid)),
    (snapshot) => onData(ordered(snapshot)),
    (error) => onError?.(error),
  );
}
