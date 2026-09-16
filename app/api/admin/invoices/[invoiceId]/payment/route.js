import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "../../../../../../lib/firebase-admin";
import { getCachedUserSnapshot } from "../../../../../../lib/server/cached-profile";
import { recordManualInvoicePayment } from "../../../../../../lib/server/invoice-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const managers = new Set(["Admin", "Director"]);

function failure(stage, error) {
  console.error("[invoice-payment-api] failed", { stage, code: error?.code || "unknown", message: error?.message || "unknown" });
  return NextResponse.json({ message: "Unable to record this payment. Please try again." }, { status: 500 });
}

async function access(request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { denied: NextResponse.json({ message: "Administrator access is required." }, { status: 401 }) };
  const db = getAdminDb();
  const decoded = await getAdminAuth().verifyIdToken(token);
  const profile = await getCachedUserSnapshot(db, decoded.uid);
  const data = profile.data() || {};
  if (!profile.exists || data.active === false || !managers.has(data.role)) {
    return { denied: NextResponse.json({ message: "Administrator access is required." }, { status: 403 }) };
  }
  return { db, uid: decoded.uid };
}

// Record a payment against a manual invoice — the "View Invoice → Record
// Payment" step of the Finance → Invoices workflow, for the manual-invoice
// half of it. Course-fee invoices keep using the existing
// /api/admin/payments route (payment-core.js's recordPayment) unchanged.
export async function POST(request, context) {
  try {
    const a = await access(request);
    if (a.denied) return a.denied;
    const { invoiceId } = await context.params;
    const body = await request.json();
    const result = await recordManualInvoicePayment(a.db, invoiceId, { ...body, createdBy: a.uid });
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    return failure("record payment", error);
  }
}
