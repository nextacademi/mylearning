import { auth } from "../firebase";

async function request(path, options = {}) {
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new Error("Your session has expired. Please sign in again.");
  const response = await fetch(`/api/training-volunteers${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Unable to manage training volunteers.");
  return data;
}

export const loadTrainingVolunteers = (courseId, date) =>
  request(`?courseId=${encodeURIComponent(courseId)}${date ? `&date=${encodeURIComponent(date)}` : ""}`);
// body: { courseId, date, hours?, and one of userId | name/email/phone | token }
export const addTrainingVolunteer = (body) => request("", { method: "POST", body: JSON.stringify(body) });
export const updateTrainingVolunteerHours = (courseId, id, hours) => request("", { method: "PATCH", body: JSON.stringify({ courseId, id, hours }) });
export const removeTrainingVolunteer = (courseId, id) =>
  request(`?courseId=${encodeURIComponent(courseId)}&id=${encodeURIComponent(id)}`, { method: "DELETE" });
