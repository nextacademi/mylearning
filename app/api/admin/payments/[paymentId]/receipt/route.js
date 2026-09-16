import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { getAdminAuth, getAdminDb } from "../../../../../../lib/firebase-admin";
import { getCachedUserSnapshot } from "../../../../../../lib/server/cached-profile";
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

// One payment's receipt as a real downloadable PDF — same content the
// in-app Receipt modal already shows (components/training/
// PaymentHistoryTable.jsx), generated from that exact payment doc, never a
// separate/fabricated record. Reuses the certificate PDF route's pdf-lib
// pattern (app/api/certificates/[certificateId]/pdf/route.js).
export async function GET(request, context) {
  try {
    const a = await access(request);
    if (a.denied) return a.denied;
    const { paymentId } = await context.params;
    const paymentSnap = await a.db.collection("payments").doc(paymentId).get();
    if (!paymentSnap.exists) return NextResponse.json({ message: "Payment not found." }, { status: 404 });
    const payment = paymentSnap.data();

    const isOwner = payment.studentId === a.uid;
    if (!isOwner && !managers.has(a.role)) {
      return NextResponse.json({ message: "You do not have access to this receipt." }, { status: 403 });
    }

    // A payment carries either an enrollmentId (course fee) or an
    // invoiceId (manual invoice — Registration/Material/Exam Fee etc.),
    // never both. Only the enrollment branch existed before manual
    // invoices; this is purely additive — enrollment-payment receipts are
    // unaffected.
    const [studentSnap, courseSnap, enrollmentSnap, invoiceSnap] = await Promise.all([
      a.db.collection("users").doc(payment.studentId).get(),
      payment.courseId ? a.db.collection("courses").doc(payment.courseId).get() : Promise.resolve(null),
      payment.enrollmentId ? a.db.collection("enrollments").doc(payment.enrollmentId).get() : Promise.resolve(null),
      payment.invoiceId ? a.db.collection("invoices").doc(payment.invoiceId).get() : Promise.resolve(null),
    ]);
    const student = studentSnap.exists ? studentSnap.data() : {};
    const enrollment = enrollmentSnap?.exists ? enrollmentSnap.data() : null;
    const manualInvoice = invoiceSnap?.exists ? invoiceSnap.data() : null;

    let course, finalFee, invoiceNumber;
    if (enrollment) {
      course = courseSnap?.exists ? courseSnap.data() : {};
      finalFee = Number(enrollment.finalFee) || 0;
      invoiceNumber = await ensureInvoiceNumber(a.db, enrollmentSnap.ref, enrollment);
    } else if (manualInvoice) {
      course = { title: manualInvoice.description || manualInvoice.invoiceType, batchName: manualInvoice.batchName || "" };
      finalFee = Number(manualInvoice.totalAmount) || 0;
      invoiceNumber = manualInvoice.invoiceNumber || "—";
    } else {
      course = {};
      finalFee = 0;
      invoiceNumber = "—";
    }

    const previousPaid = Number(payment.previousPaid) || 0;
    const amount = Number(payment.amount) || 0;
    const totalPaidAfter = previousPaid + amount;
    const dueAfter = Math.max(0, finalFee - totalPaidAfter);

    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595, 420]); // A5-ish, receipt-friendly
    const { width, height } = page.getSize();
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const regular = await pdf.embedFont(StandardFonts.Helvetica);
    const red = rgb(0.72, 0.11, 0.11);
    const gray = rgb(0.4, 0.4, 0.4);
    const ink = rgb(0.07, 0.09, 0.15);
    const green = rgb(0.06, 0.5, 0.3);

    let y = height - 50;
    const centerText = (str, size, font = regular, color = ink) => {
      const w = font.widthOfTextAtSize(String(str), size);
      page.drawText(String(str), { x: (width - w) / 2, y, size, font, color });
    };
    centerText("NEXT ACADEMY", 18, bold, red);
    y -= 22;
    centerText("PAYMENT RECEIPT", 11, bold, gray);
    y -= 34;

    const left = 60;
    const right = width - 60;
    const row = (label, value, size = 10, valueFont = bold, valueColor = ink) => {
      page.drawText(label, { x: left, y, size, font: regular, color: gray });
      const w = valueFont.widthOfTextAtSize(String(value), size);
      page.drawText(String(value), { x: right - w, y, size, font: valueFont, color: valueColor });
      y -= 18;
    };

    row("Invoice", invoiceNumber);
    row("Payment Date", fmtDate(payment.paymentDate));
    row("Student", student.displayName || "—");
    row("Training", course.title || "—");
    if (course.batchName) row("Batch", course.batchName);
    row("Payment Method", payment.paymentMethod || "—");
    row("Reference / Transaction ID", payment.reference || "—");
    y -= 6;
    page.drawLine({ start: { x: left, y: y + 8 }, end: { x: right, y: y + 8 }, thickness: 0.75, color: rgb(0.85, 0.85, 0.85) });
    y -= 12;

    row("Previous Paid", money(previousPaid), 10, regular, gray);
    row("This Payment", money(amount), 13, bold, green);
    row("Total Paid", money(totalPaidAfter), 10, bold, ink);
    row("Remaining Due", money(dueAfter), 13, bold, dueAfter > 0 ? red : green);

    page.drawText("Next Academy — Thank you.", { x: (width - regular.widthOfTextAtSize("Next Academy — Thank you.", 9)) / 2, y: 24, size: 9, font: regular, color: gray });

    const bytes = await pdf.save();
    const safeName = (student.displayName || "student").replace(/[^a-zA-Z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Receipt-${invoiceNumber}-${safeName}.pdf"`,
      },
    });
  } catch (error) {
    console.error("[receipt-pdf-api] failed", { code: error?.code || "unknown", message: error?.message });
    return NextResponse.json({ message: "Unable to generate the receipt PDF right now." }, { status: 500 });
  }
}
