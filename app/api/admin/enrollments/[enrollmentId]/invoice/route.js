import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "../../../../../../lib/firebase-admin";
import { getCachedUserSnapshot } from "../../../../../../lib/server/cached-profile";
import { buildEnrollmentInvoicePdf, loadEnrollment } from "../../../../../../lib/server/enrollment-invoice";

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

// Invoice PDF, generated on demand from the enrollment's own live fields
// (trainingFee/discount/finalFee/totalPaid/dueAmount/paymentStatus) plus
// its payments — the enrollment doc IS the invoice (see the comment on
// createEnrollment in lib/server/enrollment-core.js), there's no separate
// Invoice record to read. The document itself is built in
// lib/server/enrollment-invoice.js (also used by the Training Registration
// approval email).
export async function GET(request, context) {
  try {
    const a = await access(request);
    if (a.denied) return a.denied;
    const { enrollmentId } = await context.params;
    const enrollment = await loadEnrollment(a.db, enrollmentId);
    if (!enrollment) return NextResponse.json({ message: "Enrollment not found." }, { status: 404 });

    const isOwner = enrollment.data.studentId === a.uid;
    if (!isOwner && !managers.has(a.role)) {
      return NextResponse.json({ message: "You do not have access to this invoice." }, { status: 403 });
    }

    const { bytes, filename } = await buildEnrollmentInvoicePdf(a.db, enrollment, { origin: new URL(request.url).origin });
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("[invoice-pdf-api] failed", { code: error?.code || "unknown", message: error?.message });
    return NextResponse.json({ message: "Unable to generate the invoice PDF right now." }, { status: 500 });
  }
}
