import { auth } from "../firebase";

async function token() {
  const value = await auth?.currentUser?.getIdToken();
  if (!value) throw new Error("Your session has expired. Please sign in again.");
  return value;
}

async function request(options = {}, query = "") {
  const response = await fetch(`/api/admin/training-registrations${query}`, {
    ...options,
    headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Unable to complete this request.");
  return data;
}

async function fetchBlob(url) {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${await token()}` } });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "Unable to load the file.");
  }
  return response.blob();
}

export const loadRegistrations = () => request();
export const loadApprovalOptions = () => request({}, "?view=batches");
export const approveRegistration = (id, input) => request({ method: "POST", body: JSON.stringify({ ...input, action: "approve", id }) });
export const rejectRegistration = (id, reason) => request({ method: "POST", body: JSON.stringify({ action: "reject", id, reason }) });
export const sendRegistrationEmail = (id) => request({ method: "POST", body: JSON.stringify({ action: "send-email", id }) });
export const loadReceipt = (id) => fetchBlob(`/api/admin/training-registrations/${encodeURIComponent(id)}/receipt`);
export const loadInvoicePdf = (enrollmentId) => fetchBlob(`/api/admin/enrollments/${encodeURIComponent(enrollmentId)}/invoice`);
