import { auth } from "../firebase";

async function request(path = "", options = {}) {
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new Error("Your session has expired. Please sign in again.");
  const response = await fetch(`/api/admin/teacher-assignments${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Unable to manage teacher assignments.");
  return data;
}

export const loadTeacherAssignmentData = () => request();

// Same cached-promise pattern as lib/services/training-service.js's
// loadTraining — a prefetch fired from app/dashboard/[role]/page.jsx as
// soon as the dashboard mounts, so TeacherAssignment's own load-on-mount
// reuses the same in-flight/completed request instead of firing twice.
// `force: true` (used after every assign/remove/save mutation) always
// fetches fresh.
let cachedTeacherAssignmentData = null;
export function loadTeacherAssignmentDataCached({ force = false } = {}) {
  if (!cachedTeacherAssignmentData || force) {
    cachedTeacherAssignmentData = request().catch((error) => {
      cachedTeacherAssignmentData = null; // don't cache a failure — the next call should retry for real
      throw error;
    });
  }
  return cachedTeacherAssignmentData;
}
export function prefetchTeacherAssignments() {
  loadTeacherAssignmentDataCached().catch(() => {});
}

// Legacy whole-array replace — still used by the AI assistant executor.
export const saveTeacherAssignment = (data) => request("", { method: "PATCH", body: JSON.stringify(data) });

// Single-teacher operations for the Teacher Assignment UI.
export const assignTeacher = ({ type, id, teacherId }) =>
  request("", { method: "PATCH", body: JSON.stringify({ type, id, action: "assign", teacherId }) });

export const removeTeacher = ({ type, id, teacherId }) =>
  request("", { method: "PATCH", body: JSON.stringify({ type, id, action: "remove", teacherId }) });
