import { FieldValue } from "firebase-admin/firestore";
import { attendancePercent } from "../attendance";
import { cacheDel } from "../redis-cache";

// Certificate generation lives here, inside the same server-side layer as
// every other completion-adjacent helper in this app (lib/server/*-core.js
// files), and is called from real existing write points — it does not
// introduce a second progress/completion system. See the header of
// checkAndIssueCertificate for exactly what "completion" means here and
// why: it's the course's own pre-existing (until now unused)
// certificateMinAttendance/certificateMinScore fields, checked against the
// exact same attendancePercent() and assessment-score data every other
// part of this app already uses.

const ORG_CODE = "NACADEMY";

// Human-readable, permanent certificate code — NACADEMY-2026-FSWD-000001.
// Sequential per course (not global) so each course's numbering is
// independent and meaningful, mirroring the exact `_counters` + transaction
// pattern already used for course codes (TRN-###) and student/teacher
// codes elsewhere in lib/server/*.
async function nextCertificateCode(db, courseCode, year) {
  const ref = db.collection("_counters").doc(`certificates_${courseCode || "GEN"}`);
  const sequence = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const next = (snapshot.data()?.lastNumber || 0) + 1;
    transaction.set(ref, { lastNumber: next, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return next;
  });
  return `${ORG_CODE}-${year}-${courseCode || "GEN"}-${String(sequence).padStart(6, "0")}`;
}

// Real average score for a student in a course, from the exact same
// `assessments` collection the Teacher gradebook (lib/teacher-assessments.js)
// already writes to — no second scoring system.
async function studentCourseScore(db, studentId, courseId) {
  const snapshot = await db.collection("assessments").where("studentId", "==", studentId).where("courseId", "==", courseId).get();
  const scores = snapshot.docs.map((doc) => doc.data()).filter((item) => typeof item.score === "number" && typeof item.maxScore === "number" && item.maxScore > 0);
  if (!scores.length) return null;
  const percentages = scores.map((item) => (item.score / item.maxScore) * 100);
  return Math.round(percentages.reduce((sum, value) => sum + value, 0) / percentages.length);
}

// Real attendance percentage for a student in a course, from the exact
// same `attendance` collection and attendancePercent() math every other
// attendance view in the app already uses.
async function studentCourseAttendance(db, studentId, courseId) {
  const snapshot = await db.collection("attendance").where("studentId", "==", studentId).where("courseId", "==", courseId).get();
  return attendancePercent(snapshot.docs.map((doc) => doc.data()));
}

// The one check-and-issue entry point. Called from every real place a
// student's attendance or score can change (attendance QR check-out,
// teacher attendance marking, teacher gradebook entry) — see those
// callers' comments. Idempotent: never issues a second active certificate
// for the same (studentId, courseId).
export async function checkAndIssueCertificate(db, { studentId, courseId }) {
  if (!studentId || !courseId) return null;

  const courseSnap = await db.collection("courses").doc(courseId).get();
  if (!courseSnap.exists) return null;
  const course = courseSnap.data();
  if (!course.certificateEnabled || !course.certificateTemplateId) return null;

  const templateSnap = await db.collection("certificateTemplates").doc(course.certificateTemplateId).get();
  if (!templateSnap.exists || templateSnap.data().status !== "active") return null;

  // Already has an active certificate for this exact course completion —
  // never issue a second one (duplicate prevention). Filtered in-memory
  // (student+course is only a 2-field equality query, no composite index
  // needed) rather than adding a 3rd `where` on status, and treats the
  // pre-existing manually-issued "issued" status as active too, since that
  // is the status this app's existing Teacher-manual certificate flow
  // (lib/teacher-data.js's createTeacherCertificate) already writes.
  const existingSnap = await db.collection("certificates")
    .where("studentId", "==", studentId)
    .where("courseId", "==", courseId)
    .get();
  if (existingSnap.docs.some((doc) => doc.data().status !== "revoked")) return null;

  const requiredAttendance = course.certificateMinAttendance;
  const requiredScore = course.certificateMinScore;
  if (requiredAttendance != null) {
    const attendance = await studentCourseAttendance(db, studentId, courseId);
    if (attendance == null || attendance < requiredAttendance) return null;
  }
  if (requiredScore != null) {
    const score = await studentCourseScore(db, studentId, courseId);
    if (score == null || score < requiredScore) return null;
  }

  const [studentSnap] = await db.getAll(db.collection("users").doc(studentId));
  const student = studentSnap.exists ? studentSnap.data() : {};
  const template = templateSnap.data();

  const year = new Date().getFullYear();
  const certificateCode = await nextCertificateCode(db, course.certificateCode, year);

  const now = FieldValue.serverTimestamp();
  const certRef = db.collection("certificates").doc();
  const achievementRef = db.collection("achievements").doc();

  const metadata = {
    studentName: student.displayName || student.email || "Student",
    studentUserId: student.userId || null,
    courseName: course.title || "Course",
    completionDate: new Date().toISOString().slice(0, 10),
  };

  await db.runTransaction(async (transaction) => {
    // Re-check inside the transaction to close the race-condition window
    // (two simultaneous triggers for the same student/course).
    const raceCheck = await transaction.get(
      db.collection("certificates").where("studentId", "==", studentId).where("courseId", "==", courseId),
    );
    if (raceCheck.docs.some((doc) => doc.data().status !== "revoked")) return;

    transaction.set(certRef, {
      certificateId: certRef.id,
      certificateCode,
      studentId,
      courseId,
      templateId: course.certificateTemplateId,
      achievementId: achievementRef.id,
      type: template.type || "course_completion",
      title: `${course.title || "Course"} — ${template.name || "Certificate"}`,
      teacherId: course.primaryTeacherId || null,
      classId: course.primaryClassId || null,
      metadata,
      status: "active",
      issueDate: now,
      createdAt: now,
      updatedAt: now,
    });
    transaction.set(achievementRef, {
      title: `Course Completion — ${course.title || "Course"}`,
      description: `Completed ${course.title || "this course"} and earned a certificate.`,
      type: "course_completion",
      studentId,
      courseId,
      certificateId: certRef.id,
      teacherId: course.primaryTeacherId || null,
      classId: course.primaryClassId || null,
      status: "awarded",
      awardedAt: now,
    });
    transaction.set(db.collection("notifications").doc(), {
      userId: studentId,
      type: "certificate.issued",
      title: "🎓 Certificate earned!",
      body: `You've earned a certificate for completing ${course.title || "your course"}.`,
      entityId: certRef.id,
      actionUrl: null,
      readAt: null,
      createdAt: now,
    });
  });

  return { certificateId: certRef.id, certificateCode };
}

// Revoke keeps the record (never deletes) and just flips status — a
// revoked certificate must still show up in admin history and in
// verification as explicitly "Revoked", never silently disappear.
export async function revokeCertificate(db, certificateId, revokedBy) {
  const ref = db.collection("certificates").doc(certificateId);
  const snapshot = await ref.get();
  await ref.update({
    status: "revoked",
    revokedAt: FieldValue.serverTimestamp(),
    revokedBy,
    updatedAt: FieldValue.serverTimestamp(),
  });
  // /api/verify/[certificateId] caches its result for 5 minutes keyed by
  // whichever id the verifier looked up with — clear both possible keys so
  // a revoked certificate never reads back as "valid" from a stale cache
  // entry.
  await cacheDel(`verify-cert:${certificateId}`);
  const code = snapshot.data()?.certificateCode;
  if (code) await cacheDel(`verify-cert:${code}`);
}

// Reissue: revoke the old one (kept as history) and mint a brand new
// certificate record with a new permanent code — never two active
// certificates for the same completion at once.
export async function reissueCertificate(db, certificateId, issuedBy) {
  const ref = db.collection("certificates").doc(certificateId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new Error("Certificate not found.");
  const original = snapshot.data();

  await revokeCertificate(db, certificateId, issuedBy);

  const courseSnap = await db.collection("courses").doc(original.courseId).get();
  const course = courseSnap.exists ? courseSnap.data() : {};
  const year = new Date().getFullYear();
  const certificateCode = await nextCertificateCode(db, course.certificateCode, year);

  const now = FieldValue.serverTimestamp();
  const newRef = db.collection("certificates").doc();
  await newRef.set({
    ...original,
    certificateId: newRef.id,
    certificateCode,
    status: "active",
    reissuedFrom: certificateId,
    issueDate: now,
    createdAt: now,
    updatedAt: now,
    revokedAt: null,
    revokedBy: null,
  });
  return newRef.id;
}
