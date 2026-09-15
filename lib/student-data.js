import { collection, doc, getDoc, onSnapshot, query, where } from "firebase/firestore";
import { db } from "./firebase";

// Direct-client reads, same pattern as lib/teacher-data.js — Firestore
// rules already scope `enrollments`/`payments` reads to
// `resource.data.studentId == request.auth.uid`, so a Student can only
// ever see their own admission/payment records this way, never anyone
// else's, with no server API route needed.

function reportQueryError(error, { collectionName, queryDescription, uid, onError }) {
  console.error(`[student-data] ${collectionName} query failed`, {
    queryDescription,
    uid,
    code: error?.code || "unknown",
    message: error?.message || "unknown",
  });
  onError?.(error, collectionName);
}

// Course titles rarely change while a student is looking at this page, so a
// one-time fetch per courseId (refreshed whenever the enrollment set
// changes) is enough — no need for a nested live subscription per course.
async function loadCourseInfo(courseId) {
  if (!db || !courseId) return null;
  try {
    const snapshot = await getDoc(doc(db, "courses", courseId));
    return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
  } catch (error) {
    // One unreadable/deleted course must never take down the whole
    // enrollments list — the caller already falls back to "Untitled
    // training" for a null entry, same as a genuinely missing course.
    console.error("[student-data] loadCourseInfo failed", { courseId, code: error?.code || "unknown" });
    return null;
  }
}

export function subscribeMyEnrollments(uid, onData, onError) {
  if (!db || !uid) return () => {};
  return onSnapshot(
    query(collection(db, "enrollments"), where("studentId", "==", uid)),
    async (snapshot) => {
      const enrollments = snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .filter((item) => item.status !== "withdrawn");
      const courseIds = [...new Set(enrollments.map((item) => item.courseId))];
      const courseEntries = await Promise.all(courseIds.map((id) => loadCourseInfo(id).then((course) => [id, course])));
      const courseMap = new Map(courseEntries);
      onData(
        enrollments.map((item) => ({
          ...item,
          courseTitle: courseMap.get(item.courseId)?.title || "Untitled training",
          courseCode: courseMap.get(item.courseId)?.courseCode || item.courseId,
          // The real, existing course lifecycle field (Draft/Upcoming/
          // Active/Completed/Archived) — used by the Dashboard's Course
          // Status Summary so "Completed" reflects the course's own real
          // status rather than a new, invented per-student completion flag.
          courseStatus: courseMap.get(item.courseId)?.status || "",
        })),
      );
    },
    (error) =>
      reportQueryError(error, {
        collectionName: "enrollments",
        queryDescription: `collection(enrollments) where studentId == ${uid}`,
        uid,
        onError,
      }),
  );
}

// Class name/course id cache — a class's name and courseId rarely change
// while a student is looking at their attendance, so these are fetched
// once per classId (not on every snapshot) and reused, same reasoning as
// loadCourseInfo above.
const classInfoCache = new Map();
async function loadClassInfo(classId) {
  if (!db || !classId) return null;
  if (classInfoCache.has(classId)) return classInfoCache.get(classId);
  const promise = getDoc(doc(db, "classes", classId)).then((snapshot) =>
    snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null,
  );
  classInfoCache.set(classId, promise);
  return promise;
}

// A student's own attendance — real records only, from the exact same
// `attendance` collection Teacher's QR check-in/out
// (app/api/teacher/attendance/scan) and manual marking (saveAttendance)
// already write to. There is no second attendance store: this is the same
// data Teacher/Admin/Director already see, just scoped to this student via
// firestore.rules' `resource.data.studentId == request.auth.uid` (a
// student can never widen this query to see anyone else's records — the
// `where` clause is hardcoded to their own uid, not a URL param).
//
// `courseId` is present directly on records created via the QR scan route,
// but NOT on manually-marked records (which only ever recorded classId) —
// resolved here via a `classes/{classId}` lookup so both write paths are
// grouped consistently, rather than treating them as two different shapes.
export function subscribeMyAttendance(uid, onData, onError) {
  if (!db || !uid) return () => {};
  return onSnapshot(
    query(collection(db, "attendance"), where("studentId", "==", uid)),
    async (snapshot) => {
      const records = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      const classIds = [...new Set(records.map((item) => item.classId).filter(Boolean))];
      const classEntries = await Promise.all(classIds.map((id) => loadClassInfo(id).then((info) => [id, info])));
      const classMap = new Map(classEntries);
      const courseIds = [...new Set(records.map((item) => item.courseId || classMap.get(item.classId)?.courseId).filter(Boolean))];
      const courseEntries = await Promise.all(courseIds.map((id) => loadCourseInfo(id).then((course) => [id, course])));
      const courseMap = new Map(courseEntries);
      onData(
        records
          .map((item) => {
            const classInfo = classMap.get(item.classId);
            const courseId = item.courseId || classInfo?.courseId || "";
            return {
              ...item,
              courseId,
              courseTitle: courseMap.get(courseId)?.title || "Untitled training",
              className: classInfo?.name || "",
            };
          })
          .sort((a, b) => String(b.date || "").localeCompare(String(a.date || ""))),
      );
    },
    (error) =>
      reportQueryError(error, {
        collectionName: "attendance",
        queryDescription: `collection(attendance) where studentId == ${uid}`,
        uid,
        onError,
      }),
  );
}

export function subscribeMyPayments(uid, onData, onError) {
  if (!db || !uid) return () => {};
  return onSnapshot(
    query(collection(db, "payments"), where("studentId", "==", uid)),
    (snapshot) => onData(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
    (error) =>
      reportQueryError(error, {
        collectionName: "payments",
        queryDescription: `collection(payments) where studentId == ${uid}`,
        uid,
        onError,
      }),
  );
}
