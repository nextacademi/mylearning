import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminStorage } from "../firebase-admin";

// ---------------------------------------------------------------------------
// Training Module/Lesson content — server core, mirroring
// lib/server/documents-core.js's pattern for the same reason: Storage Rules
// can't reliably run a cross-service Firestore lookup in this project (see
// storage.rules), so every upload/read goes through the Admin SDK here
// instead. Unlike Documents, lesson files are NEVER made public — there is
// no staff-only direct fileUrl at all; every role (including the owning
// Teacher/Admin previewing their own content) opens a file through
// getLessonFileForUser, so there is exactly one access path to reason about.
// ---------------------------------------------------------------------------

export const MANAGER_ROLES = new Set(["Admin", "Director"]);
export const MAX_LESSON_VIDEO_BYTES = 100 * 1024 * 1024; // 100 MB — same cap as lib/chat-media.js's existing video limit.
export const MAX_LESSON_DOCUMENT_BYTES = 25 * 1024 * 1024; // 25 MB — same cap as documents-core.js.

const VIDEO_MIME = /^video\//;
const DOCUMENT_MIME = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

const badRequest = (message) => Object.assign(new Error(message), { statusCode: 400 });
const forbidden = (message) => Object.assign(new Error(message), { statusCode: 403 });
const notFound = (message) => Object.assign(new Error(message), { statusCode: 404 });

function lessonRef(db, courseId, moduleId, lessonId) {
  return db.collection("courses").doc(courseId).collection("modules").doc(moduleId).collection("lessons").doc(lessonId);
}

// Same "is this Teacher assigned to this course" check the app already uses
// everywhere else (teacherIds array-contains) — kept here as a small local
// helper so this file has no dependency on documents-core.js's Documents-
// specific access model.
async function ownsCourse(db, uid, courseId) {
  const snap = await db.collection("courses").doc(courseId).get();
  return snap.exists && Array.isArray(snap.data().teacherIds) && snap.data().teacherIds.includes(uid);
}

async function isActivelyEnrolled(db, uid, courseId) {
  const snap = await db.collection("enrollments").doc(`${courseId}_${uid}`).get();
  return snap.exists && snap.data().studentId === uid && snap.data().status !== "withdrawn";
}

async function canManageLessons(db, actor, courseId) {
  if (MANAGER_ROLES.has(actor.role)) return true;
  if (actor.role === "Teacher") return ownsCourse(db, actor.uid, courseId);
  return false;
}

export async function uploadLessonFile(db, { courseId, moduleId, lessonId, file, buffer }, actor) {
  if (!(await canManageLessons(db, actor, courseId))) {
    throw forbidden("You are not authorized to upload content for this course.");
  }
  const ref = lessonRef(db, courseId, moduleId, lessonId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw notFound("Lesson not found.");

  if (!file || !buffer?.length) throw badRequest("Choose a file to upload.");
  const mimeType = file.type || "application/octet-stream";
  const isVideo = VIDEO_MIME.test(mimeType);
  const isDocument = DOCUMENT_MIME.has(mimeType);
  if (!isVideo && !isDocument) {
    throw badRequest("Unsupported file type. Upload a video, PDF, or Office document.");
  }
  const limit = isVideo ? MAX_LESSON_VIDEO_BYTES : MAX_LESSON_DOCUMENT_BYTES;
  if (buffer.length > limit) {
    throw badRequest(`The file is too large — the limit is ${Math.round(limit / (1024 * 1024))} MB.`);
  }

  const safeName = (file.name || "lesson-file").replace(/[^a-zA-Z0-9.\-_ ]/g, "_").slice(-140) || "lesson-file";
  const path = `lessonContent/${lessonId}/${Date.now()}_${safeName}`;
  const bucket = getAdminStorage().bucket();

  // Replace any previous file for this lesson so a re-upload doesn't leave
  // orphaned Storage objects behind.
  const current = snapshot.data();
  if (current.storagePath) {
    await bucket.file(current.storagePath).delete().catch(() => {});
  }

  await bucket.file(path).save(buffer, { metadata: { contentType: mimeType } });

  const update = {
    contentType: isVideo ? "video" : "pdf",
    storagePath: path,
    fileName: safeName,
    mimeType,
    fileSize: buffer.length,
    contentUrl: null,
    updatedAt: FieldValue.serverTimestamp(),
  };
  await ref.update(update);
  return { storagePath: path, fileName: safeName, mimeType, fileSize: buffer.length };
}

// Called right before a lesson doc is deleted client-side, so its uploaded
// Storage object (if any) doesn't linger forever — client Storage deletes
// aren't possible here (see the file header), so this is the only cleanup
// path. Non-fatal by design: a failed delete just leaves one orphaned
// object, never blocks the lesson itself from being removed.
export async function deleteLessonFile(db, { courseId, moduleId, lessonId }, actor) {
  if (!(await canManageLessons(db, actor, courseId))) {
    throw forbidden("You are not authorized to modify content for this course.");
  }
  const ref = lessonRef(db, courseId, moduleId, lessonId);
  const snapshot = await ref.get();
  const storagePath = snapshot.exists ? snapshot.data().storagePath : null;
  if (storagePath) {
    await getAdminStorage().bucket().file(storagePath).delete().catch(() => {});
  }
  return { ok: true };
}

export async function getLessonFileForUser(db, { courseId, moduleId, lessonId }, uid, profile) {
  const ref = lessonRef(db, courseId, moduleId, lessonId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw notFound("Lesson not found.");
  const lesson = snapshot.data();

  const isManager = MANAGER_ROLES.has(profile.role);
  let allowed = isManager;
  if (!allowed && profile.role === "Teacher") allowed = await ownsCourse(db, uid, courseId);
  if (!allowed && profile.role === "Student") {
    // A Student may only ever open PUBLISHED content in a course they are
    // actively enrolled in — checked fresh against Firestore on every
    // request, never trusting anything the client sent besides the ids.
    const moduleSnap = await db.collection("courses").doc(courseId).collection("modules").doc(moduleId).get();
    const modulePublished = moduleSnap.exists && moduleSnap.data().status === "Published";
    allowed = modulePublished && lesson.status === "Published" && (await isActivelyEnrolled(db, uid, courseId));
  }
  if (!allowed) throw forbidden("You do not have access to this lesson's content.");

  if (!lesson.storagePath) throw notFound("This lesson has no file attached.");
  const file = getAdminStorage().bucket().file(lesson.storagePath);
  const [exists] = await file.exists();
  if (!exists) throw notFound("The file for this lesson is no longer available.");
  const [buffer] = await file.download();
  return {
    buffer,
    mimeType: lesson.mimeType || "application/octet-stream",
    fileName: lesson.fileName || "lesson-file",
  };
}
