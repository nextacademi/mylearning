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

// Student side (the shared link)
export const loadFormToFill = (id) => request(`/api/forms/${id}`);
export const submitForm = (id, answers) => request(`/api/forms/${id}`, { method: "POST", body: JSON.stringify({ answers }) });
