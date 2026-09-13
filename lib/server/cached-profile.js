import "server-only";
import { cacheGet, cacheSet, cacheDel } from "../redis-cache";

// Every authenticated API route in this app (38 of them) independently runs
// `verifyIdToken` then `db.collection("users").doc(uid).get()` to load the
// caller's role/status before doing anything else — the single most-repeated
// Firestore read in the entire codebase, once per API call, for every user.
// This wraps that exact read with a short-lived Redis cache, keyed by uid,
// as a drop-in replacement: it returns the same {exists, data()} shape a
// real Firestore DocumentSnapshot has, so every call site keeps working
// completely unchanged (`.exists`, `.data()`).
const TTL_SECONDS = 45;
const keyFor = (uid) => `user-profile:${uid}`;

export async function getCachedUserSnapshot(db, uid) {
  const hit = await cacheGet(keyFor(uid));
  if (hit !== undefined) {
    return { exists: hit.exists, data: () => (hit.exists ? hit.profile : undefined) };
  }
  const snapshot = await db.collection("users").doc(uid).get();
  // JSON round-trip strips Firestore Timestamp class instances down to plain
  // {seconds,nanoseconds} objects before they hit Redis (Upstash stores
  // JSON) — deliberate, since nothing that reads this cached profile for
  // auth/role checks calls `.toDate()` on it; only role/active/status/
  // displayName/email/teacherIds ever get read off it.
  const profile = snapshot.exists ? JSON.parse(JSON.stringify(snapshot.data())) : null;
  await cacheSet(keyFor(uid), { exists: snapshot.exists, profile }, TTL_SECONDS);
  return snapshot;
}

// Called from every route that changes a user's role/active/status/
// teacherIds (the fields Firestore rules restrict to admin() only) so a
// permission change is reflected immediately instead of waiting out the
// 45s TTL. A self-service profile edit (avatar/displayName via the client
// SDK) never touches these fields, so it never needs to invalidate this
// cache — see firestore.rules' users/{userId} update rule.
export async function invalidateUserProfileCache(uid) {
  await cacheDel(keyFor(uid));
}
