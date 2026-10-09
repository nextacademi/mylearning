import { auth } from "../firebase";

async function request(url, options = {}) {
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new Error("Your session has expired. Please sign in again.");
  const response = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...options.headers },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Unable to complete this request. Please try again.");
  return data;
}
const json = (options = {}) => ({ ...options, headers: { "Content-Type": "application/json", ...options.headers } });

// Admin/Director event management
export const loadEvents = () => request("/api/admin/events");
export const createEvent = (event) => request("/api/admin/events", json({ method: "POST", body: JSON.stringify(event) }));
export const updateEvent = (event) => request("/api/admin/events", json({ method: "PATCH", body: JSON.stringify(event) }));
export const setEventPublished = (id, published) => request("/api/admin/events", json({ method: "PATCH", body: JSON.stringify({ id, published }) }));
export const deleteEvent = (id) => request(`/api/admin/events?id=${encodeURIComponent(id)}`, { method: "DELETE" });

export async function uploadEventBanner(eventId, file) {
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new Error("Your session has expired. Please sign in again.");
  const form = new FormData();
  form.set("eventId", eventId);
  form.set("file", file);
  const response = await fetch("/api/admin/events/banner", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Unable to upload the banner image.");
  return data;
}

// Participants + attendance (Admin/Director, or an organizer Teacher)
export const loadEventParticipants = (eventId) => request(`/api/admin/events/${encodeURIComponent(eventId)}/participants`);
export const addEventParticipant = (eventId, userId) => request(`/api/admin/events/${encodeURIComponent(eventId)}/participants`, json({ method: "POST", body: JSON.stringify({ userId }) }));
export const removeEventParticipant = (eventId, userId) => request(`/api/admin/events/${encodeURIComponent(eventId)}/participants?userId=${encodeURIComponent(userId)}`, { method: "DELETE" });
export const markEventAttendance = (eventId, userId, attendanceStatus) => request(`/api/admin/events/${encodeURIComponent(eventId)}/participants`, json({ method: "PATCH", body: JSON.stringify({ userId, attendanceStatus }) }));
// "Add walk-in": { userId } for an existing account, or { name, email, phone }
// for a guest, plus { eventRole, hours } — marked present with hours credited.
export const addEventWalkIn = (eventId, body) => request(`/api/admin/events/${encodeURIComponent(eventId)}/participants`, json({ method: "POST", body: JSON.stringify({ ...body, markPresent: true }) }));
// Change any of { attendanceStatus, eventRole, hours } for one participant.
export const updateEventParticipant = (eventId, userId, patch) => request(`/api/admin/events/${encodeURIComponent(eventId)}/participants`, json({ method: "PATCH", body: JSON.stringify({ userId, ...patch }) }));
// eventRole (optional): "Volunteer" checks the person in as a volunteer.
export const scanEventAttendance = (eventId, tokenValue, eventRole) => request(`/api/events/${encodeURIComponent(eventId)}/attendance/scan`, json({ method: "POST", body: JSON.stringify({ token: tokenValue, ...(eventRole ? { eventRole } : {}) }) }));

// Student/Volunteer/Facilitator self-service
export const registerForEvent = (eventId) => request("/api/events/register", json({ method: "POST", body: JSON.stringify({ eventId }) }));
export const cancelEventRegistration = (eventId) => request(`/api/events/register?eventId=${encodeURIComponent(eventId)}`, { method: "DELETE" });
