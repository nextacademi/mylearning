import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "../../../../lib/firebase-admin";
import { getCachedUserSnapshot } from "../../../../lib/server/cached-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const managers = new Set(["Admin", "Director"]);
const plain = (snapshot) => ({ id: snapshot.id, ...snapshot.data() });
const isoDate = (value) => (value?.toDate ? value.toDate().toISOString() : null);

async function access(request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { denied: NextResponse.json({ message: "Sign in to continue." }, { status: 401 }) };
  const db = getAdminDb();
  const decoded = await getAdminAuth().verifyIdToken(token);
  const profile = await getCachedUserSnapshot(db, decoded.uid);
  const data = profile.data() || {};
  if (!profile.exists || data.active === false) return { denied: NextResponse.json({ message: "Account access is required." }, { status: 403 }) };
  return { db, uid: decoded.uid, role: data.role || "" };
}

// Spec section 17: every AI Assistant action (success or failure) is
// logged — userId/userRole/timestamp are taken from the VERIFIED token and
// Firestore profile, never trusted from the request body, so a client can
// never forge who an action ran as.
export async function POST(request) {
  try {
    const a = await access(request);
    if (a.denied) return a.denied;
    const body = await request.json();
    const entry = {
      userId: a.uid,
      userRole: a.role,
      action: typeof body.action === "string" ? body.action : "UNKNOWN",
      entity: typeof body.entity === "string" ? body.entity : "",
      entityId: typeof body.entityId === "string" ? body.entityId : "",
      requestedData: body.requestedData && typeof body.requestedData === "object" ? body.requestedData : {},
      result: typeof body.result === "string" ? body.result : "unknown",
      confirmationStatus: typeof body.confirmationStatus === "string" ? body.confirmationStatus : "unknown",
      errorMessage: typeof body.errorMessage === "string" ? body.errorMessage.slice(0, 500) : "",
      createdAt: FieldValue.serverTimestamp(),
    };
    const ref = await a.db.collection("aiAuditLog").add(entry);
    return NextResponse.json({ id: ref.id }, { status: 201 });
  } catch (error) {
    console.error("[ai-audit-api] write failed", { code: error?.code || "unknown" });
    return NextResponse.json({ message: "Unable to record the audit log entry." }, { status: 500 });
  }
}

// Admin/Director see every log; anyone else sees only their own.
export async function GET(request) {
  try {
    const a = await access(request);
    if (a.denied) return a.denied;
    const query = managers.has(a.role) ? a.db.collection("aiAuditLog") : a.db.collection("aiAuditLog").where("userId", "==", a.uid);
    const snapshot = await query.get();
    const rows = snapshot.docs
      .map(plain)
      .map((row) => ({ ...row, createdAt: isoDate(row.createdAt) }))
      .sort((left, right) => (right.createdAt || "").localeCompare(left.createdAt || ""))
      .slice(0, 200);
    return NextResponse.json({ logs: rows });
  } catch (error) {
    console.error("[ai-audit-api] list failed", { code: error?.code || "unknown" });
    return NextResponse.json({ message: "Unable to load audit logs." }, { status: 500 });
  }
}
