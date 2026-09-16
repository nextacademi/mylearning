import { auth } from "../firebase";
async function request(options = {}) { const token = await auth?.currentUser?.getIdToken(); if (!token) throw new Error("Your session has expired. Please sign in again."); const response = await fetch("/api/admin/training", { ...options, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...options.headers } }); const payload = await response.json(); if (!response.ok) throw new Error(payload.message || "Unable to load training data. Please try again."); return payload; }

// A single shared in-flight/last-completed GET promise — so a prefetch
// fired the moment the dashboard mounts (prefetchTraining, called from
// app/dashboard/[role]/page.jsx before the user has even clicked
// "Training") and TrainingManagement's own load-on-mount both resolve
// from the SAME network call instead of firing it twice. Perceived-speed
// only: by the time the user opens the tab, the request is often already
// done. `force: true` (used after create/update) always fetches fresh.
let cachedTraining = null;
export function loadTraining({ force = false } = {}) {
  if (!cachedTraining || force) {
    cachedTraining = request().catch((error) => {
      cachedTraining = null; // don't cache a failure — the next call should retry for real
      throw error;
    });
  }
  return cachedTraining;
}
export function prefetchTraining() {
  loadTraining().catch(() => {});
}
export const createCourse = (course) => request({ method: "POST", body: JSON.stringify(course) });
export const updateCourse = (course) => request({ method: "PATCH", body: JSON.stringify(course) });
