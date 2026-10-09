import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminStorage } from "../firebase-admin";
import { isLearnerRole } from "../learner-roles";

// ---------------------------------------------------------------------------
// LMS Documents / Learning Materials — server core
//
// ONE collection: `documents` (the collection the Teacher documents view
// already used). This module extends its schema with the audience /
// lifecycle fields the LMS needs; existing teacher-uploaded docs
// (status "ready", no audienceType) keep working and stay teacher-private.
//
// Files are uploaded through the Admin SDK (like every other admin file in
// this project — event banners, product images, certificate backgrounds)
// because the cross-service Firestore role lookup a client Storage rule
// would need is documented-broken here. Firestore never stores the file
// bytes — only metadata + the Storage path/URL.
//
// `canAccessDocument()` is the single reusable visibility function — it is
// the only place document visibility is decided, and it is always run
// against the AUTHENTICATED user's real profile + enrollment/assignment
// data (never an id from the request), so a Student can't reach another
// student's private document by editing ids in the browser.
// ---------------------------------------------------------------------------

export const MANAGER_ROLES = new Set(["Admin", "Director"]);
export const AUDIENCE_TYPES = ["all_students", "course", "class", "student", "teachers", "facilitators", "staff"];
export const DOCUMENT_STATUSES = ["draft", "published", "archived"];
export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024; // 25 MB

const ALLOWED_MIME = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/zip",
  "application/x-zip-compressed",
]);

const plain = (snap) => ({ id: snap.id, ...snap.data() });
const iso = (value) => (value?.toDate ? value.toDate().toISOString() : typeof value === "string" ? value : null);
const badRequest = (message) => Object.assign(new Error(message), { statusCode: 400 });
const forbidden = (message) => Object.assign(new Error(message), { statusCode: 403 });
const notFound = (message) => Object.assign(new Error(message), { statusCode: 404 });

// A document only has an openable file once its upload finished — a
// storagePath (new uploads) or a fileUrl (legacy). Records left behind by a
// failed upload have neither.
export const hasStoredFile = (doc) => Boolean(doc?.storagePath || doc?.fileUrl);

// Legacy teacher docs used status "ready"; normalise to the LMS lifecycle.
export function lifecycleStatus(doc) {
  if (DOCUMENT_STATUSES.includes(doc.status)) return doc.status;
  if (doc.status === "ready") return "published";
  return "draft";
}

async function resolveUserNames(db, uids) {
  const unique = [...new Set(uids.filter(Boolean))];
  if (!unique.length) return new Map();
  const docs = await db.getAll(...unique.map((id) => db.collection("users").doc(id)));
  return new Map(
    docs.map((snap) => [snap.id, snap.exists ? snap.data().displayName || snap.data().email || snap.id : snap.id]),
  );
}

// -------------------------------------------------------------------------
// Access context — the real enrollment / assignment data for a non-manager
// -------------------------------------------------------------------------
export async function buildAccessContext(db, uid, profile) {
  const role = profile.role || "";
  const context = {
    uid,
    role,
    active: profile.active !== false && profile.status !== "pending" && profile.status !== "rejected",
    enrolledCourseIds: new Set(),
    enrolledClassIds: new Set(),
    assignedCourseIds: new Set(),
    assignedClassIds: new Set(),
  };
  if (isLearnerRole(role)) {
    const snapshot = await db.collection("enrollments").where("studentId", "==", uid).get();
    snapshot.docs.forEach((entry) => {
      const data = entry.data();
      if (data.status === "withdrawn") return;
      if (data.courseId) context.enrolledCourseIds.add(data.courseId);
      if (data.classId) context.enrolledClassIds.add(data.classId);
    });
  } else if (role === "Teacher" || role === "Facilitator") {
    const [courses, classes] = await Promise.all([
      db.collection("courses").where("teacherIds", "array-contains", uid).get(),
      db.collection("classes").where("teacherIds", "array-contains", uid).get(),
    ]);
    courses.docs.forEach((entry) => context.assignedCourseIds.add(entry.id));
    classes.docs.forEach((entry) => {
      context.assignedClassIds.add(entry.id);
      const data = entry.data();
      if (data.courseId) context.assignedCourseIds.add(data.courseId);
    });
  }
  return context;
}

// -------------------------------------------------------------------------
// THE reusable visibility function
// -------------------------------------------------------------------------
export function canAccessDocument(context, doc) {
  if (!context?.uid) return false;
  if (MANAGER_ROLES.has(context.role)) return true;

  const status = lifecycleStatus(doc);
  const owned =
    doc.uploadedBy === context.uid ||
    doc.teacherId === context.uid ||
    (Array.isArray(doc.teacherIds) && doc.teacherIds.includes(context.uid));

  if (context.role === "Teacher" || context.role === "Facilitator") {
    if (owned) return true; // own materials — any status
    if (status !== "published") return false;
    const audience = doc.audienceType;
    if (audience === "teachers" || audience === "facilitators" || audience === "staff") return true;
    if (doc.courseId && context.assignedCourseIds.has(doc.courseId)) return true;
    if (doc.classId && context.assignedClassIds.has(doc.classId)) return true;
    return false;
  }

  if (isLearnerRole(context.role)) {
    if (status !== "published" || !context.active) return false;
    switch (doc.audienceType) {
      // A student's "My Learning Materials" is strictly enrollment-scoped:
      // they only ever see documents for a course (or a class/batch of a
      // course) they are currently enrolled in, plus any document an admin
      // has assigned directly to them. "All students" broadcasts are NOT
      // shown here (per the academy's chosen policy).
      case "course":
        return Boolean(doc.courseId) && context.enrolledCourseIds.has(doc.courseId);
      case "class":
        return Boolean(doc.classId) && context.enrolledClassIds.has(doc.classId);
      case "student":
        return Array.isArray(doc.audienceIds) && doc.audienceIds.includes(context.uid);
      default:
        return false; // all_students, teachers/facilitators/staff-only, or legacy teacher-private
    }
  }

  return false;
}

// True when `actor` (role + uid) may edit/delete this document.
export function canManageDocument(role, uid, doc) {
  if (MANAGER_ROLES.has(role)) return true;
  if (role === "Teacher" || role === "Facilitator") {
    return (
      doc.uploadedBy === uid ||
      doc.teacherId === uid ||
      (Array.isArray(doc.teacherIds) && doc.teacherIds.includes(uid))
    );
  }
  return false;
}

// -------------------------------------------------------------------------
// Serialisation
// -------------------------------------------------------------------------
function documentView(doc, courseMap, folderMap, uploaderMap, hideUrl = false) {
  return {
    id: doc.id,
    name: doc.title || doc.name || doc.fileName || "Untitled document",
    description: doc.description || "",
    category: doc.category || "",
    folderId: doc.folderId || "",
    folderName: folderMap.get(doc.folderId) || "",
    courseId: doc.courseId || "",
    courseName: doc.courseName || courseMap.get(doc.courseId) || "",
    classId: doc.classId || "",
    audienceType: doc.audienceType || (doc.courseId ? "course" : ""),
    audienceIds: Array.isArray(doc.audienceIds) ? doc.audienceIds : [],
    status: lifecycleStatus(doc),
    fileName: doc.fileName || "",
    fileType: doc.mimeType || doc.fileType || "",
    fileSize: Number(doc.size || doc.fileSize || 0),
    // Students never receive the raw Storage URL — they open documents only
    // through the authorised stream at GET /api/documents/file/[id], which
    // re-runs canAccessDocument on every request. Staff keep the direct URL
    // for their existing view/download actions.
    fileUrl: hideUrl ? "" : doc.fileUrl || "",
    hasFile: hasStoredFile(doc),
    uploadedBy: doc.uploadedBy || doc.teacherId || "",
    uploadedByName: doc.uploadedByName || uploaderMap.get(doc.uploadedBy || doc.teacherId) || "",
    createdAt: iso(doc.createdAt),
    updatedAt: iso(doc.updatedAt),
    publishedAt: iso(doc.publishedAt),
  };
}

// -------------------------------------------------------------------------
// Reads
// -------------------------------------------------------------------------
export async function listDocumentsForUser(db, uid, profile) {
  const [rawDocs, courseSnap, folderSnap] = await Promise.all([
    db.collection("documents").get(),
    db.collection("courses").get(),
    db.collection("documentFolders").get().catch(() => ({ docs: [] })),
  ]);
  const all = rawDocs.docs.map(plain);
  const courseMap = new Map(courseSnap.docs.map((entry) => [entry.id, entry.data().title || entry.data().name || entry.id]));
  const folderMap = new Map((folderSnap.docs || []).map((entry) => [entry.id, entry.data().name || "Folder"]));

  const isManager = MANAGER_ROLES.has(profile.role);
  const isStudent = isLearnerRole(profile.role);
  const context = isManager ? { uid, role: profile.role } : await buildAccessContext(db, uid, profile);
  // A document with a failed/missing upload still shows in the list (so the
  // student sees the material exists), but `hasFile` is false so the UI
  // renders it as "Unavailable" instead of an openable View action, and the
  // file endpoint returns 404 rather than a broken stream.
  const visible = isManager ? all : all.filter((doc) => canAccessDocument(context, doc));

  const uploaderMap = await resolveUserNames(db, visible.map((doc) => doc.uploadedBy || doc.teacherId));
  const documents = visible
    .map((doc) => documentView(doc, courseMap, folderMap, uploaderMap, isStudent))
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));

  const folders = (folderSnap.docs || [])
    .map((entry) => ({ id: entry.id, name: entry.data().name || "Folder", createdAt: iso(entry.data().createdAt) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const result = { documents, folders, role: profile.role };

  if (isManager) {
    result.counts = {
      total: documents.length,
      published: documents.filter((doc) => doc.status === "published").length,
      draft: documents.filter((doc) => doc.status === "draft").length,
      archived: documents.filter((doc) => doc.status === "archived").length,
    };
    // Form pick-lists — small, manager-only.
    const [classSnap, userSnap] = await Promise.all([
      db.collection("classes").get(),
      db.collection("users").where("role", "==", "Student").get(),
    ]);
    result.courses = courseSnap.docs
      .map((entry) => ({ id: entry.id, title: entry.data().title || entry.data().name || entry.id, courseCode: entry.data().courseCode || "" }))
      .sort((a, b) => a.title.localeCompare(b.title));
    result.classes = classSnap.docs.map((entry) => ({
      id: entry.id,
      name: entry.data().name || "Batch",
      courseId: entry.data().courseId || "",
    }));
    result.students = userSnap.docs
      .map((entry) => ({ id: entry.id, name: entry.data().displayName || entry.data().email || entry.id, email: entry.data().email || "" }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  return result;
}

// -------------------------------------------------------------------------
// Authorised file stream — the ONLY way a Student ever reaches a file.
// Runs the exact same visibility decision (canAccessDocument) against the
// authenticated user's real role + enrollment; the document id from the URL
// is only ever used to look the document up, never to grant access.
// -------------------------------------------------------------------------
export async function getDocumentFileForUser(db, id, uid, profile) {
  const snapshot = await db.collection("documents").doc(String(id || "")).get();
  if (!snapshot.exists) throw notFound("Document not found.");
  const doc = plain(snapshot);

  const isManager = MANAGER_ROLES.has(profile.role);
  const context = isManager
    ? { uid, role: profile.role }
    : await buildAccessContext(db, uid, profile);
  if (!canAccessDocument(context, doc)) throw forbidden("You do not have access to this document.");

  const mimeType = doc.mimeType || doc.fileType || "application/octet-stream";
  const fileName = doc.fileName || `${doc.title || "document"}`;

  // Preferred path: the recorded Storage object (all new uploads).
  if (doc.storagePath) {
    const file = getAdminStorage().bucket().file(doc.storagePath);
    const [exists] = await file.exists();
    if (!exists) throw notFound("The file for this document is no longer available.");
    const [buffer] = await file.download();
    return { buffer, mimeType, fileName };
  }

  // Legacy fallback: an older record that only kept a download URL.
  if (doc.fileUrl) {
    const res = await fetch(doc.fileUrl);
    if (!res.ok) throw notFound("The file for this document is no longer available.");
    const buffer = Buffer.from(await res.arrayBuffer());
    return { buffer, mimeType: res.headers.get("content-type") || mimeType, fileName };
  }

  // The upload for this document never completed — there is nothing to open.
  throw notFound("This document has no file attached. Ask an administrator to re-upload it.");
}

// -------------------------------------------------------------------------
// Validation + writes
// -------------------------------------------------------------------------
function normalizeMeta(meta = {}) {
  const str = (value, max) => (typeof value === "string" ? value.trim().slice(0, max) : "");
  const audienceType = AUDIENCE_TYPES.includes(meta.audienceType) ? meta.audienceType : "";
  const status = DOCUMENT_STATUSES.includes(meta.status) ? meta.status : "draft";
  return {
    name: str(meta.name || meta.title, 200),
    description: str(meta.description, 2000),
    category: str(meta.category, 120),
    folderId: str(meta.folderId, 200),
    courseId: str(meta.courseId, 200),
    classId: str(meta.classId, 200),
    audienceType,
    audienceIds: Array.isArray(meta.audienceIds) ? meta.audienceIds.map((id) => String(id).slice(0, 200)).filter(Boolean).slice(0, 200) : [],
    status,
  };
}

function validateMeta(data) {
  if (!data.name) throw badRequest("Document name is required.");
  if (!data.audienceType) throw badRequest("Choose an audience for this document.");
  if (data.audienceType === "course" && !data.courseId) throw badRequest("Choose a course for a course-specific document.");
  if (data.audienceType === "class" && !data.courseId) throw badRequest("Choose a course / training for a class-specific document.");
  if (data.audienceType === "class" && !data.classId) throw badRequest("Choose a class / batch for a class-specific document.");
  if (data.audienceType === "student" && !data.audienceIds.length) throw badRequest("Choose at least one student.");
}

async function uploadBuffer(docId, file, buffer) {
  if (!ALLOWED_MIME.has(file.type)) {
    throw badRequest("Unsupported file type. Upload a PDF, Office document, text file, image, or zip.");
  }
  if (buffer.length > MAX_DOCUMENT_BYTES) throw badRequest("The file is too large — the limit is 25 MB.");
  const safeName = (file.name || "document").replace(/[^a-zA-Z0-9.\-_ ]/g, "_").slice(-140) || "document";
  const path = `documents/${docId}/${Date.now()}_${safeName}`;
  const bucket = getAdminStorage().bucket();
  const storageFile = bucket.file(path);
  await storageFile.save(buffer, { metadata: { contentType: file.type || "application/octet-stream" } });
  await storageFile.makePublic();
  return {
    storagePath: path,
    fileUrl: `https://storage.googleapis.com/${bucket.name}/${path}`,
    fileName: safeName,
    mimeType: file.type || "application/octet-stream",
    size: buffer.length,
  };
}

export async function createDocument(db, { meta, file, buffer }, actor) {
  const data = normalizeMeta(meta);
  validateMeta(data);
  if (!file || !buffer?.length) throw badRequest("Choose a file to upload.");

  let courseName = "";
  if (data.courseId) {
    const courseSnap = await db.collection("courses").doc(data.courseId).get();
    courseName = courseSnap.exists ? courseSnap.data().title || courseSnap.data().name || "" : "";
  }
  // A Teacher/Facilitator may only attach a document to a course/class they
  // are actually assigned to.
  if (!MANAGER_ROLES.has(actor.role)) {
    const context = await buildAccessContext(db, actor.uid, actor.profile);
    if (data.courseId && !context.assignedCourseIds.has(data.courseId)) throw forbidden("You are not assigned to that course.");
    if (data.classId && !context.assignedClassIds.has(data.classId)) throw forbidden("You are not assigned to that class.");
    if (["all_students", "teachers", "facilitators", "staff", "student"].includes(data.audienceType)) {
      throw forbidden("Teachers can only publish materials to their own course or class.");
    }
  }

  const ref = db.collection("documents").doc();
  const uploaded = await uploadBuffer(ref.id, file, buffer);
  const now = FieldValue.serverTimestamp();
  await ref.set({
    title: data.name,
    description: data.description,
    category: data.category,
    folderId: data.folderId,
    courseId: data.courseId,
    courseName,
    classId: data.classId,
    audienceType: data.audienceType,
    audienceIds: data.audienceIds,
    status: data.status,
    ...uploaded,
    uploadedBy: actor.uid,
    uploadedByName: actor.name,
    teacherId: actor.uid, // keeps the existing teacher-ownership rule/queries valid
    createdAt: now,
    updatedAt: now,
    publishedAt: data.status === "published" ? now : null,
  });
  return { id: ref.id };
}

export async function updateDocument(db, id, { meta, file, buffer }, actor) {
  const ref = db.collection("documents").doc(id);
  const snapshot = await ref.get();
  if (!snapshot.exists) return { status: 404, body: { message: "Document not found." } };
  const current = plain(snapshot);
  if (!canManageDocument(actor.role, actor.uid, current)) {
    return { status: 403, body: { message: "You cannot edit this document." } };
  }

  const data = normalizeMeta({ ...current, name: current.title, ...meta });
  validateMeta(data);

  const update = {
    title: data.name,
    description: data.description,
    category: data.category,
    folderId: data.folderId,
    courseId: data.courseId,
    classId: data.classId,
    audienceType: data.audienceType,
    audienceIds: data.audienceIds,
    status: data.status,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (data.courseId && data.courseId !== current.courseId) {
    const courseSnap = await db.collection("courses").doc(data.courseId).get();
    update.courseName = courseSnap.exists ? courseSnap.data().title || courseSnap.data().name || "" : "";
  }
  if (data.status === "published" && lifecycleStatus(current) !== "published") {
    update.publishedAt = FieldValue.serverTimestamp();
  }
  if (file && buffer?.length) {
    if (getAdminStorage && current.storagePath) {
      await getAdminStorage().bucket().file(current.storagePath).delete().catch(() => {});
    }
    Object.assign(update, await uploadBuffer(id, file, buffer));
  }
  await ref.update(update);
  return { status: 200, body: { ok: true } };
}

export async function deleteDocument(db, id, actor) {
  const ref = db.collection("documents").doc(id);
  const snapshot = await ref.get();
  if (!snapshot.exists) return { status: 200, body: { ok: true } };
  const current = plain(snapshot);
  if (!canManageDocument(actor.role, actor.uid, current)) {
    return { status: 403, body: { message: "You cannot delete this document." } };
  }
  if (current.storagePath) {
    await getAdminStorage().bucket().file(current.storagePath).delete().catch(() => {});
  }
  await ref.delete();
  return { status: 200, body: { ok: true } };
}

// -------------------------------------------------------------------------
// Folders (Admin/Director only)
// -------------------------------------------------------------------------
export async function createFolder(db, name, actor) {
  const clean = typeof name === "string" ? name.trim().slice(0, 120) : "";
  if (!clean) throw badRequest("Folder name is required.");
  const ref = await db.collection("documentFolders").add({
    name: clean,
    createdBy: actor.uid,
    createdByName: actor.name,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { id: ref.id };
}

export async function renameFolder(db, id, name) {
  const clean = typeof name === "string" ? name.trim().slice(0, 120) : "";
  if (!clean) throw badRequest("Folder name is required.");
  const ref = db.collection("documentFolders").doc(id);
  if (!(await ref.get()).exists) return { status: 404, body: { message: "Folder not found." } };
  await ref.update({ name: clean, updatedAt: FieldValue.serverTimestamp() });
  return { status: 200, body: { ok: true } };
}

export async function deleteFolder(db, id) {
  const ref = db.collection("documentFolders").doc(id);
  if (!(await ref.get()).exists) return { status: 200, body: { ok: true } };
  // Detach the folder from any documents that referenced it (kept, just unfiled).
  const attached = await db.collection("documents").where("folderId", "==", id).get();
  const batch = db.batch();
  attached.docs.forEach((entry) => batch.update(entry.ref, { folderId: "", updatedAt: FieldValue.serverTimestamp() }));
  batch.delete(ref);
  await batch.commit();
  return { status: 200, body: { ok: true } };
}
