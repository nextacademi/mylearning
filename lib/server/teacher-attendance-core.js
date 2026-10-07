import { FieldValue } from "firebase-admin/firestore";
import { singaporeDate } from "./singapore-date";

// Teacher attendance — whether the TEACHER showed up to teach a training on
// a given day. Deliberately its own `teacherAttendance` collection, not
// rows mixed into the student `attendance` collection: every existing
// consumer of `attendance` (attendancePercent, certificates, the Student
// Attendance page, reports) assumes each row is a student's record, and a
// teacher row there would silently skew all of them.
//
// One doc per teacher per training per day — `${courseId}_${teacherId}_${date}`
// — written either by a manager marking it by hand (Training → Attendance →
// Teachers) or by scanning the teacher's own ID card QR in Scan QR Code
// (first scan checks in, second checks out, same as students). Both paths
// write the same doc, so a scan and a manual mark can never double-count.
export const TEACHER_ATTENDANCE_STATUSES = ["present", "late", "absent", "excused"];

const plain = (snapshot) => ({ id: snapshot.id, ...snapshot.data() });
const iso = (value) => (value?.toDate ? value.toDate().toISOString() : typeof value === "string" ? value : null);
const docId = (courseId, teacherId, date) => `${courseId}_${teacherId}_${date}`;

function badRequest(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode });
}

export async function listTeacherAttendance(db, { courseId, teacherId } = {}) {
  let query = db.collection("teacherAttendance");
  if (courseId) query = query.where("courseId", "==", courseId);
  if (teacherId) query = query.where("teacherId", "==", teacherId);
  const snapshot = await query.get();
  const rows = snapshot.docs.map(plain);

  const teacherIds = [...new Set(rows.map((row) => row.teacherId).filter(Boolean))];
  const courseIds = [...new Set(rows.map((row) => row.courseId).filter(Boolean))];
  const markerIds = [...new Set(rows.map((row) => row.markedBy).filter(Boolean))];
  const userIds = [...new Set([...teacherIds, ...markerIds])];
  const [userDocs, courseDocs] = await Promise.all([
    userIds.length ? db.getAll(...userIds.map((id) => db.collection("users").doc(id))) : [],
    courseIds.length ? db.getAll(...courseIds.map((id) => db.collection("courses").doc(id))) : [],
  ]);
  const users = new Map(userDocs.filter((d) => d.exists).map((d) => [d.id, d.data()]));
  const courses = new Map(courseDocs.filter((d) => d.exists).map((d) => [d.id, d.data()]));
  const nameOf = (id) => users.get(id)?.displayName || users.get(id)?.email || id || "";

  return rows
    .map((row) => ({
      ...row,
      teacherName: nameOf(row.teacherId),
      teacherEmail: users.get(row.teacherId)?.email || "",
      teacherPhone: users.get(row.teacherId)?.phone || "",
      courseTitle: courses.get(row.courseId)?.title || "",
      courseCode: courses.get(row.courseId)?.courseCode || "",
      markedByName: nameOf(row.markedBy),
      checkInAt: iso(row.checkInAt),
      checkOutAt: iso(row.checkOutAt),
      markedAt: iso(row.markedAt),
    }))
    .sort((a, b) => (b.date || "").localeCompare(a.date || "") || a.teacherName.localeCompare(b.teacherName));
}

// Manual marking by Admin/Director. `records` is [{ teacherId, status, note }].
// merge: true so a manual status change never wipes a QR check-in/out time
// already recorded for that day.
export async function markTeacherAttendance(db, { courseId, classId, date, records, markedBy }) {
  if (typeof courseId !== "string" || !courseId) throw badRequest("Choose a training.");
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw badRequest("Choose a valid date.");
  if (!Array.isArray(records) || !records.length) throw badRequest("Nothing to save.");

  const courseSnap = await db.collection("courses").doc(courseId).get();
  if (!courseSnap.exists) throw badRequest("Training not found.", 404);
  const assigned = new Set(courseSnap.data().teacherIds || []);

  const batch = db.batch();
  const now = FieldValue.serverTimestamp();
  for (const record of records) {
    const teacherId = typeof record?.teacherId === "string" ? record.teacherId : "";
    if (!assigned.has(teacherId)) throw badRequest("Only teachers assigned to this training can be marked.");
    const status = TEACHER_ATTENDANCE_STATUSES.includes(record.status) ? record.status : "";
    if (!status) throw badRequest("Choose a valid attendance status.");
    batch.set(
      db.collection("teacherAttendance").doc(docId(courseId, teacherId, date)),
      {
        courseId,
        classId: typeof classId === "string" ? classId : "",
        teacherId,
        date,
        status,
        note: typeof record.note === "string" ? record.note.trim().slice(0, 300) : "",
        markedBy,
        markedAt: now,
      },
      { merge: true },
    );
  }
  await batch.commit();
  return { saved: records.length };
}

// QR path: a manager scans the teacher's own ID card against a class.
// First scan of the day checks in (status "present"), the second checks
// out and records the minutes in between, any further scan is a no-op —
// the same contract as the student scan in attendance-core.js.
export async function recordTeacherScan(db, { classId, courseId, teacherId, markedBy, sessionId }) {
  const date = singaporeDate();
  const ref = db.collection("teacherAttendance").doc(docId(courseId, teacherId, date));
  return db.runTransaction(async (transaction) => {
    const existing = await transaction.get(ref);
    const now = FieldValue.serverTimestamp();
    if (!existing.exists || !existing.data().checkInAt) {
      transaction.set(
        ref,
        {
          courseId,
          classId,
          teacherId,
          date,
          // Physically scanning in overrides an earlier "absent" mark;
          // a manual "late" is kept.
          status: existing.exists && existing.data().status === "late" ? "late" : "present",
          checkInAt: now,
          checkOutAt: null,
          durationMinutes: null,
          markedBy,
          markedAt: now,
          ...(sessionId ? { sessionId } : {}),
        },
        { merge: true },
      );
      return { code: "checked_in", message: "Teacher checked in." };
    }
    const record = existing.data();
    if (record.checkOutAt) return { code: "already_checked_out", message: "This teacher has already checked in and out today." };
    const checkIn = record.checkInAt?.toDate?.() || null;
    const durationMinutes = checkIn ? Math.max(0, Math.round((Date.now() - checkIn.getTime()) / 60000)) : null;
    transaction.update(ref, { checkOutAt: now, durationMinutes });
    return { code: "checked_out", message: "Teacher checked out.", durationMinutes };
  });
}
