import { auth } from "../firebase";
export async function studentApi(path = "", options = {}) {
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new Error("Your session has expired. Please sign in again.");
  const response = await fetch(`/api/admin/students${path}`, { ...options, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...options.headers } });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "Unable to load students.");
  return payload;
}
export async function loadStudentDirectory() { const [directory, courseData] = await Promise.all([studentApi(), studentApi("?resource=courses")]); return { students: directory.students || [], courses: courseData.courses || [] }; }

// Same cached-promise pattern as lib/services/training-service.js's
// loadTraining — a prefetch fired from app/dashboard/[role]/page.jsx as
// soon as the dashboard mounts and StudentManagement's own load-on-mount
// resolve from the SAME request instead of firing it twice. `force: true`
// (used after create/update) always fetches fresh.
let cachedStudentDirectory = null;
export function loadStudentDirectoryCached({ force = false } = {}) {
  if (!cachedStudentDirectory || force) {
    cachedStudentDirectory = loadStudentDirectory().catch((error) => {
      cachedStudentDirectory = null; // don't cache a failure — the next call should retry for real
      throw error;
    });
  }
  return cachedStudentDirectory;
}
export function prefetchStudentDirectory() {
  loadStudentDirectoryCached().catch(() => {});
}
export const createStudent = (data) => studentApi("", { method: "POST", body: JSON.stringify(data) });
export const updateStudent = (data) => studentApi("", { method: "PATCH", body: JSON.stringify(data) });
