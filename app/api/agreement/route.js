import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "../../../lib/firebase-admin";
import { acceptAgreement, acceptanceStats, appliesTo, getAgreement, hasAccepted, saveAgreement } from "../../../lib/server/agreement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const managers = new Set(["Admin", "Director"]);

// Member agreement (lib/server/agreement.js).
//   GET            → the agreement + whether the caller must accept it
//                    (+ acceptance stats for Admin/Director with ?stats=1)
//   POST {version} → the caller accepts that version
//   PUT  {...}     → Admin/Director save the agreement text
// Reads the profile fresh (not the 45s cache) so an acceptance shows at once.
async function access(request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { denied: NextResponse.json({ message: "Sign in to continue." }, { status: 401 }) };
  const db = getAdminDb();
  const decoded = await getAdminAuth().verifyIdToken(token);
  const snap = await db.collection("users").doc(decoded.uid).get();
  return { db, uid: decoded.uid, user: snap.exists ? snap.data() : null };
}

const fail = (error) => {
  if (error.statusCode) return NextResponse.json({ message: error.message }, { status: error.statusCode });
  console.error("[agreement-api] failed", { message: error?.message });
  return NextResponse.json({ message: "Unable to complete this request. Please try again." }, { status: 500 });
};

export async function GET(request) {
  try {
    const a = await access(request);
    if (a.denied) return a.denied;
    const agreement = await getAgreement(a.db);
    const role = a.user?.role || "Guest";
    const body = { agreement, mustAccept: Boolean(a.user) && appliesTo(agreement, role) && !hasAccepted(agreement, a.user) };
    if (managers.has(role) && new URL(request.url).searchParams.get("stats") === "1") body.stats = await acceptanceStats(a.db, agreement);
    return NextResponse.json(body);
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request) {
  try {
    const a = await access(request);
    if (a.denied) return a.denied;
    if (!a.user) return NextResponse.json({ message: "Profile not found." }, { status: 404 });
    const body = await request.json().catch(() => ({}));
    return NextResponse.json({ ok: true, ...(await acceptAgreement(a.db, a.uid, String(body.version || ""))) });
  } catch (error) {
    return fail(error);
  }
}

export async function PUT(request) {
  try {
    const a = await access(request);
    if (a.denied) return a.denied;
    if (!managers.has(a.user?.role)) return NextResponse.json({ message: "Only Admin or Director can edit the agreement." }, { status: 403 });
    const body = await request.json().catch(() => ({}));
    return NextResponse.json({ ok: true, agreement: await saveAgreement(a.db, body, a.uid) });
  } catch (error) {
    return fail(error);
  }
}
