// No auth token anywhere in this file — the public landing page's booking
// widget is for visitors who haven't signed in (or even registered) yet,
// same as the Contact form next to it. See app/api/public/appointments.
async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Unable to complete this request. Please try again.");
  return data;
}

export const loadPublicBookableCourses = () => request("/api/public/appointments");
export const loadPublicBookedSlots = (date) => request(`/api/public/appointments?date=${encodeURIComponent(date)}`);
export const bookPublicAppointment = (data) => request("/api/public/appointments", { method: "POST", body: JSON.stringify(data) });
