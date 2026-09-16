import { FieldValue } from "firebase-admin/firestore";
import { listAdmissions, computeStatus } from "./payment-core";
import { nextInvoiceNumber } from "./invoice-id";

// Two kinds of invoice, one unified read surface. Course-fee invoices are
// NOT stored here — the enrollment doc already IS that invoice (see
// createEnrollment in enrollment-core.js and listAdmissions in
// payment-core.js), reused as-is via listAllInvoices below so there is
// never a second, divergent copy of a course invoice. This `invoices`
// collection exists ONLY for invoices that aren't backed by a course
// enrollment at all (a registration fee, a material fee, ...) — the one
// genuine gap in the existing architecture.
const plain = (snapshot) => ({ id: snapshot.id, ...snapshot.data() });

export const INVOICE_TYPES = ["Registration Fee", "Material Fee", "Exam Fee", "Other"];
// Same allowlist payment-core.js's recordPayment already validates against
// — kept as its own copy here rather than importing a private binding,
// matching this codebase's existing precedent of one small allowlist per
// module (finance-core.js already keeps its own separate copy too).
const paymentMethods = new Set(["Cash", "Bank Transfer", "bKash", "Rocket", "Card", "Other"]);

function badRequest(message) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

function validateInvoiceInput(body) {
  const studentId = typeof body.studentId === "string" ? body.studentId.trim() : "";
  if (!studentId) throw badRequest("Choose a student.");
  const invoiceType = typeof body.invoiceType === "string" && INVOICE_TYPES.includes(body.invoiceType) ? body.invoiceType : "";
  if (!invoiceType) throw badRequest("Choose a valid invoice type.");
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw badRequest("Invoice amount must be greater than zero.");
  const discount = Math.min(Math.max(Number(body.discount) || 0, 0), amount);
  const dueDate = typeof body.dueDate === "string" && body.dueDate ? body.dueDate : "";
  const trim = (value, max) => (typeof value === "string" ? value.trim().slice(0, max) : "");
  return {
    studentId,
    invoiceType,
    courseId: trim(body.courseId, 200) || null,
    description: trim(body.description, 1000),
    subtotal: amount,
    discount,
    totalAmount: Math.max(0, amount - discount),
    dueDate,
    notes: trim(body.notes, 1000),
  };
}

// Every invoice, either kind, normalized to one row shape — this is what
// Finance→Invoices, Student Profile→Finance, and My Training→Other
// Invoices all read, so there is exactly one place that decides what an
// "invoice row" looks like.
export async function listAllInvoices(db, { studentId } = {}) {
  const [admissions, manualSnap] = await Promise.all([
    listAdmissions(db),
    db.collection("invoices").get(),
  ]);

  const enrollmentRows = admissions
    .filter((item) => !studentId || item.studentId === studentId)
    .map((item) => ({
      kind: "enrollment",
      id: item.enrollmentId,
      enrollmentId: item.enrollmentId,
      invoiceNumber: item.invoiceNumber,
      invoiceType: "Course Fee",
      studentId: item.studentId,
      studentName: item.studentName,
      studentUserId: item.userId,
      studentEmail: item.studentEmail,
      studentPhone: item.studentPhone,
      courseId: item.courseId,
      courseName: item.courseTitle,
      batchName: item.batchName,
      description: item.courseTitle,
      subtotal: item.trainingFee,
      discount: item.discount,
      totalAmount: item.finalFee,
      paidAmount: item.totalPaid,
      dueAmount: item.dueAmount,
      status: item.paymentStatus,
      issueDate: item.admissionDate,
      dueDate: null,
      notes: "",
      currency: item.currency,
    }));

  const manualDocs = manualSnap.docs.map(plain).filter((item) => !studentId || item.studentId === studentId);
  const manualStudentIds = [...new Set(manualDocs.map((item) => item.studentId).filter(Boolean))];
  const manualStudentSnaps = manualStudentIds.length ? await db.getAll(...manualStudentIds.map((id) => db.collection("users").doc(id))) : [];
  const manualStudents = new Map(manualStudentSnaps.filter((s) => s.exists).map((s) => [s.id, s.data()]));

  const manualRows = manualDocs.map((item) => {
    const student = manualStudents.get(item.studentId);
    return {
      kind: "manual",
      id: item.id,
      enrollmentId: null,
      invoiceNumber: item.invoiceNumber,
      invoiceType: item.invoiceType,
      studentId: item.studentId,
      studentName: student?.displayName || student?.email || item.studentName || "Student",
      studentUserId: student?.userId || "",
      studentEmail: student?.email || "",
      studentPhone: student?.phone || "",
      courseId: item.courseId || null,
      courseName: item.courseName || null,
      batchName: item.batchName || null,
      description: item.description || item.invoiceType,
      subtotal: Number(item.subtotal) || 0,
      discount: Number(item.discount) || 0,
      totalAmount: Number(item.totalAmount) || 0,
      paidAmount: Number(item.paidAmount) || 0,
      dueAmount: Number(item.dueAmount) || 0,
      status: item.status || "Unpaid",
      issueDate: item.issueDate || null,
      dueDate: item.dueDate || null,
      notes: item.notes || "",
      currency: item.currency || "SGD",
      createdByName: item.createdByName || "",
    };
  });

  return [...enrollmentRows, ...manualRows].sort((left, right) => (right.issueDate || "").localeCompare(left.issueDate || ""));
}

export async function createManualInvoice(db, body, createdBy, createdByName) {
  const fields = validateInvoiceInput(body);
  const [studentSnap, courseSnap] = await Promise.all([
    db.collection("users").doc(fields.studentId).get(),
    fields.courseId ? db.collection("courses").doc(fields.courseId).get() : Promise.resolve(null),
  ]);
  if (!studentSnap.exists) throw badRequest("Choose a valid student.");
  const student = studentSnap.data();
  const course = courseSnap?.exists ? courseSnap.data() : null;

  const year = new Date().getFullYear();
  const invoiceNumber = await nextInvoiceNumber(db, year);
  const now = FieldValue.serverTimestamp();
  const ref = db.collection("invoices").doc();
  await ref.set({
    invoiceNumber,
    invoiceType: fields.invoiceType,
    studentId: fields.studentId,
    studentName: student.displayName || student.email || "Student",
    courseId: fields.courseId,
    courseName: course?.title || null,
    batchName: course?.batchName || null,
    description: fields.description,
    subtotal: fields.subtotal,
    discount: fields.discount,
    totalAmount: fields.totalAmount,
    paidAmount: 0,
    dueAmount: fields.totalAmount,
    currency: "SGD",
    status: "Unpaid",
    issueDate: new Date().toISOString().slice(0, 10),
    dueDate: fields.dueDate || null,
    notes: fields.notes,
    createdBy,
    createdByName: (createdByName || "").slice(0, 200),
    updatedBy: createdBy,
    createdAt: now,
    updatedAt: now,
  });
  return { id: ref.id, invoiceNumber };
}

// While Unpaid, every field can still change (nothing has been collected
// against it yet). Once a payment exists (Partial/Paid), the amount is
// locked — only notes/due date remain editable — same "don't retroactively
// corrupt a paid ledger" rule this session already applied to certificates
// and awards.
export async function updateManualInvoice(db, id, body) {
  const ref = db.collection("invoices").doc(id);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw Object.assign(new Error("Invoice not found."), { statusCode: 404 });
  const current = snapshot.data();
  if (current.status === "Cancelled") throw badRequest("This invoice is cancelled and can no longer be edited.");

  const now = FieldValue.serverTimestamp();
  if (current.status === "Unpaid") {
    const fields = validateInvoiceInput({ ...current, ...body, studentId: current.studentId });
    let courseName = current.courseName || null;
    let batchName = current.batchName || null;
    if (fields.courseId !== current.courseId) {
      const courseSnap = fields.courseId ? await db.collection("courses").doc(fields.courseId).get() : null;
      courseName = courseSnap?.exists ? courseSnap.data().title || null : null;
      batchName = courseSnap?.exists ? courseSnap.data().batchName || null : null;
    }
    await ref.update({
      invoiceType: fields.invoiceType,
      courseId: fields.courseId,
      courseName,
      batchName,
      description: fields.description,
      subtotal: fields.subtotal,
      discount: fields.discount,
      totalAmount: fields.totalAmount,
      dueAmount: fields.totalAmount,
      dueDate: fields.dueDate || null,
      notes: fields.notes,
      updatedAt: now,
    });
  } else {
    const dueDate = typeof body.dueDate === "string" ? body.dueDate : current.dueDate;
    const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 1000) : current.notes;
    await ref.update({ dueDate: dueDate || null, notes, updatedAt: now });
  }
  return { ok: true };
}

// Cancel, never delete — a cancelled invoice stays visible as history,
// same convention as revoked certificates/awards this session already
// established. Refused once money has actually been collected against it
// (that needs a real correction, not a silent status flip).
export async function cancelManualInvoice(db, id) {
  const ref = db.collection("invoices").doc(id);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw Object.assign(new Error("Invoice not found."), { statusCode: 404 });
  if (Number(snapshot.data().paidAmount) > 0) {
    throw badRequest("This invoice has payments recorded and cannot be cancelled.");
  }
  await ref.update({ status: "Cancelled", updatedAt: FieldValue.serverTimestamp() });
  return { ok: true };
}

// Mirrors recordPayment's transaction shape (payment-core.js) exactly —
// same race-condition guard, same "never edit an existing payment doc"
// rule — just targeting invoices/{id} instead of an enrollment, and
// writing `invoiceId` instead of `enrollmentId` onto the payments row so
// Income/Payments, Transactions, and the receipt route see it the same
// way they already see every other payment.
export async function recordManualInvoicePayment(db, invoiceId, { amount, paymentMethod, paymentDate, reference, notes, createdBy }) {
  const invoiceRef = db.collection("invoices").doc(invoiceId);
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
      const snapshot = await transaction.get(invoiceRef);
      if (!snapshot.exists || snapshot.data().status === "Cancelled") {
        throw Object.assign(new Error("Invoice not found."), { statusCode: 404 });
      }
      const invoice = snapshot.data();
      const totalAmount = Number(invoice.totalAmount) || 0;
      const totalPaidBefore = Number(invoice.paidAmount) || 0;
      const dueBefore = Math.max(0, totalAmount - totalPaidBefore);

      if (dueBefore <= 0) {
        throw Object.assign(new Error("This invoice is already fully paid."), { statusCode: 400 });
      }
      if (numericAmount > dueBefore) {
        throw Object.assign(new Error("Payment amount cannot be greater than the outstanding due."), { statusCode: 400 });
      }

      const totalPaidAfter = totalPaidBefore + numericAmount;
      const dueAfter = Math.max(0, totalAmount - totalPaidAfter);
      const status = computeStatus(totalAmount, totalPaidAfter);
      const now = FieldValue.serverTimestamp();

      transaction.set(paymentRef, {
        invoiceId,
        studentId: invoice.studentId,
        courseId: invoice.courseId || null,
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
      transaction.update(invoiceRef, { paidAmount: totalPaidAfter, dueAmount: dueAfter, status, updatedAt: now });

      return { totalPaid: totalPaidAfter, dueAmount: dueAfter, status, totalAmount, previousPaid: totalPaidBefore, studentId: invoice.studentId };
    });

    await db.collection("notifications").add({
      userId: result.studentId,
      type: "payment",
      title: "Payment received",
      body: `A payment of S$${numericAmount.toLocaleString()} was recorded for your invoice.`,
      entityId: paymentRef.id,
      actionUrl: null,
      readAt: null,
      createdAt: FieldValue.serverTimestamp(),
    });

    return { status: 201, body: { ok: true, paymentId: paymentRef.id, invoiceId, ...result } };
  } catch (error) {
    if (error.statusCode) return { status: error.statusCode, body: { message: error.message } };
    throw error;
  }
}
