"use client";

import { auth } from "./firebase";

// Client service for the LMS Documents module. Every call is an
// authenticated request to /api/documents — there is no direct Firestore
// access, so document visibility is decided in exactly one place
// (lib/server/documents-core.js) against the real signed-in user.
async function request(path, options = {}) {
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new Error("Your session has expired. Please sign in again.");
  const response = await fetch(path, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Unable to complete this request. Please try again.");
  return data;
}

const jsonRequest = (path, options = {}) =>
  request(path, { ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) } });

export const loadDocuments = () => request("/api/documents");

// Same cached-promise pattern as lib/services/training-service.js's
// loadTraining — a prefetch fired from app/dashboard/[role]/page.jsx as
// soon as the dashboard mounts, so DocumentsModule's own load-on-mount
// reuses the same in-flight/completed request instead of firing it twice.
// `force: true` (used after upload/edit/delete/folder mutations) always
// fetches fresh.
let cachedDocuments = null;
export function loadDocumentsCached({ force = false } = {}) {
  if (!cachedDocuments || force) {
    cachedDocuments = loadDocuments().catch((error) => {
      cachedDocuments = null; // don't cache a failure — the next call should retry for real
      throw error;
    });
  }
  return cachedDocuments;
}
export function prefetchDocuments() {
  loadDocumentsCached().catch(() => {});
}

export function createDocument(meta, file) {
  const form = new FormData();
  form.append("meta", JSON.stringify(meta));
  if (file) form.append("file", file);
  return request("/api/documents", { method: "POST", body: form });
}

export function updateDocument(id, meta, file) {
  if (file) {
    const form = new FormData();
    form.append("meta", JSON.stringify({ ...meta, id }));
    form.append("file", file);
    return request("/api/documents", { method: "PATCH", body: form });
  }
  return jsonRequest("/api/documents", { method: "PATCH", body: JSON.stringify({ ...meta, id }) });
}

export const deleteDocument = (id) => jsonRequest("/api/documents", { method: "DELETE", body: JSON.stringify({ id }) });

// Streams a document's file through the authorised endpoint and returns a
// short-lived in-browser object URL — used by the in-LMS PDF/image viewer.
// The raw Firebase Storage URL is never exposed to the student; the caller
// must URL.revokeObjectURL(url) when the viewer closes.
export async function fetchDocumentBlobUrl(id) {
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new Error("Your session has expired. Please sign in again.");
  const response = await fetch(`/api/documents/file/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "Unable to open this document.");
  }
  const blob = await response.blob();
  return { url: URL.createObjectURL(blob), type: blob.type || "" };
}

export const createFolder = (name) => jsonRequest("/api/documents/folders", { method: "POST", body: JSON.stringify({ name }) });
export const renameFolder = (id, name) => jsonRequest("/api/documents/folders", { method: "PATCH", body: JSON.stringify({ id, name }) });
export const deleteFolder = (id) => jsonRequest("/api/documents/folders", { method: "DELETE", body: JSON.stringify({ id }) });

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------
export const AUDIENCE_LABELS = {
  all_students: "All students",
  course: "Course",
  class: "Class / Batch",
  student: "Specific student",
  teachers: "Teachers",
  facilitators: "Facilitators",
  staff: "Director / Admin",
};

export function formatFileSize(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function fileKind(mimeType, fileName = "") {
  const type = (mimeType || "").toLowerCase();
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  if (type.includes("pdf") || ext === "pdf") return "PDF";
  if (type.includes("word") || ["doc", "docx"].includes(ext)) return "DOC";
  if (type.includes("presentation") || type.includes("powerpoint") || ["ppt", "pptx"].includes(ext)) return "PPT";
  if (type.includes("spreadsheet") || type.includes("excel") || ["xls", "xlsx", "csv"].includes(ext)) return "XLS";
  if (type.startsWith("image/")) return "IMG";
  if (type.includes("zip") || ext === "zip") return "ZIP";
  if (type.startsWith("text/") || ext === "txt") return "TXT";
  return "FILE";
}

export function formatDocDate(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}
