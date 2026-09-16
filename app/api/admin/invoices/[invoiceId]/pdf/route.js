import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { getAdminAuth, getAdminDb } from "../../../../../../lib/firebase-admin";
import { getCachedUserSnapshot } from "../../../../../../lib/server/cached-profile";

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

// Manual-invoice PDF — same pdf-lib layout as the enrollment invoice route
// (app/api/admin/enrollments/[enrollmentId]/invoice/route.js), reading
// from invoices/{id} instead. Kept as its own route rather than a branch
// inside that one so the existing, already-working enrollment invoice
// route stays completely untouched.
export async function GET(request, context) {
  try {
    const a = await access(request);
    if (a.denied) return a.denied;
    const { invoiceId } = await context.params;
    const invoiceSnap = await a.db.collection("invoices").doc(invoiceId).get();
    if (!invoiceSnap.exists) return NextResponse.json({ message: "Invoice not found." }, { status: 404 });
    const invoice = invoiceSnap.data();

    const isOwner = invoice.studentId === a.uid;
    if (!isOwner && !managers.has(a.role)) {
      return NextResponse.json({ message: "You do not have access to this invoice." }, { status: 403 });
    }

    const [studentSnap, paymentsSnap] = await Promise.all([
      a.db.collection("users").doc(invoice.studentId).get(),
      a.db.collection("payments").where("invoiceId", "==", invoiceId).get(),
    ]);
    const student = studentSnap.exists ? studentSnap.data() : {};
    const payments = paymentsSnap.docs
      .map((doc) => doc.data())
      .sort((left, right) => (right.paymentDate || "").localeCompare(left.paymentDate || ""));

    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595, 842]);
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
    text(`Invoice Number: ${invoice.invoiceNumber}`, left, 10, regular, gray);
    rightText(`Invoice Date: ${fmtDate(invoice.issueDate)}`, 10, regular, gray);
    y -= 16;
    if (invoice.dueDate) {
      text(`Due Date: ${fmtDate(invoice.dueDate)}`, left, 10, regular, gray);
      y -= 16;
    }
    y -= 12;

    text("Billed To", left, 9, bold, gray);
    y -= 14;
    text(student.displayName || invoice.studentName || "Student", left, 12, bold, ink);
    y -= 16;
    text(student.email || "—", left, 10, regular, gray);
    if (student.phone) {
      y -= 14;
      text(student.phone, left, 10, regular, gray);
    }
    y -= 24;
    line();
    y -= 20;

    text("Invoice Type", left, 9, bold, gray);
    rightText("Batch", 9, bold, gray);
    y -= 15;
    text(invoice.invoiceType || "Other", left, 11, regular, ink);
    rightText(invoice.batchName || "—", 11, regular, ink);
    if (invoice.courseName) {
      y -= 16;
      text(`Training: ${invoice.courseName}`, left, 10, regular, gray);
    }
    y -= 24;
    line();
    y -= 24;

    text("Description", left, 10, bold, gray);
    rightText("Amount", 10, bold, gray);
    y -= 18;
    text(invoice.description || invoice.invoiceType || "Invoice item", left, 11, regular, ink);
    rightText(money(invoice.subtotal), 11, regular, ink);
    if (Number(invoice.discount) > 0) {
      y -= 18;
      text("Discount", left, 11, regular, ink);
      rightText(`-${money(invoice.discount)}`, 11, regular, ink);
    }
    y -= 14;
    line();
    y -= 20;
    text("Total", left, 13, bold, ink);
    rightText(money(invoice.totalAmount), 13, bold, ink);
    y -= 20;
    text("Paid", left, 11, regular, rgb(0.06, 0.5, 0.3));
    rightText(money(invoice.paidAmount), 11, regular, rgb(0.06, 0.5, 0.3));
    y -= 18;
    text("Due", left, 13, bold, red);
    rightText(money(invoice.dueAmount), 13, bold, red);
    y -= 18;
    text("Status", left, 10, bold, gray);
    rightText(invoice.status || "Unpaid", 11, bold, invoice.status === "Paid" ? rgb(0.06, 0.5, 0.3) : invoice.status === "Cancelled" ? gray : red);
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
      const shown = payments.slice(0, 12);
      for (const payment of shown) {
        text(fmtDate(payment.paymentDate), left, 10, regular, ink);
        text(payment.paymentMethod || "—", left + 90, 10, regular, ink);
        text(payment.reference || "—", left + 220, 10, regular, ink);
        rightText(money(payment.amount), 10, regular, ink);
        y -= 16;
      }
    }

    if (invoice.notes) {
      y -= 10;
      text(`Notes: ${invoice.notes}`, left, 9, regular, gray);
    }

    page.drawText("Next Academy — Thank you.", { x: (width - regular.widthOfTextAtSize("Next Academy — Thank you.", 9)) / 2, y: 40, size: 9, font: regular, color: gray });

    const bytes = await pdf.save();
    const safeName = (student.displayName || invoice.studentName || "student").replace(/[^a-zA-Z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${invoice.invoiceNumber}-${safeName}.pdf"`,
      },
    });
  } catch (error) {
    console.error("[manual-invoice-pdf-api] failed", { code: error?.code || "unknown", message: error?.message });
    return NextResponse.json({ message: "Unable to generate the invoice PDF right now." }, { status: 500 });
  }
}
