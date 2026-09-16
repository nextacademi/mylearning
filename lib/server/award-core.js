import { FieldValue } from "firebase-admin/firestore";
import { nextCertificateCode } from "./certificate-core";

// Awards live in the SAME `achievements` collection every other part of
// this app already reads/writes (Teacher's manual "Award" flow, the
// auto-issued course-completion achievement, the student's own "My
// Achievements" page) — not a second collection. firestore.rules'
// existing `achievements` rule already gives admin() full create/update
// (and the student their own read), so no rules change is needed.
// `kind: "award"` is the only thing that distinguishes an Award from a
// plain Teacher-given achievement; every other existing reader that
// doesn't check `kind` keeps working unchanged (an Award still looks like
// a normal achievement to them — title/description/type/studentId/status).
// AWARD_TYPES itself lives in achievement-shared.js (client-safe) so the
// Awards form and this validator never drift apart.

function badRequest(message) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

// Same `_counters` + transaction pattern as certificate codes (this file's
// nextCertificateCode) and invoice numbers (lib/server/invoice-id.js) —
// one shared per-year sequence, formatted exactly as requested:
// AWD-2026-0001.
async function nextAwardId(db, year) {
  const ref = db.collection("_counters").doc(`awards_${year}`);
  const sequence = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const next = (snapshot.data()?.lastNumber || 0) + 1;
    transaction.set(ref, { lastNumber: next, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return next;
  });
  return `AWD-${year}-${String(sequence).padStart(4, "0")}`;
}

function validateAwardInput(body) {
  const studentId = typeof body.studentId === "string" ? body.studentId.trim() : "";
  if (!studentId) throw badRequest("Choose a student.");
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) throw badRequest("Award title is required.");
  const type = typeof body.type === "string" && body.type.trim() ? body.type.trim() : "Custom";
  const awardDate = typeof body.awardDate === "string" && body.awardDate ? body.awardDate : new Date().toISOString().slice(0, 10);
  return {
    studentId,
    title: title.slice(0, 200),
    type: type.slice(0, 80),
    description: typeof body.description === "string" ? body.description.trim().slice(0, 1000) : "",
    courseId: typeof body.courseId === "string" ? body.courseId.trim() : "",
    icon: typeof body.icon === "string" && body.icon.trim() ? body.icon.trim().slice(0, 8) : "🏆",
    awardDate,
    generateCertificate: Boolean(body.generateCertificate),
    templateId: typeof body.templateId === "string" ? body.templateId.trim() : "",
  };
}

// Every award/student/course row the Awards tab's table + filters need,
// in one call — same shape as listAdmissions/buildEnrollmentsPayload
// elsewhere in lib/server/*: read the collection, batch-resolve the
// referenced docs, denormalize names onto each row.
export async function listAwards(db) {
  const snapshot = await db.collection("achievements").where("kind", "==", "award").get();
  const rows = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  if (!rows.length) return [];

  const studentIds = [...new Set(rows.map((row) => row.studentId).filter(Boolean))];
  const courseIds = [...new Set(rows.map((row) => row.courseId).filter(Boolean))];
  const [studentSnaps, courseSnaps] = await Promise.all([
    studentIds.length ? db.getAll(...studentIds.map((id) => db.collection("users").doc(id))) : [],
    courseIds.length ? db.getAll(...courseIds.map((id) => db.collection("courses").doc(id))) : [],
  ]);
  const students = new Map(studentSnaps.filter((s) => s.exists).map((s) => [s.id, s.data()]));
  const courses = new Map(courseSnaps.filter((s) => s.exists).map((s) => [s.id, s.data()]));

  return rows
    .map((row) => ({
      ...row,
      studentName: students.get(row.studentId)?.displayName || students.get(row.studentId)?.email || row.studentId || "",
      studentUserId: students.get(row.studentId)?.userId || "",
      courseName: row.courseId ? courses.get(row.courseId)?.title || "" : "",
    }))
    .sort((a, b) => (b.awardDate || "").localeCompare(a.awardDate || ""));
}

// Creates the award (achievements doc, kind:"award") and, when
// generateCertificate is on, a real certificate alongside it in the same
// transaction — exactly the same certificates-doc shape
// checkAndIssueCertificate already writes (metadata/status/issueDate),
// linked back via achievementId, so it shows up in "Generated
// Certificates" / verification / the student's own certificates page
// with zero special-casing anywhere else in the app.
export async function createAward(db, body, createdBy, createdByName) {
  const fields = validateAwardInput(body);

  const [studentSnap, courseSnap] = await Promise.all([
    db.collection("users").doc(fields.studentId).get(),
    fields.courseId ? db.collection("courses").doc(fields.courseId).get() : Promise.resolve(null),
  ]);
  if (!studentSnap.exists) throw badRequest("Choose a valid student.");
  const student = studentSnap.data();
  const course = courseSnap?.exists ? courseSnap.data() : null;

  let template = null;
  if (fields.generateCertificate) {
    if (!fields.templateId) throw badRequest("Choose a certificate template to generate a certificate.");
    const templateSnap = await db.collection("certificateTemplates").doc(fields.templateId).get();
    if (!templateSnap.exists || templateSnap.data().status !== "active") throw badRequest("Choose an active certificate template.");
    template = templateSnap.data();
  }

  const year = new Date().getFullYear();
  const awardId = await nextAwardId(db, year);
  // Minted before the transaction (same reason checkAndIssueCertificate
  // does this) — nextCertificateCode runs its own counter transaction
  // internally, and Firestore doesn't support nested transactions.
  const certificateCode = fields.generateCertificate
    ? await nextCertificateCode(db, course?.courseCode || "AWARD", year)
    : null;

  const now = FieldValue.serverTimestamp();
  const awardRef = db.collection("achievements").doc();
  const certRef = fields.generateCertificate ? db.collection("certificates").doc() : null;

  await db.runTransaction(async (transaction) => {
    transaction.set(awardRef, {
      kind: "award",
      awardId,
      studentId: fields.studentId,
      courseId: fields.courseId || null,
      title: fields.title,
      type: fields.type,
      description: fields.description,
      icon: fields.icon,
      awardDate: fields.awardDate,
      awardedBy: createdBy,
      awardedByName: (createdByName || "").slice(0, 200),
      certificateId: certRef?.id || null,
      status: "active",
      createdAt: now,
      updatedAt: now,
      // Kept so every EXISTING achievements reader (student's "My
      // Achievements" page, the read-only admin "Achievements" tab) that
      // doesn't know about `kind` still displays this correctly.
      awardedAt: now,
    });

    if (certRef) {
      transaction.set(certRef, {
        certificateId: certRef.id,
        certificateCode,
        studentId: fields.studentId,
        courseId: fields.courseId || null,
        templateId: fields.templateId,
        achievementId: awardRef.id,
        type: "award",
        title: `${fields.title} — ${template.name || "Certificate"}`,
        teacherId: null,
        classId: null,
        metadata: {
          studentName: student.displayName || student.email || "Student",
          studentUserId: student.userId || null,
          courseName: course?.title || "",
          completionDate: fields.awardDate,
        },
        status: "active",
        issueDate: now,
        createdAt: now,
        updatedAt: now,
      });
    }

    transaction.set(db.collection("notifications").doc(), {
      userId: fields.studentId,
      type: "award.issued",
      title: `${fields.icon} You received an award!`,
      body: `You've been awarded "${fields.title}".`,
      entityId: awardRef.id,
      actionUrl: null,
      readAt: null,
      createdAt: now,
    });
  });

  return { id: awardRef.id, awardId, certificateId: certRef?.id || null, certificateCode };
}

// Edit — never touches student or certificate generation (an award's
// certificate, once issued, is immutable history same as every other
// certificate in this app; revoke+recreate if it was genuinely wrong).
export async function updateAward(db, id, body) {
  const ref = db.collection("achievements").doc(id);
  const snapshot = await ref.get();
  if (!snapshot.exists || snapshot.data().kind !== "award") throw Object.assign(new Error("Award not found."), { statusCode: 404 });

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) throw badRequest("Award title is required.");
  const courseId = typeof body.courseId === "string" ? body.courseId.trim() : "";

  await ref.update({
    title: title.slice(0, 200),
    type: typeof body.type === "string" && body.type.trim() ? body.type.trim().slice(0, 80) : snapshot.data().type,
    description: typeof body.description === "string" ? body.description.trim().slice(0, 1000) : "",
    courseId: courseId || null,
    icon: typeof body.icon === "string" && body.icon.trim() ? body.icon.trim().slice(0, 8) : snapshot.data().icon,
    awardDate: typeof body.awardDate === "string" && body.awardDate ? body.awardDate : snapshot.data().awardDate,
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { ok: true };
}

// Revoke keeps the record (never deletes) and just flips status — same
// convention as revokeCertificate. Does NOT revoke a linked certificate
// automatically: the certificate is its own real credential with its own
// revoke action in the Generated Certificates tab, kept as a deliberate
// separate decision rather than a silent side effect.
export async function revokeAward(db, id) {
  const ref = db.collection("achievements").doc(id);
  const snapshot = await ref.get();
  if (!snapshot.exists || snapshot.data().kind !== "award") throw Object.assign(new Error("Award not found."), { statusCode: 404 });
  await ref.update({ status: "revoked", updatedAt: FieldValue.serverTimestamp() });
  return { ok: true };
}
