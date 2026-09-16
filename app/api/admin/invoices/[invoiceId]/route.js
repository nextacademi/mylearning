import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "../../../../../lib/firebase-admin";
import { getCachedUserSnapshot } from "../../../../../lib/server/cached-profile";
import { cancelManualInvoice, updateManualInvoice } from "../../../../../lib/server/invoice-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const managers = new Set(["Admin", "Director"]);

function failure(stage, error) {
  console.error("[invoice-detail-api] failed", { stage, code: error?.code || "unknown", message: error?.message || "unknown" });
  return NextResponse.json({ message: "Unable to update this invoice. Please try again." }, { status: 500 });
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

// Edit or cancel a manual invoice — see invoice-core.js's
// updateManualInvoice/cancelManualInvoice for exactly what's allowed once
// a payment exists. Enrollment (course-fee) invoices are never touched
// through this route; they have no `invoices` doc to address.
export async function PATCH(request, context) {
  try {
    const a = await access(request);
    if (a.denied) return a.denied;
    const { invoiceId } = await context.params;
    const body = await request.json();
    if (body.action === "cancel") {
      const result = await cancelManualInvoice(a.db, invoiceId);
      return NextResponse.json(result);
    }
    const result = await updateManualInvoice(a.db, invoiceId, body);
    return NextResponse.json(result);
  } catch (error) {
    return error?.statusCode ? NextResponse.json({ message: error.message }, { status: error.statusCode }) : failure("update", error);
  }
}
