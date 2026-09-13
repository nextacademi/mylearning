"use client";

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import { deleteLessonContent } from "./services/lesson-content-service";

// Client Firestore access for the Training Modules/Lessons feature — same
// onSnapshot-wrapper style as lib/training-detail.js. Every read/write here
// is metadata only (titles, order, status, urls); the actual video/PDF/
// document BYTES always go through lib/services/lesson-content-service.js
// instead, because Storage Rules can't verify course ownership/enrollment
// reliably in this project (see storage.rules). Access to these metadata
// docs is enforced by firestore.rules' existing courses/{id}/modules/{id}/
// lessons/{id} block (admin/owning-teacher write, +enrolled-student read).

function modulesRef(courseId) {
  return collection(db, "courses", courseId, "modules");
}
function lessonsRef(courseId, moduleId) {
  return collection(db, "courses", courseId, "modules", moduleId, "lessons");
}
function moduleDoc(courseId, moduleId) {
  return doc(db, "courses", courseId, "modules", moduleId);
}
function lessonDoc(courseId, moduleId, lessonId) {
  return doc(db, "courses", courseId, "modules", moduleId, "lessons", lessonId);
}
function completionDoc(courseId, moduleId, lessonId, uid) {
  return doc(db, "courses", courseId, "modules", moduleId, "lessons", lessonId, "completions", uid);
}

export function subscribeModules(courseId, onData, onError) {
  if (!db || !courseId) return () => {};
  return onSnapshot(
    query(modulesRef(courseId), orderBy("order", "asc")),
    (snapshot) => onData(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
    onError,
  );
}

export function subscribeLessons(courseId, moduleId, onData, onError) {
  if (!db || !courseId || !moduleId) return () => {};
  return onSnapshot(
    query(lessonsRef(courseId, moduleId), orderBy("order", "asc")),
    (snapshot) => onData(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
    onError,
  );
}

export function subscribeLessonCompletion(courseId, moduleId, lessonId, uid, onData) {
  if (!db || !courseId || !moduleId || !lessonId || !uid) return () => {};
  return onSnapshot(completionDoc(courseId, moduleId, lessonId, uid), (snapshot) => onData(snapshot.exists()), () => onData(false));
}

export async function markLessonComplete(courseId, moduleId, lessonId, uid) {
  await setDoc(completionDoc(courseId, moduleId, lessonId, uid), { completedAt: serverTimestamp() });
}

async function nextOrder(ref) {
  const snapshot = await getDocs(query(ref, orderBy("order", "desc")));
  const top = snapshot.docs[0]?.data()?.order;
  return typeof top === "number" ? top + 1 : 0;
}

export async function createModule(courseId, data) {
  const order = await nextOrder(modulesRef(courseId));
  const ref = doc(modulesRef(courseId));
  await setDoc(ref, {
    title: data.title || "",
    description: data.description || "",
    estimatedDuration: Number(data.estimatedDuration) || 0,
    status: data.status === "Published" ? "Published" : "Draft",
    order,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateModule(courseId, moduleId, data) {
  await updateDoc(moduleDoc(courseId, moduleId), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteModule(courseId, moduleId) {
  const lessonsSnap = await getDocs(lessonsRef(courseId, moduleId));
  await Promise.all(lessonsSnap.docs.map((item) => deleteLessonContent(courseId, moduleId, item.id)));
  const batch = writeBatch(db);
  lessonsSnap.docs.forEach((item) => batch.delete(item.ref));
  batch.delete(moduleDoc(courseId, moduleId));
  await batch.commit();
}

// Swaps the `order` field between two adjacent modules/lessons — the whole
// up/down reorder mechanism, no drag-and-drop library needed.
export async function swapModuleOrder(courseId, moduleA, moduleB) {
  const batch = writeBatch(db);
  batch.update(moduleDoc(courseId, moduleA.id), { order: moduleB.order, updatedAt: serverTimestamp() });
  batch.update(moduleDoc(courseId, moduleB.id), { order: moduleA.order, updatedAt: serverTimestamp() });
  await batch.commit();
}

export async function swapLessonOrder(courseId, moduleId, lessonA, lessonB) {
  const batch = writeBatch(db);
  batch.update(lessonDoc(courseId, moduleId, lessonA.id), { order: lessonB.order, updatedAt: serverTimestamp() });
  batch.update(lessonDoc(courseId, moduleId, lessonB.id), { order: lessonA.order, updatedAt: serverTimestamp() });
  await batch.commit();
}

export async function createLesson(courseId, moduleId, data) {
  const order = await nextOrder(lessonsRef(courseId, moduleId));
  const ref = doc(lessonsRef(courseId, moduleId));
  await setDoc(ref, {
    title: data.title || "",
    description: data.description || "",
    contentType: data.contentType || "text",
    contentUrl: data.contentUrl || null,
    textBody: data.textBody || "",
    storagePath: null,
    fileName: null,
    mimeType: null,
    fileSize: null,
    duration: Number(data.duration) || 0,
    status: data.status === "Published" ? "Published" : "Draft",
    order,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateLesson(courseId, moduleId, lessonId, data) {
  await updateDoc(lessonDoc(courseId, moduleId, lessonId), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteLesson(courseId, moduleId, lessonId) {
  await deleteLessonContent(courseId, moduleId, lessonId);
  await deleteDoc(lessonDoc(courseId, moduleId, lessonId));
}
