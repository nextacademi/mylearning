import { FieldValue } from "firebase-admin/firestore";
import { ensureUserId } from "./user-id";
import { ensureInvoiceNumber } from "./invoice-id";

const plain = (snapshot) => ({ id: snapshot.id, ...snapshot.data() });
const date = (value) => (value?.toDate ? value.toDate().toISOString() : typeof value === "string" ? value : null);

// Single source of truth for payment status — always derived from the
// actual numbers, never trusted from a client payload.
export function computeStatus(finalFee, totalPaid) {
  if (totalPaid >= finalFee) return "Paid";
  if (totalPaid > 0) return "Partial";
  return "Unpaid";
}

const paymentMethods = new Set(["Cash", "Bank Transfer", "bKash", "Rocket", "Card", "Other"]);

// Runs inside a transaction so two concurrent "Collect Payment" submissions
// (e.g. two admin tabs open on the same enrollment) can never both succeed
// against a stale `dueAmount` and overpay/underpay the record. Every
// successful call creates a brand-new payments doc — existing payment
// records are never edited or removed here.
export async function recordPayment(db, { courseId, studentId, amount, paymentMethod, paymentDate, reference, notes, createdBy }) {
  const enrollmentId = `${courseId}_${studentId}`;
  const enrollmentRef = db.collection("enrollments").doc(enrollmentId);
  const paymentRef = db.collection("payments").doc();

  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return { status: 400, body: { message: "Payment amount must be greater than zero." } };
  }
  if (!paymentMethods.has(paymentMethod)) {
    return { status: 400, body: { message: "Choose a valid payment method." } };
  }

  try {
    const result = await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(enrollmentRef);
      if (!snapshot.exists || snapshot.data().status === "withdrawn") {
        throw Object.assign(new Error("Enrollment not found."), { statusCode: 404 });
      }
      const enrollment = snapshot.data();
      const finalFee = Number(enrollment.finalFee) || 0;
      const totalPaidBefore = Number(enrollment.totalPaid) || 0;
      const dueBefore = Math.max(0, finalFee - totalPaidBefore);

      if (dueBefore <= 0) {
        throw Object.assign(new Error("This admission is already fully paid."), { statusCode: 400 });
      }
      if (numericAmount > dueBefore) {
        throw Object.assign(new Error("Payment amount cannot be greater than the outstanding due."), { statusCode: 400 });
      }

      const totalPaidAfter = totalPaidBefore + numericAmount;
      const dueAfter = Math.max(0, finalFee - totalPaidAfter);
      const paymentStatus = computeStatus(finalFee, totalPaidAfter);
      const now = FieldValue.serverTimestamp();

      transaction.set(paymentRef, {
        enrollmentId,
        studentId,
        courseId,
        amount: numericAmount,
        currency: "SGD",
        paymentMethod,
        paymentDate: typeof paymentDate === "string" && paymentDate ? paymentDate : new Date().toISOString().slice(0, 10),
        reference: typeof reference === "string" ? reference.trim().slice(0, 120) : "",
        notes: typeof notes === "string" ? notes.trim().slice(0, 500) : "",
        createdBy,
        createdAt: now,
        status: "Paid",
        previousPaid: totalPaidBefore,
      });
      transaction.update(enrollmentRef, {
        totalPaid: totalPaidAfter,
        dueAmount: dueAfter,
        paymentStatus,
        updatedAt: now,
      });

      return { totalPaid: totalPaidAfter, dueAmount: dueAfter, paymentStatus, finalFee, previousPaid: totalPaidBefore };
    });

    const courseSnap = await db.collection("courses").doc(courseId).get();
    const courseTitle = courseSnap.exists ? courseSnap.data().title || "your training" : "your training";
    await db.collection("notifications").add({
      userId: studentId,
      type: "payment",
      title: "Payment received",
      body: `A payment of S$${numericAmount.toLocaleString()} was recorded for ${courseTitle}.`,
      entityId: paymentRef.id,
      actionUrl: null,
      readAt: null,
      createdAt: FieldValue.serverTimestamp(),
    });

    // So the frontend's "Payment Successful" screen can immediately offer
    // [View/Print/Download Invoice] without a second round-trip — backfills
    // the invoice number too, for any enrollment that predates it.
    const enrollmentSnap = await enrollmentRef.get();
    const invoiceNumber = await ensureInvoiceNumber(db, enrollmentRef, enrollmentSnap.data() || {});

    return { status: 201, body: { ok: true, paymentId: paymentRef.id, enrollmentId, invoiceNumber, ...result } };
  } catch (error) {
    if (error.statusCode) return { status: error.statusCode, body: { message: error.message } };
    throw error;
  }
}

export async function listPaymentsForEnrollment(db, enrollmentId) {
  const snapshot = await db.collection("payments").where("enrollmentId", "==", enrollmentId).get();
  return snapshot.docs
    .map(plain)
    .map((item) => ({ ...item, paymentDate: item.paymentDate || date(item.createdAt), createdAt: date(item.createdAt) }))
    .sort((left, right) => (right.paymentDate || "").localeCompare(left.paymentDate || "") || (right.createdAt || "").localeCompare(left.createdAt || ""));
}

// Cross-training admissions list for the Finance/Admissions page.
export async function listAdmissions(db) {
  const enrollmentsSnapshot = await db.collection("enrollments").get();
  const enrollments = enrollmentsSnapshot.docs.map(plain).filter((item) => item.status !== "withdrawn");
  if (!enrollments.length) return [];

  const courseIds = [...new Set(enrollments.map((item) => item.courseId))];
  const studentIds = [...new Set(enrollments.map((item) => item.studentId))];
  const [courseDocs, studentDocs] = await Promise.all([
    courseIds.length ? db.getAll(...courseIds.map((id) => db.collection("courses").doc(id))) : [],
    studentIds.length ? db.getAll(...studentIds.map((id) => db.collection("users").doc(id))) : [],
  ]);
  const courseMap = new Map(courseDocs.filter((doc) => doc.exists).map((doc) => [doc.id, plain(doc)]));
  const students = studentDocs.filter((doc) => doc.exists).map(plain);
  // The Firebase UID must never reach the UI as a "User ID" — backfill any
  // student still missing their unified User ID before rendering.
  await Promise.all(
    students
      .filter((student) => !student.userId)
      .map((student) => ensureUserId(db, student.id).then((id) => { student.userId = id; })),
  );
  const studentMap = new Map(students.map((student) => [student.id, student]));

  // Backfill invoiceNumber for any enrollment that predates it (legacy
  // data) — idempotent, safe to run on every load; enrollments created
  // going forward already have one from createEnrollment.
  await Promise.all(
    enrollments
      .filter((item) => !item.invoiceNumber)
      .map((item) =>
        ensureInvoiceNumber(db, db.collection("enrollments").doc(item.id), item).then((invoiceNumber) => {
          item.invoiceNumber = invoiceNumber;
        }),
      ),
  );

  return enrollments
    .map((item) => {
      const course = courseMap.get(item.courseId);
      const student = studentMap.get(item.studentId);
      if (!course || !student) return null;
      const finalFee = Number(item.finalFee) || 0;
      const totalPaid = Number(item.totalPaid) || 0;
      return {
        enrollmentId: item.id,
        invoiceNumber: item.invoiceNumber || "—",
        courseId: item.courseId,
        courseCode: course.courseCode || course.id,
        courseTitle: course.title || "Untitled training",
        batchName: course.batchName || "",
        studentId: item.studentId,
        userId: student.userId || "—",
        studentName: student.displayName || student.email || "Unnamed student",
        studentEmail: student.email || "",
        studentPhone: student.phone || "",
        trainingFee: Number(item.trainingFee) || 0,
        discount: Number(item.discount) || 0,
        finalFee,
        totalPaid,
        dueAmount: Number.isFinite(item.dueAmount) ? item.dueAmount : Math.max(0, finalFee - totalPaid),
        paymentStatus: item.paymentStatus || computeStatus(finalFee, totalPaid),
        admissionStatus: item.status === "active" ? "Active" : item.status || "Active",
        admissionDate: date(item.enrolledAt),
        currency: item.currency || "SGD",
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.studentName.localeCompare(right.studentName));
}
