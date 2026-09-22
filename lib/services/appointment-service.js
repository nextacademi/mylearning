import { auth } from "../firebase";

async function request(url, options = {}) {
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new Error("Your session has expired. Please sign in again.");
  const response = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...options.headers },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "Unable to complete this request.");
  return data;
}

export const loadAppointments = () => request("/api/appointments");
export const loadBookedSlots = (date) => request(`/api/appointments?date=${encodeURIComponent(date)}`);
export const bookAppointment = (data) => request("/api/appointments", { method: "POST", body: JSON.stringify(data) });
export const cancelAppointment = (id) => request("/api/appointments", { method: "PATCH", body: JSON.stringify({ id, action: "cancel" }) });
export const completeAppointment = (id) => request("/api/appointments", { method: "PATCH", body: JSON.stringify({ id, action: "complete" }) });
export const rescheduleAppointment = (id, { date, time }) => request("/api/appointments", { method: "PATCH", body: JSON.stringify({ id, action: "reschedule", date, time }) });
