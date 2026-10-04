import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "../../../../lib/firebase-admin";
import { getCachedUserSnapshot } from "../../../../lib/server/cached-profile";
import { getFormForStudent, submitResponse } from "../../../../lib/server/forms-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A form link is public: anyone who has it (the form id is the secret) can open
// and fill it. When the request carries a valid sign-in, name/email come from
// that account, never from the body; otherwise the visitor supplies them.
async function identify(request) {
  const db = getAdminDb();
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { db };
  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    const snap = await getCachedUserSnapshot(db, decoded.uid);
    const profile = snap.data() || {};
    if (!snap.exists || profile.active === false) return { db };
    return { db, uid: decoded.uid, name: profile.displayName || profile.email || decoded.email || "", email: profile.email || decoded.email || "", role: profile.role || "" };
  } catch {
    return { db };
  }
}

function respondError(error) {
  if (error?.statusCode) return NextResponse.json({ message: error.message }, { status: error.statusCode });
  console.error("[forms-api] failed", error?.code || error?.message);
  return NextResponse.json({ message: "Something went wrong. Please try again." }, { status: 500 });
}

export async function GET(request, context) {
  try {
    const a = await identify(request);
    const { id } = await context.params;
    return NextResponse.json({ form: await getFormForStudent(a.db, id, a.uid) });
  } catch (error) {
    return respondError(error);
  }
}

export async function POST(request, context) {
  try {
    const a = await identify(request);
    const { id } = await context.params;
    const body = await request.json();
    const identity = a.uid ? a : { name: body.name, email: body.email };
    return NextResponse.json(await submitResponse(a.db, id, identity, body.answers), { status: 201 });
  } catch (error) {
    return respondError(error);
  }
}
