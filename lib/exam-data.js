"use client";

import {
  collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, query, serverTimestamp, updateDoc, where, writeBatch,
} from "firebase/firestore";
import { auth, db } from "./firebase";

// ---------------------------------------------------------------------------
// Exam / Quiz module.
//
// A quiz's public doc (`quizzes/{id}`) NEVER carries correct answers — those
// live in a teacher/admin-only subcollection (`quizzes/{id}/answerKey/key`),
// unreadable by students even directly via the Firestore SDK (see
// firestore.rules). Grading only ever happens server-side, via
// /api/exams/[quizId]/submit — a student's `quizAttempts` doc is never
// client-written, so a score can never be self-reported.
//
// Every question is multiple-choice: { id, text, options: [string, ...] }.
// The answer key mirrors it 1:1: { answers: { [questionId]: correctIndex },
// points: { [questionId]: pointValue } }.
// ---------------------------------------------------------------------------

function newQuestionId() {
  return `q${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
}

// Splits a builder-form question list into the two documents a quiz is
// actually stored as — called by both createQuiz and updateQuiz so they
// can never drift apart.
function splitQuestions(questions) {
  const publicQuestions = [];
  const answers = {};
  const points = {};
  let totalPoints = 0;
  questions.forEach((question) => {
    const id = question.id || newQuestionId();
    const pointValue = Number(question.points) > 0 ? Number(question.points) : 1;
    publicQuestions.push({ id, text: question.text, options: question.options });
    answers[id] = question.correctOptionIndex;
    points[id] = pointValue;
    totalPoints += pointValue;
  });
  return { publicQuestions, answers, points, totalPoints };
}

export async function createQuiz(teacherId, { courseId, moduleId, title, description, timeLimitMinutes, maxAttempts, questions }) {
  if (!db) throw new Error("Firebase is not configured.");
  const { publicQuestions, answers, points, totalPoints } = splitQuestions(questions);
  const quizRef = doc(collection(db, "quizzes"));
  const batch = writeBatch(db);
  batch.set(quizRef, {
    courseId,
    moduleId: moduleId || null,
    teacherId,
    title,
    description: description || "",
    timeLimitMinutes: Number(timeLimitMinutes) > 0 ? Number(timeLimitMinutes) : null,
    maxAttempts: Number(maxAttempts) > 0 ? Number(maxAttempts) : 1,
    questions: publicQuestions,
    totalPoints,
    status: "draft",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(collection(quizRef, "answerKey"), "key"), { courseId, teacherId, answers, points });
  await batch.commit();
  return quizRef.id;
}

export async function updateQuiz(quizId, teacherId, { courseId, moduleId, title, description, timeLimitMinutes, maxAttempts, questions }) {
  if (!db) throw new Error("Firebase is not configured.");
  const { publicQuestions, answers, points, totalPoints } = splitQuestions(questions);
  const quizRef = doc(db, "quizzes", quizId);
  const batch = writeBatch(db);
  batch.update(quizRef, {
    courseId,
    moduleId: moduleId || null,
    title,
    description: description || "",
    timeLimitMinutes: Number(timeLimitMinutes) > 0 ? Number(timeLimitMinutes) : null,
    maxAttempts: Number(maxAttempts) > 0 ? Number(maxAttempts) : 1,
    questions: publicQuestions,
    totalPoints,
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(collection(quizRef, "answerKey"), "key"), { courseId, teacherId, answers, points });
  await batch.commit();
}

// Only the owning teacher (or admin) can read this — used purely to
// pre-fill the correct-answer radios when opening the edit form, so saving
// an edit without touching every question never silently wipes existing
// correct answers back to "option 1".
export async function loadQuizAnswerKey(quizId) {
  if (!db) return { answers: {}, points: {} };
  const snapshot = await getDoc(doc(db, "quizzes", quizId, "answerKey", "key"));
  return snapshot.exists() ? snapshot.data() : { answers: {}, points: {} };
}

export async function setQuizStatus(quizId, status) {
  if (!db) throw new Error("Firebase is not configured.");
  await updateDoc(doc(db, "quizzes", quizId), { status, updatedAt: serverTimestamp() });
}

export async function deleteQuiz(quizId) {
  if (!db) throw new Error("Firebase is not configured.");
  await deleteDoc(doc(db, "quizzes", quizId, "answerKey", "key")).catch(() => {});
  await deleteDoc(doc(db, "quizzes", quizId));
}

// Admin/Director oversight — every quiz, any course/teacher. Safe as an
// unfiltered list() because firestore.rules' admin() branch already grants
// Admin/Director unrestricted read on `quizzes` (same as every other
// collection in this app).
export function subscribeAllQuizzes(onData, onError) {
  if (!db) return () => {};
  return onSnapshot(
    collection(db, "quizzes"),
    (snapshot) => onData(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
    onError,
  );
}

// Perceived-speed only — mirrors lib/room-booking-data.js's
// prefetchRoomBooking: a GLOBAL (not per-uid) warmup for Admin/Director's
// "Model Test" manager view, fired from app/dashboard/[role]/page.jsx as
// soon as the dashboard mounts. TeacherExams.jsx seeds its own state from
// this cache on mount (instant if the prefetch already delivered data) and
// then establishes its own live subscription as before.
let cachedManagerQuizzes = null;
let warmedManagerExams = false;

export function prefetchManagerExams() {
  if (warmedManagerExams) return;
  warmedManagerExams = true;
  subscribeAllQuizzes((rows) => { cachedManagerQuizzes = rows; }, () => {});
}
export const getCachedManagerQuizzes = () => cachedManagerQuizzes;

export function subscribeTeacherQuizzes(teacherId, onData, onError) {
  if (!db || !teacherId) return () => {};
  return onSnapshot(
    query(collection(db, "quizzes"), where("teacherId", "==", teacherId)),
    (snapshot) => onData(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
    (error) => {
      console.error("[exam-data] teacher quizzes query failed", { teacherId, code: error?.code, message: error?.message });
      onError?.(error);
    },
  );
}

// A student sees only published quizzes for courses they're actually
// enrolled in — one listener per enrolled course (avoids the 30-value cap
// and composite-index needs of a single `in` query; a student is realistically
// enrolled in a handful of courses).
export function subscribeStudentQuizzes(courseIds, onData, onError) {
  if (!db || !courseIds?.length) {
    onData([]);
    return () => {};
  }
  const byId = new Map();
  const unsubs = courseIds.map((courseId) =>
    onSnapshot(
      query(collection(db, "quizzes"), where("courseId", "==", courseId), where("status", "==", "published")),
      (snapshot) => {
        snapshot.docs.forEach((item) => byId.set(item.id, { id: item.id, ...item.data() }));
        // Remove any quiz from this course no longer in the snapshot (e.g. unpublished).
        const liveIds = new Set(snapshot.docs.map((item) => item.id));
        [...byId.keys()].forEach((id) => { if (byId.get(id).courseId === courseId && !liveIds.has(id)) byId.delete(id); });
        onData([...byId.values()]);
      },
      onError,
    ),
  );
  return () => unsubs.forEach((fn) => fn());
}

export function subscribeMyAttempts(studentId, onData, onError) {
  if (!db || !studentId) return () => {};
  return onSnapshot(
    query(collection(db, "quizAttempts"), where("studentId", "==", studentId)),
    (snapshot) => onData(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
    onError,
  );
}

export function subscribeQuizAttemptsForTeacher(teacherId, quizId, onData, onError) {
  if (!db || !teacherId || !quizId) return () => {};
  return onSnapshot(
    query(collection(db, "quizAttempts"), where("teacherId", "==", teacherId), where("quizId", "==", quizId)),
    (snapshot) => onData(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
    onError,
  );
}

// Admin/Director oversight variant — every attempt for this quiz regardless
// of which teacher owns it (admin() covers it, see subscribeAllQuizzes).
export function subscribeQuizAttemptsForQuiz(quizId, onData, onError) {
  if (!db || !quizId) return () => {};
  return onSnapshot(
    query(collection(db, "quizAttempts"), where("quizId", "==", quizId)),
    (snapshot) => onData(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
    onError,
  );
}

// The one write a student ever makes for a quiz — grading happens
// server-side (see route), never trusting a client-computed score.
export async function submitQuizAttempt(quizId, answers) {
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new Error("Your session has expired. Please sign in again.");
  const response = await fetch(`/api/exams/${quizId}/submit`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ answers }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "Unable to submit this exam.");
  return payload;
}

export async function loadCourseAttemptCount(quizId, studentId) {
  if (!db) return 0;
  const snapshot = await getDocs(query(collection(db, "quizAttempts"), where("quizId", "==", quizId), where("studentId", "==", studentId)));
  return snapshot.size;
}
