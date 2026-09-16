import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "../../../../lib/firebase-admin";
import { getCachedUserSnapshot } from "../../../../lib/server/cached-profile";
import { createManualInvoice, listAllInvoices } from "../../../../lib/server/invoice-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const managers = new Set(["Admin", "Director"]);

function failure(stage, error) {
  console.error("[invoices-api] failed", { stage, code: error?.code || "unknown", message: error?.message || "unknown" });
  return NextResponse.json({ message: "Unable to manage invoices. Please try again." }, { status: 500 });
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
  return { db, uid: decoded.uid, createdByName: data.displayName || data.email || decoded.uid };
}

// Finance → Invoices (unified list — enrollment invoices + manual
// invoices) and Student Profile → Finance (via ?studentId=) both read
// through this one endpoint, so they can never disagree.
export async function GET(request) {
  try {
    const a = await access(request);
    if (a.denied) return a.denied;
    const studentId = new URL(request.url).searchParams.get("studentId") || undefined;
    const invoices = await listAllInvoices(a.db, { studentId });
    return NextResponse.json({ invoices });
  } catch (error) {
    return failure("list", error);
  }
}

// Creates a manual (non-enrollment) invoice only — course-fee invoices are
// created by enrolling a student (lib/server/enrollment-core.js), never
// through this route, so there is never a second invoice for the same
// enrollment.
export async function POST(request) {
  try {
    const a = await access(request);
    if (a.denied) return a.denied;
    const body = await request.json();
    const result = await createManualInvoice(a.db, body, a.uid, a.createdByName);
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (error) {
    return error?.statusCode ? NextResponse.json({ message: error.message }, { status: error.statusCode }) : failure("create", error);
  }
}
