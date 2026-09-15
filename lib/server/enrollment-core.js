import { FieldValue } from "firebase-admin/firestore";
import { effectiveCapacity } from "../enrollment";
import { ensureUserId } from "./user-id";
import { computeStatus } from "./payment-core";
import { ensureBatchGroupChat } from "./batch-chat";
import { ensureInvoiceNumber } from "./invoice-id";

const plain = (snapshot) => ({ id: snapshot.id, ...snapshot.data() });
const date = (value) => (value?.toDate ? value.toDate().toISOString() : typeof value === "string" ? value : null);

// Shared by both /api/admin/enrollments (Admin/Director) and
// /api/teacher/enrollments (assigned Teacher). Each route applies its own
// authorization gate before calling into this module — nothing here decides
// *who* is allowed, only what a permitted caller can see/do.

// Courses created before the auto-class-creation logic existed (e.g.
// legacy TRN-001/TRN-002 style records) can have teacherIds but no linked
// class at all. Rather than permanently blocking Students/Attendance for
// them, self-heal once: reuse an existing class for this course if one
// happens to exist, otherwise create the missing class now (same shape
// Phase 0 already creates for new trainings) and link it back onto the
// course via primaryClassId. Runs at most once per legacy course.
async function ensurePrimaryClass(db, courseId, course) {
  if (course.primaryClassId) {
    const classSnap = await db.collection("classes").doc(course.primaryClassId).get();
    if (classSnap.exists) return plain(classSnap);
  }
  const existing = await db.collection("classes").where("courseId", "==", courseId).limit(1).get();
  let classDoc;
  if (!existing.empty) {
    classDoc = plain(existing.docs[0]);
  } else {
    const ref = await db.collection("classes").add({
      courseId,
      name: course.batchName || course.title || "Batch",
      teacherIds: course.teacherIds || [],
      campus: course.campus || "",
      building: course.building || "",
      room: course.room || "",
      floor: course.floor || "",
      startDate: course.startDate || "",
      endDate: course.endDate || "",
      startTime: course.startTime || "",
      endTime: course.endTime || "",
      maxStudents: course.maxStudents ?? null,
      status: "active",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    classDoc = { id: ref.id, courseId };
  }
  await db.collection("courses").doc(courseId).update({ primaryClassId: classDoc.id });
  return classDoc;
}

export async function loadCourseAndClass(db, courseId) {
  const courseSnap = await db.collection("courses").doc(courseId).get();
  if (!courseSnap.exists) return { error: { status: 404, message: "Training not found." } };
  const course = plain(courseSnap);
  const classDoc = await ensurePrimaryClass(db, courseId, course);
  if (!course.primaryClassId) course.primaryClassId = classDoc.id;
  return { course, classDoc };
}

export async function activeEnrollmentsForClass(db, classId) {
  const snapshot = await db.collection("enrollments").where("classId", "==", classId).get();
  return snapshot.docs.map(plain).filter((item) => item.status !== "withdrawn");
}

// includePayments=false strips fee/payment fields from the response
// entirely (not just hidden in the UI) — used by /api/teacher/enrollments,
// since Teacher must not have access to financial/payment information.
export async function buildEnrollmentsPayload(db, course, classDoc, { includePayments = true } = {}) {
  // "Guest" is included alongside "Student" so a Guest can be picked here
  // too — enrolling one auto-promotes them to Student (createEnrollment
  // below), which is how a self-registered account becomes a real student.
  const [activeEnrollments, studentsSnapshot] = await Promise.all([
    activeEnrollmentsForClass(db, course.primaryClassId),
    db.collection("users").where("role", "in", ["Student", "Guest"]).get(),
  ]);

  const studentIds = activeEnrollments.map((item) => item.studentId);
  const studentDocs = studentIds.length
    ? await db.getAll(...studentIds.map((id) => db.collection("users").doc(id)))
    : [];
  const studentMap = new Map(studentDocs.filter((doc) => doc.exists).map((doc) => [doc.id, plain(doc)]));

  // The Firebase UID must never reach the UI as a "User ID" — backfill any
  // student who's still missing their unified User ID the moment they'd
  // otherwise be displayed here (belt-and-suspenders on top of the
  // login-time self-heal in lib/auth-context.js).
  const allStudentRows = studentsSnapshot.docs.map(plain);
  await Promise.all(
    allStudentRows
      .filter((student) => !student.userId)
      .map((student) => ensureUserId(db, student.id).then((id) => { student.userId = id; })),
  );
  for (const student of studentMap.values()) {
    if (!student.userId) {
      const fresh = allStudentRows.find((row) => row.id === student.id);
      if (fresh?.userId) student.userId = fresh.userId;
    }
  }

  const enrollments = activeEnrollments
    .map((item) => {
      const student = studentMap.get(item.studentId);
      if (!student) return null;
      // Legacy enrollments created before pricing existed have none of
      // these fields — default to a zero-fee, already-settled admission
      // rather than crashing or showing garbage numbers.
      const trainingFee = Number(item.trainingFee) || 0;
      const discount = Number(item.discount) || 0;
      const finalFee = Number.isFinite(item.finalFee) ? item.finalFee : Math.max(0, trainingFee - discount);
      const totalPaid = Number(item.totalPaid) || 0;
      const dueAmount = Number.isFinite(item.dueAmount) ? item.dueAmount : Math.max(0, finalFee - totalPaid);
      const base = {
        enrollmentId: `${item.courseId}_${item.studentId}`,
        studentId: item.studentId,
        userId: student.userId || "—",
        displayName: student.displayName || "",
        email: student.email || "",
        phone: student.phone || "",
        active: student.active !== false,
        status: item.status,
        enrolledAt: date(item.enrolledAt),
      };
      if (!includePayments) return base;
      return {
        ...base,
        trainingFee,
        discount,
        finalFee,
        totalPaid,
        dueAmount,
        paymentStatus: item.paymentStatus || computeStatus(finalFee, totalPaid),
        currency: item.currency || "SGD",
      };
    })
    .filter(Boolean)
    .sort((left, right) => (left.displayName || "").localeCompare(right.displayName || ""));

  const enrolledIds = new Set(enrollments.map((item) => item.studentId));
  const allStudents = allStudentRows
    .filter((student) => student.active !== false)
    .map((student) => ({
      id: student.id,
      userId: student.userId || "—",
      displayName: student.displayName || "",
      email: student.email || "",
      role: student.role,
      alreadyEnrolled: enrolledIds.has(student.id),
    }))
    .sort((left, right) => (left.displayName || "").localeCompare(right.displayName || ""));

  const capacity = effectiveCapacity(classDoc.maxStudents ?? course.maxStudents, course.seatCapacity);
  return { enrollments, allStudents, enrolledCount: enrollments.length, capacity, classId: course.primaryClassId };
}

// Runs the full validation chain (student exists -> active -> not already
// enrolled -> capacity available) and creates/reactivates the enrollment.
// Returns a plain {status, body} result — never throws for expected
// validation failures, only for genuine unexpected errors.
export async function createEnrollment(db, course, classDoc, studentId) {
  const studentSnap = await db.collection("users").doc(studentId).get();
  const studentRole = studentSnap.exists ? studentSnap.data().role : null;
  // A "Guest" (the default role for every new self-registration — see
  // createProfile in lib/auth-context.js) may also be enrolled: doing so
  // auto-promotes them to "Student" below, since being enrolled in a real
  // training IS what makes someone a student, no separate approval step.
  if (!studentSnap.exists || (studentRole !== "Student" && studentRole !== "Guest")) {
    return { status: 400, body: { message: "Choose a valid student." } };
  }
  if (studentSnap.data().active === false) {
    return { status: 400, body: { message: "This student account is inactive." } };
  }

  const classId = course.primaryClassId;
  const activeEnrollments = await activeEnrollmentsForClass(db, classId);
  const capacity = effectiveCapacity(classDoc.maxStudents ?? course.maxStudents, course.seatCapacity);

  const enrollmentRef = db.collection("enrollments").doc(`${course.id}_${studentId}`);
  const existing = await enrollmentRef.get();
  const alreadyActive = existing.exists && existing.data().status !== "withdrawn";
  if (alreadyActive) {
    return { status: 409, body: { message: "This student is already enrolled in this training." } };
  }

  if (capacity != null && activeEnrollments.length >= capacity) {
    return { status: 409, body: { message: "This training is full. No more students can be enrolled." } };
  }

  // Snapshot the course's fee/discount at admission time — later price
  // changes on the course must not silently change what an already-enrolled
  // student owes.
  const trainingFee = Number(course.price) || 0;
  const discount = Math.min(Number(course.discountPrice) || 0, trainingFee);
  const finalFee = Math.max(0, trainingFee - discount);

  const now = FieldValue.serverTimestamp();
  await enrollmentRef.set(
    {
      courseId: course.id,
      classId,
      studentId,
      status: "active",
      enrolledAt: now,
      completedAt: null,
      trainingFee,
      discount,
      finalFee,
      totalPaid: 0,
      dueAmount: finalFee,
      paymentStatus: computeStatus(finalFee, 0),
      currency: "SGD",
    },
    { merge: true },
  );
  // Every enrollment IS its invoice (trainingFee/discount/finalFee/
  // totalPaid/dueAmount/paymentStatus above already are the invoice's own
  // fields) — this just gives it the human-readable number a real invoice
  // needs, minted once and never re-minted (ensureInvoiceNumber is
  // idempotent, same pattern as ensureUserId).
  const invoiceNumber = await ensureInvoiceNumber(db, enrollmentRef, {});
  const studentUpdates = { updatedAt: now };
  if (Array.isArray(course.teacherIds) && course.teacherIds.length) {
    studentUpdates.teacherIds = FieldValue.arrayUnion(...course.teacherIds);
  }
  if (studentRole === "Guest") {
    studentUpdates.role = "Student";
    studentUpdates.status = "active";
  }
  if (Object.keys(studentUpdates).length > 1) {
    await db.collection("users").doc(studentId).update(studentUpdates);
  }

  // Auto-add this student to the batch's group chat — creating it on the
  // first enrollment. Best-effort: a chat hiccup must never fail the
  // enrollment itself, which is the record that actually matters.
  try {
    const student = studentSnap.data();
    await ensureBatchGroupChat(db, {
      course,
      studentId,
      studentName: student.displayName || student.email || "",
      studentRole: studentUpdates.role || studentRole,
    });
  } catch (error) {
    console.error("[enrollment] failed to sync batch group chat", { courseId: course.id, studentId, code: error?.code || "unknown" });
  }

  await db.collection("notifications").add({
    userId: studentId,
    type: "enrollment",
    title: "Enrolled in a new training",
    body: `You have been enrolled in ${course.title || "a training program"}.`,
    entityId: enrollmentRef.id,
    actionUrl: null,
    readAt: null,
    createdAt: FieldValue.serverTimestamp(),
  });

  return {
    status: 201,
    body: {
      ok: true,
      enrolledCount: activeEnrollments.length + 1,
      capacity,
      enrollmentId: enrollmentRef.id,
      invoiceNumber,
      finalFee,
      totalPaid: 0,
      dueAmount: finalFee,
      paymentStatus: computeStatus(finalFee, 0),
    },
  };
}

export async function removeEnrollment(db, courseId, studentId) {
  const ref = db.collection("enrollments").doc(`${courseId}_${studentId}`);
  const snapshot = await ref.get();
  if (!snapshot.exists) return { status: 404, body: { message: "Enrollment not found." } };
  if (snapshot.data().status === "withdrawn") return { status: 200, body: { ok: true } };
  await ref.update({ status: "withdrawn", withdrawnAt: FieldValue.serverTimestamp() });
  return { status: 200, body: { ok: true } };
}
