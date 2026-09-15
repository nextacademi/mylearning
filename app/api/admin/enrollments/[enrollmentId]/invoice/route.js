import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { getAdminAuth, getAdminDb } from "../../../../../../lib/firebase-admin";
import { getCachedUserSnapshot } from "../../../../../../lib/server/cached-profile";
import { listPaymentsForEnrollment, computeStatus } from "../../../../../../lib/server/payment-core";
import { ensureInvoiceNumber } from "../../../../../../lib/server/invoice-id";

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

const money = (value) => `S$${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595, 842]); // A4 portrait, points
    const { width, height } = page.getSize();
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const regular = await pdf.embedFont(StandardFonts.Helvetica);
    const red = rgb(0.72, 0.11, 0.11);
    const gray = rgb(0.4, 0.4, 0.4);
    const ink = rgb(0.07, 0.09, 0.15);

    let y = height - 56;
    const left = 48;
    const right = width - 48;
    const text = (str, x, size, font = regular, color = ink) => page.drawText(String(str), { x, y, size, font, color });
    const rightText = (str, size, font = regular, color = ink) => {
      const w = font.widthOfTextAtSize(String(str), size);
      page.drawText(String(str), { x: right - w, y, size, font, color });
    };
    const line = () => page.drawLine({ start: { x: left, y: y - 6 }, end: { x: right, y: y - 6 }, thickness: 0.75, color: rgb(0.85, 0.85, 0.85) });

    text("NEXT ACADEMY", left, 20, bold, red);
    rightText("INVOICE", 20, bold, ink);
    y -= 30;
    text(`Invoice Number: ${invoiceNumber}`, left, 10, regular, gray);
    rightText(`Invoice Date: ${fmtDate(isoDate(enrollment.enrolledAt))}`, 10, regular, gray);
    y -= 28;

    text("Billed To", left, 9, bold, gray);
    y -= 14;
    text(student.displayName || "Student", left, 12, bold, ink);
    y -= 16;
    text(student.email || "—", left, 10, regular, gray);
    if (student.phone) {
      y -= 14;
      text(student.phone, left, 10, regular, gray);
    }
    y -= 24;
    line();
    y -= 20;

    text("Training", left, 9, bold, gray);
    rightText("Batch", 9, bold, gray);
    y -= 15;
    text(course.title || "Untitled training", left, 11, regular, ink);
    rightText(course.batchName || "—", 11, regular, ink);
    y -= 20;
    text(`Enrollment Date: ${fmtDate(isoDate(enrollment.enrolledAt))}`, left, 10, regular, gray);
    y -= 24;
    line();
    y -= 24;

    text("Description", left, 10, bold, gray);
    rightText("Amount", 10, bold, gray);
    y -= 18;
    text("Course Fee", left, 11, regular, ink);
    rightText(money(enrollment.trainingFee), 11, regular, ink);
    if (Number(enrollment.discount) > 0) {
      y -= 18;
      text("Discount", left, 11, regular, ink);
      rightText(`-${money(enrollment.discount)}`, 11, regular, ink);
    }
    y -= 14;
    line();
    y -= 20;
    text("Total", left, 13, bold, ink);
    rightText(money(finalFee), 13, bold, ink);
    y -= 20;
    text("Paid", left, 11, regular, rgb(0.06, 0.5, 0.3));
    rightText(money(totalPaid), 11, regular, rgb(0.06, 0.5, 0.3));
    y -= 18;
    text("Due", left, 13, bold, red);
    rightText(money(dueAmount), 13, bold, red);
    y -= 18;
    text("Status", left, 10, bold, gray);
    rightText(paymentStatus, 11, bold, paymentStatus === "Paid" ? rgb(0.06, 0.5, 0.3) : paymentStatus === "Cancelled" ? gray : red);
    y -= 30;
    line();
    y -= 24;

    text("Payment History", left, 10, bold, gray);
    y -= 16;
    if (!payments.length) {
      text("No payments recorded yet.", left, 10, regular, gray);
      y -= 16;
    } else {
      text("Date", left, 9, bold, gray);
      text("Method", left + 90, 9, bold, gray);
      text("Reference", left + 220, 9, bold, gray);
      rightText("Amount", 9, bold, gray);
      y -= 14;
      // Fits comfortably on one A4 page for the common case; beyond that,
      // the point of an invoice PDF is the current balance, not a full
      // ledger — the in-app Payment History table is the complete record.
      const shown = payments.slice(0, 12);
      for (const payment of shown) {
        text(fmtDate(payment.paymentDate), left, 10, regular, ink);
        text(payment.paymentMethod || "—", left + 90, 10, regular, ink);
        text(payment.reference || "—", left + 220, 10, regular, ink);
        rightText(money(payment.amount), 10, regular, ink);
        y -= 16;
      }
      if (payments.length > shown.length) {
        text(`+ ${payments.length - shown.length} more payment(s) — see Payment History for the full list.`, left, 9, regular, gray);
        y -= 16;
      }
    }

    page.drawText("Next Academy — Thank you.", { x: (width - regular.widthOfTextAtSize("Next Academy — Thank you.", 9)) / 2, y: 40, size: 9, font: regular, color: gray });

    const bytes = await pdf.save();
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
