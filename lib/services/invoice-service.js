import { auth } from "../firebase";
import { downloadPdf } from "./finance-service";

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

// Unified list — enrollment (course-fee) invoices + manual invoices — see
// lib/server/invoice-core.js's listAllInvoices for the merge logic.
export const loadInvoices = (studentId) => request(`/api/admin/invoices${studentId ? `?studentId=${encodeURIComponent(studentId)}` : ""}`);

// Same cached-promise pattern as lib/services/training-service.js's
// loadTraining — a prefetch fired from app/dashboard/[role]/page.jsx as
// soon as the dashboard mounts, so InvoicesTab's own load-on-mount reuses
// the same in-flight/completed request instead of firing it twice.
// `force: true` (used after create/update/cancel/record-payment) always
// fetches fresh. Only caches the unfiltered (no studentId) list.
let cachedInvoices = null;
export function loadInvoicesCached({ force = false } = {}) {
  if (!cachedInvoices || force) {
    cachedInvoices = loadInvoices().catch((error) => {
      cachedInvoices = null;
      throw error;
    });
  }
  return cachedInvoices;
}
export function prefetchInvoices() {
  loadInvoicesCached().catch(() => {});
}

export const createInvoice = (data) => request("/api/admin/invoices", { method: "POST", body: JSON.stringify(data) });
export const updateInvoice = (id, data) => request(`/api/admin/invoices/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(data) });
export const cancelInvoice = (id) => request(`/api/admin/invoices/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ action: "cancel" }) });
export const recordInvoicePayment = (id, payment) => request(`/api/admin/invoices/${encodeURIComponent(id)}/payment`, { method: "POST", body: JSON.stringify(payment) });

export const downloadManualInvoicePdf = (invoiceId) => downloadPdf(`/api/admin/invoices/${encodeURIComponent(invoiceId)}/pdf`);
