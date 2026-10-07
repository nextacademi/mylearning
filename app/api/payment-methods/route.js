import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "../../../lib/firebase-admin";
import { getCachedUserSnapshot } from "../../../lib/server/cached-profile";
import { getPaymentMethods, savePaymentMethods } from "../../../lib/server/payment-methods";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const managers = new Set(["Admin", "Director"]);

// The editable payment-method list (see lib/server/payment-methods.js).
// Any signed-in, active account may read it (it only feeds dropdowns);
// only Admin/Director may change it.
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

export async function GET(request) {
  try {
    const a = await access(request);
    if (a.denied) return a.denied;
    return NextResponse.json({ methods: await getPaymentMethods(a.db) });
  } catch (error) {
    console.error("[payment-methods-api] load failed", { message: error?.message });
    return NextResponse.json({ message: "Unable to load payment methods." }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const a = await access(request);
    if (a.denied) return a.denied;
    if (!managers.has(a.role)) return NextResponse.json({ message: "Only Admin or Director can edit payment methods." }, { status: 403 });
    const body = await request.json().catch(() => ({}));
    const methods = await savePaymentMethods(a.db, body.methods, a.uid);
    return NextResponse.json({ ok: true, methods });
  } catch (error) {
    if (error.statusCode) return NextResponse.json({ message: error.message }, { status: error.statusCode });
    console.error("[payment-methods-api] save failed", { message: error?.message });
    return NextResponse.json({ message: "Unable to save payment methods." }, { status: 500 });
  }
}
