"use client";

import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db, auth } from "./firebase";

async function request(path, options = {}) {
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new Error("Your session has expired. Please sign in again.");
  const response = await fetch(path, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...options.headers },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Unable to complete this request. Please try again.");
  return data;
}

// A student's own awards — permitted directly via the existing
// `achievements` rule (resource.data.studentId == request.auth.uid), same
// collection Teacher's manual "Award" flow and the automatic
// course-completion flow both already write to.
export function subscribeMyAchievements(uid, onData, onError) {
  if (!db || !uid) return () => {};
  return onSnapshot(
    query(collection(db, "achievements"), where("studentId", "==", uid)),
    (snapshot) => onData(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
    (error) => onError?.(error),
  );
}

// A student's own certificates — see lib/teacher-data.js's
// subscribeMyCertificates for the original (kept there since Settings
// already imports it); this is the same query, exposed from the
// Achievement module's own data file too so StudentAchievements.jsx
// doesn't need to import from lib/teacher-data.js.
export function subscribeMyCertificates(uid, onData, onError) {
  if (!db || !uid) return () => {};
  return onSnapshot(
    query(collection(db, "certificates"), where("studentId", "==", uid)),
    (snapshot) => onData(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
    (error) => onError?.(error),
  );
}

// Active certificate templates only — used by Course Create/Edit's
// Certificate Settings template picker (any signed-in Teacher/Admin can
// read templates directly per firestore.rules).
export function subscribeActiveCertificateTemplates(onData, onError) {
  if (!db) return () => {};
  return onSnapshot(
    query(collection(db, "certificateTemplates"), where("status", "==", "active")),
    (snapshot) => onData(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
    (error) => onError?.(error),
  );
}

export const loadTemplates = () => request("/api/admin/achievement/templates");
export const loadGeneratedCertificates = () => request("/api/admin/achievement/certificates");
export const loadAwards = () => request("/api/admin/achievement/awards");

// Same cached-promise pattern as lib/services/training-service.js's
// loadTraining — a prefetch fired from app/dashboard/[role]/page.jsx as
// soon as the dashboard mounts, so AchievementManagement's own
// load-on-mount reuses the same in-flight/completed requests instead of
// firing them twice. `force: true` (used after any template/certificate/
// award mutation) always fetches fresh.
let cachedAchievementOverview = null;
export function loadAchievementOverview({ force = false } = {}) {
  if (!cachedAchievementOverview || force) {
    cachedAchievementOverview = Promise.all([loadTemplates(), loadGeneratedCertificates(), loadAwards()]).catch((error) => {
      cachedAchievementOverview = null; // don't cache a failure — the next call should retry for real
      throw error;
    });
  }
  return cachedAchievementOverview;
}
export function prefetchAchievements() {
  loadAchievementOverview().catch(() => {});
}
export const createTemplate = (data) => request("/api/admin/achievement/templates", { method: "POST", body: JSON.stringify(data) });
export const updateTemplate = (data) => request("/api/admin/achievement/templates", { method: "PATCH", body: JSON.stringify(data) });
export const deleteTemplate = (id) => request("/api/admin/achievement/templates", { method: "DELETE", body: JSON.stringify({ id }) });

export async function uploadTemplateBackground(templateId, file) {
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new Error("Your session has expired. Please sign in again.");
  const form = new FormData();
  form.set("templateId", templateId);
  form.set("file", file);
  const response = await fetch("/api/admin/achievement/templates/image", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Unable to upload the certificate background.");
  return data;
}

export const revokeGeneratedCertificate = (id) => request("/api/admin/achievement/certificates", { method: "PATCH", body: JSON.stringify({ id, action: "revoke" }) });
export const reissueGeneratedCertificate = (id) => request("/api/admin/achievement/certificates", { method: "PATCH", body: JSON.stringify({ id, action: "reissue" }) });

export const createAward = (data) => request("/api/admin/achievement/awards", { method: "POST", body: JSON.stringify(data) });
export const updateAward = (data) => request("/api/admin/achievement/awards", { method: "PATCH", body: JSON.stringify(data) });
export const revokeAward = (id) => request("/api/admin/achievement/awards", { method: "PATCH", body: JSON.stringify({ id, action: "revoke" }) });

export const certificatePdfUrl = (certificateId) => `/api/certificates/${certificateId}/pdf`;

export async function downloadCertificatePdf(certificateId) {
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new Error("Your session has expired. Please sign in again.");
  const response = await fetch(certificatePdfUrl(certificateId), { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "Unable to download the certificate.");
  }
  return response.blob();
}
