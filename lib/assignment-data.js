"use client";

import {
  collection, deleteDoc, doc, getDocs, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where, addDoc,
} from "firebase/firestore";
import { db } from "./firebase";

// Assignments (Model Test → Assignment tab). Built on the `assignments` /
// `submissions` collections whose security rules already exist in
// firestore.rules — this is the first UI that creates them:
//   assignments/{id}  { courseId, classId, teacherId, title, instructions,
//                       dueDate, maxScore, resourceUrl, status }
//   submissions/{assignmentId}_{studentId}
//                     { assignmentId, courseId, classId, teacherId, studentId,
//                       answer, link, submittedAt, score, feedback, gradedAt }
// Rules recap: Admin/Director manage everything; a Teacher manages
// assignments for classes they own (teacherId must be themselves); a
// Student reads assignments of the class they're enrolled in and writes
// only their own submission, never its score.

const rows = (snapshot) => snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
const byNewest = (a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0);

export function subscribeAllAssignments(onData, onError) {
  if (!db) return () => {};
  return onSnapshot(collection(db, "assignments"), (snapshot) => onData(rows(snapshot).sort(byNewest)), onError);
}

export function subscribeTeacherAssignmentList(teacherId, onData, onError) {
  if (!db || !teacherId) return () => {};
  return onSnapshot(
    query(collection(db, "assignments"), where("teacherId", "==", teacherId)),
    (snapshot) => onData(rows(snapshot).sort(byNewest)),
    onError,
  );
}

// Student: one listener per enrolled class (the rule checks enrollment per
// classId, so each query is scoped to exactly one class). Drafts are
// filtered here — the rule lets an enrolled student read them, the UI
// simply never shows them.
export function subscribeClassAssignments(classIds, onData, onError) {
  if (!db || !classIds?.length) {
    onData([]);
    return () => {};
  }
  const byClass = new Map();
  const unsubs = classIds.map((classId) =>
    onSnapshot(
      query(collection(db, "assignments"), where("classId", "==", classId)),
      (snapshot) => {
        byClass.set(classId, rows(snapshot).filter((item) => item.status === "published"));
        onData([...byClass.values()].flat().sort(byNewest));
      },
      onError,
    ),
  );
  return () => unsubs.forEach((unsub) => unsub());
}

// Classes of a course the caller may attach an assignment to. A Teacher's
// query must also filter on teacherIds, or the `classes` rule rejects it.
export async function loadAssignableClasses(courseId, teacherId) {
  if (!db || !courseId) return [];
  const constraints = [where("courseId", "==", courseId)];
  if (teacherId) constraints.push(where("teacherIds", "array-contains", teacherId));
  return rows(await getDocs(query(collection(db, "classes"), ...constraints)));
}

function cleanAssignment(input) {
  const title = String(input.title || "").trim().slice(0, 160);
  if (!title) throw new Error("Enter an assignment title.");
  if (!input.courseId || !input.classId) throw new Error("Choose a training and class.");
  const maxScore = Number(input.maxScore);
  if (!Number.isFinite(maxScore) || maxScore <= 0) throw new Error("Max score must be greater than zero.");
  const resourceUrl = String(input.resourceUrl || "").trim().slice(0, 1000);
  if (resourceUrl && !/^https?:\/\//i.test(resourceUrl)) throw new Error("The resource link must start with http:// or https://.");
  return {
    courseId: input.courseId,
    classId: input.classId,
    teacherId: input.teacherId,
    title,
    instructions: String(input.instructions || "").trim().slice(0, 5000),
    dueDate: /^\d{4}-\d{2}-\d{2}$/.test(input.dueDate || "") ? input.dueDate : "",
    maxScore,
    resourceUrl,
  };
}

export async function createAssignment(input, createdBy) {
  if (!db) throw new Error("Firebase is not configured.");
  const data = cleanAssignment(input);
  const ref = await addDoc(collection(db, "assignments"), {
    ...data,
    // The class's teacher, so it shows up in their workspace; a manager
    // creating one for a class with no teacher yet owns it themselves.
    teacherId: data.teacherId || createdBy,
    status: "draft",
    createdBy,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

// courseId / classId / teacherId are never changed on edit (the Teacher
// update rule requires them to stay the same).
export async function updateAssignment(id, input) {
  const data = cleanAssignment(input);
  delete data.courseId;
  delete data.classId;
  delete data.teacherId;
  await updateDoc(doc(db, "assignments", id), { ...data, updatedAt: serverTimestamp() });
}

export const setAssignmentStatus = (id, status) =>
  updateDoc(doc(db, "assignments", id), { status, updatedAt: serverTimestamp() });

export const deleteAssignment = (id) => deleteDoc(doc(db, "assignments", id));

// Manager sees every submission; a Teacher's query must also filter on
// their own teacherId (the submissions read rule checks it).
export function subscribeAssignmentSubmissions(assignmentId, teacherId, onData, onError) {
  if (!db || !assignmentId) return () => {};
  const constraints = [where("assignmentId", "==", assignmentId)];
  if (teacherId) constraints.push(where("teacherId", "==", teacherId));
  return onSnapshot(query(collection(db, "submissions"), ...constraints), (snapshot) => onData(rows(snapshot)), onError);
}

export async function gradeSubmission(id, { score, feedback }, maxScore) {
  const value = Number(score);
  if (!Number.isFinite(value) || value < 0 || value > maxScore) throw new Error(`Score must be between 0 and ${maxScore}.`);
  await updateDoc(doc(db, "submissions", id), {
    score: value,
    feedback: String(feedback || "").trim().slice(0, 2000),
    gradedAt: serverTimestamp(),
  });
}

export function subscribeMySubmissions(studentId, onData, onError) {
  if (!db || !studentId) return () => {};
  return onSnapshot(query(collection(db, "submissions"), where("studentId", "==", studentId)), (snapshot) => onData(rows(snapshot)), onError);
}

// One submission per student per assignment (doc id is deterministic), so
// re-submitting before grading just updates the answer. `score` is written
// as null on the first submit — the student-update rule compares it, and a
// missing field would make that comparison fail.
export async function submitAssignment(assignment, studentId, { answer, link }, existing) {
  const text = String(answer || "").trim().slice(0, 10000);
  const url = String(link || "").trim().slice(0, 1000);
  if (!text && !url) throw new Error("Write your answer or add a link to your work.");
  if (url && !/^https?:\/\//i.test(url)) throw new Error("The link must start with http:// or https://.");
  const ref = doc(db, "submissions", `${assignment.id}_${studentId}`);
  const base = {
    assignmentId: assignment.id,
    courseId: assignment.courseId,
    classId: assignment.classId,
    teacherId: assignment.teacherId,
    studentId,
    answer: text,
    link: url,
    submittedAt: serverTimestamp(),
  };
  if (existing) await updateDoc(ref, base);
  else await setDoc(ref, { ...base, score: null, feedback: "", gradedAt: null });
}
