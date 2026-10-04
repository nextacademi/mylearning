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

// Admin / Director
export const loadForms = () => request("/api/admin/forms");
export const saveForm = (form) => request("/api/admin/forms", { method: "POST", body: JSON.stringify(form) });
export const setFormStatus = (id, status) => request("/api/admin/forms", { method: "PATCH", body: JSON.stringify({ id, status }) });
export const deleteForm = (id) => request("/api/admin/forms", { method: "DELETE", body: JSON.stringify({ id }) });
export const loadFormResponses = (id) => request(`/api/admin/forms/${id}/responses`);

// Public side (the shared link) — works signed in or out; a signed-in token is
// sent when there is one so the response is tied to the account.
async function publicRequest(url, options = {}) {
  const token = await auth?.currentUser?.getIdToken().catch(() => null);
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "Unable to complete this request.");
  return data;
}
export const loadFormToFill = (id) => publicRequest(`/api/forms/${id}`);
export const submitForm = (id, answers, who = {}) => publicRequest(`/api/forms/${id}`, { method: "POST", body: JSON.stringify({ answers, ...who }) });
