import { auth } from "../firebase";

async function request(options = {}) {
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new Error("Your session has expired. Please sign in again.");
  const response = await fetch("/api/admin/assignment-portal", {
    ...options,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...options.headers },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || "Unable to load assignments. Please try again.");
  return payload;
}

export const loadAssignmentPortal = () => request();
export const recordAssignmentSubmission = (submission) => request({ method: "POST", body: JSON.stringify(submission) });
export const createStandardAssignments = (courseId) => request({ method: "POST", body: JSON.stringify({ action: "setup", courseId }) });
