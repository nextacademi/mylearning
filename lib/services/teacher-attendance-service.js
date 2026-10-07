import { auth } from "../firebase";

async function request(path = "", options = {}) {
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new Error("Your session has expired. Please sign in again.");
  const response = await fetch(`/api/teacher-attendance${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Unable to load teacher attendance.");
  return data;
}

// { courseId } → one training's teacher records; { teacherId } → one
// teacher across every training; neither → everything (Admin/Director).
export function loadTeacherAttendance({ courseId, teacherId } = {}) {
  const params = new URLSearchParams();
  if (courseId) params.set("courseId", courseId);
  if (teacherId) params.set("teacherId", teacherId);
  const query = params.toString();
  return request(query ? `?${query}` : "").then((data) => data.records || []);
}

export const markTeacherAttendance = (body) => request("", { method: "POST", body: JSON.stringify(body) });
