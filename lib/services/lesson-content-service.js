"use client";

import { auth } from "../firebase";

// Client wrapper for training-module lesson video/PDF/document content —
// mirrors lib/documents-data.js exactly, for the same reason: file bytes
// only ever move through these two authenticated API routes, never direct
// Firestore/Storage access, so lib/server/lesson-content-core.js remains the
// single place access is decided.

export async function uploadLessonContent(courseId, moduleId, lessonId, file) {
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new Error("Your session has expired. Please sign in again.");
  const form = new FormData();
  form.append("courseId", courseId);
  form.append("moduleId", moduleId);
  form.append("lessonId", lessonId);
  form.append("file", file);
  const response = await fetch("/api/training/lesson-content", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Unable to upload this file. Please try again.");
  return data;
}

// Best-effort Storage cleanup — see the DELETE handler's comment in
// app/api/training/lesson-content/[lessonId]/route.js. Never throws: a
// failed cleanup should never block deleting the lesson doc itself.
export async function deleteLessonContent(courseId, moduleId, lessonId) {
  try {
    const token = await auth?.currentUser?.getIdToken();
    if (!token) return;
    const params = new URLSearchParams({ courseId, moduleId });
    await fetch(`/api/training/lesson-content/${encodeURIComponent(lessonId)}?${params}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    // Non-fatal — see comment above.
  }
}

// Streams a lesson's file through the authorised endpoint and returns a
// short-lived in-browser object URL — the raw Storage path is never exposed
// to the client. Caller must URL.revokeObjectURL(url) when done with it.
export async function fetchLessonContentBlobUrl(courseId, moduleId, lessonId) {
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new Error("Your session has expired. Please sign in again.");
  const params = new URLSearchParams({ courseId, moduleId });
  const response = await fetch(`/api/training/lesson-content/${encodeURIComponent(lessonId)}?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "Unable to open this lesson's content.");
  }
  const blob = await response.blob();
  return { url: URL.createObjectURL(blob), type: blob.type || "" };
}
