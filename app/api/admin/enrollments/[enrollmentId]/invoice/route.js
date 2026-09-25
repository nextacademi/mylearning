import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "../../../../../../lib/firebase-admin";
import { getCachedUserSnapshot } from "../../../../../../lib/server/cached-profile";
import { listPaymentsForEnrollment, computeStatus } from "../../../../../../lib/server/payment-core";
import { ensureInvoiceNumber } from "../../../../../../lib/server/invoice-id";
import { buildInvoicePdf } from "../../../../../../lib/server/invoice-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const managers = new Set(["Admin", "Director"]);

async function access(request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { denied: NextResponse.json({ message: "Sign in to continue." }, { status: 401 }) };
  const db = getAdminDb();
  const decoded = await getAdminAuth().verifyIdToken(token);
  const profile = await getCachedUserSnapshot(db, decoded.uid);
  const data = profile.data() || {};
  if (!profile.exists || data.active === false) return { denied: NextResponse.json({ message: "Sign in to continue." }, { status: 403 }) };
  return { db, uid: decoded.uid, role: data.role };
}

const fmtDate = (iso) => {
  if (!iso) return "—";
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? String(iso) : parsed.toLocaleDateString("en-SG", { day: "2-digit", month: "short", year: "numeric" });
};
const isoDate = (value) => (value?.toDate ? value.toDate().toISOString() : typeof value === "string" ? value : null);

// Invoice PDF, generated on demand from the enrollment's own live fields
// (trainingFee/discount/finalFee/totalPaid/dueAmount/paymentStatus) plus
// its payments — the enrollment doc IS the invoice (see the comment on
// createEnrollment in lib/server/enrollment-core.js), there's no separate
// Invoice record to read. Same pdf-lib pattern as the existing certificate
// PDF route (app/api/certificates/[certificateId]/pdf/route.js) — reused,
// not a new library.
export async function GET(request, context) {
  try {
    const a = await access(request);
    if (a.denied) return a.denied;
    const { enrollmentId } = await context.params;
    const enrollmentRef = a.db.collection("enrollments").doc(enrollmentId);
    const enrollmentSnap = await enrollmentRef.get();
    if (!enrollmentSnap.exists) return NextResponse.json({ message: "Enrollment not found." }, { status: 404 });
    const enrollment = enrollmentSnap.data();

    const isOwner = enrollment.studentId === a.uid;
    if (!isOwner && !managers.has(a.role)) {
      return NextResponse.json({ message: "You do not have access to this invoice." }, { status: 403 });
    }

    const [courseSnap, studentSnap, payments] = await Promise.all([
      a.db.collection("courses").doc(enrollment.courseId).get(),
      a.db.collection("users").doc(enrollment.studentId).get(),
      listPaymentsForEnrollment(a.db, enrollmentId),
    ]);
    const course = courseSnap.exists ? courseSnap.data() : {};
    const student = studentSnap.exists ? studentSnap.data() : {};
    const invoiceNumber = await ensureInvoiceNumber(a.db, enrollmentRef, enrollment);

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
      { origin: new URL(request.url).origin },
    );
    const safeName = (student.displayName || "student").replace(/[^a-zA-Z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${invoiceNumber}-${safeName}.pdf"`,
      },
    });
  } catch (error) {
    console.error("[invoice-pdf-api] failed", { code: error?.code || "unknown", message: error?.message });
    return NextResponse.json({ message: "Unable to generate the invoice PDF right now." }, { status: 500 });
  }
}
