import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "../../../../../../lib/firebase-admin";
import { getCachedUserSnapshot } from "../../../../../../lib/server/cached-profile";
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

// Manual-invoice PDF — the same shared layout as the enrollment invoice
// (lib/server/invoice-pdf.js), reading from invoices/{id} instead. Kept as
// its own route because the auth/ownership check and data source differ.
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

    const bytes = await buildInvoicePdf(
      {
        invoiceNumber: invoice.invoiceNumber,
        issueDate: invoice.issueDate,
        dueDate: invoice.dueDate,
        status: invoice.status || "Unpaid",
        student: { name: student.displayName || invoice.studentName || "Student", email: student.email, phone: student.phone },
        meta: [
          { label: "Invoice Type", value: invoice.invoiceType || "Other" },
          { label: "Batch", value: invoice.batchName || "—" },
          { label: "Training", value: invoice.courseName || "—" },
        ],
        items: [
          {
            description: invoice.description || invoice.invoiceType || "Invoice item",
            sub: invoice.description && invoice.invoiceType ? invoice.invoiceType : "",
            amount: invoice.subtotal,
          },
        ],
        subtotal: invoice.subtotal,
        discount: invoice.discount,
        total: invoice.totalAmount,
        paid: invoice.paidAmount,
        due: invoice.dueAmount,
        payments: payments.map((payment) => ({
          date: payment.paymentDate,
          method: payment.paymentMethod,
          reference: payment.reference,
          amount: payment.amount,
        })),
        notes: invoice.notes,
      },
      { origin: new URL(request.url).origin },
    );
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
