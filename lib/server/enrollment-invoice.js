import { listPaymentsForEnrollment, computeStatus } from "./payment-core";
import { ensureInvoiceNumber } from "./invoice-id";
import { buildInvoicePdf } from "./invoice-pdf";

const fmtDate = (iso) => {
  if (!iso) return "—";
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? String(iso) : parsed.toLocaleDateString("en-SG", { day: "2-digit", month: "short", year: "numeric" });
};
const isoDate = (value) => (value?.toDate ? value.toDate().toISOString() : typeof value === "string" ? value : null);

export async function loadEnrollment(db, enrollmentId) {
  const ref = db.collection("enrollments").doc(enrollmentId);
  const snapshot = await ref.get();
  return snapshot.exists ? { ref, data: snapshot.data() } : null;
}

// The course-fee invoice PDF for one enrollment, generated from the
// enrollment's own live fee/payment fields plus its payments — the
// enrollment doc IS the invoice (see createEnrollment in
// enrollment-core.js). Shared by the download route
// (/api/admin/enrollments/[id]/invoice) and the Training Registration
// approval email, so both always produce the identical document.
export async function buildEnrollmentInvoicePdf(db, { ref, data: enrollment }, { origin } = {}) {
  const [courseSnap, studentSnap, payments] = await Promise.all([
    db.collection("courses").doc(enrollment.courseId).get(),
    db.collection("users").doc(enrollment.studentId).get(),
    listPaymentsForEnrollment(db, ref.id),
  ]);
  const course = courseSnap.exists ? courseSnap.data() : {};
  const student = studentSnap.exists ? studentSnap.data() : {};
  const invoiceNumber = await ensureInvoiceNumber(db, ref, enrollment);

  const finalFee = Number(enrollment.finalFee) || 0;
  const totalPaid = Number(enrollment.totalPaid) || 0;
  const dueAmount = Number.isFinite(enrollment.dueAmount) ? enrollment.dueAmount : Math.max(0, finalFee - totalPaid);
  const paymentStatus = enrollment.status === "withdrawn" ? "Cancelled" : enrollment.paymentStatus || computeStatus(finalFee, totalPaid);

  const bytes = await buildInvoicePdf(
    {
      invoiceNumber,
      issueDate: isoDate(enrollment.enrolledAt),
      status: paymentStatus,
      student: { name: student.displayName || "Student", email: student.email, phone: student.phone },
      meta: [
        { label: "Training", value: course.title || "Untitled training" },
        { label: "Batch", value: course.batchName || "—" },
        { label: "Enrollment Date", value: fmtDate(isoDate(enrollment.enrolledAt)) },
      ],
      items: [
        {
          description: "Course Fee",
          sub: [course.title, course.batchName].filter(Boolean).join(" • "),
          amount: enrollment.trainingFee,
        },
      ],
      subtotal: enrollment.trainingFee,
      discount: enrollment.discount,
      total: finalFee,
      paid: totalPaid,
      due: dueAmount,
      payments: payments.map((payment) => ({
        date: payment.paymentDate,
        method: payment.paymentMethod,
        reference: payment.reference,
        amount: payment.amount,
      })),
    },
    { origin },
  );
  const safeName = (student.displayName || "student").replace(/[^a-zA-Z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return { bytes, invoiceNumber, filename: `${invoiceNumber}-${safeName}.pdf`, course, student, finalFee, totalPaid, dueAmount, paymentStatus };
}
