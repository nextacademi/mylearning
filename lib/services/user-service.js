import { auth } from "../firebase";

async function userApi(options = {}) {
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new Error("Your session has expired. Please sign in again.");
  const response = await fetch("/api/admin/users", {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.message || "Unable to load users. Please try again.");
  }
  return payload;
}

export const loadUsers = () => userApi();

// Same cached-promise pattern as lib/services/training-service.js's
// loadTraining — a prefetch fired from app/dashboard/[role]/page.jsx as
// soon as the dashboard mounts, so UserManagement's own load-on-mount
// reuses the same in-flight/completed request instead of firing it twice.
// `force: true` (used after a role change or account deletion) always
// fetches fresh.
let cachedUsers = null;
export function loadUsersCached({ force = false } = {}) {
  if (!cachedUsers || force) {
    cachedUsers = loadUsers().catch((error) => {
      cachedUsers = null; // don't cache a failure — the next call should retry for real
      throw error;
    });
  }
  return cachedUsers;
}
export function prefetchUsers() {
  loadUsersCached().catch(() => {});
}
export const changeUserRole = (uid, role) =>
  userApi({ method: "PATCH", body: JSON.stringify({ uid, role }) });
export const deleteUserAccount = (uid) =>
  userApi({ method: "DELETE", body: JSON.stringify({ uid }) });
