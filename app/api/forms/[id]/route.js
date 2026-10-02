import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "../../../../lib/firebase-admin";
import { getCachedUserSnapshot } from "../../../../lib/server/cached-profile";
import { getFormForStudent, submitResponse } from "../../../../lib/server/forms-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Any signed-in, active account can open and fill a form it has the link to
// (the form id is the secret). Name/email on the response come from the
// account, never from the request body, so who filled it in can't be faked.
async function signedIn(request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { denied: NextResponse.json({ message: "Sign in to open this form." }, { status: 401 }) };
  const db = getAdminDb();
  const decoded = await getAdminAuth().verifyIdToken(token);
  const snap = await getCachedUserSnapshot(db, decoded.uid);
  const profile = snap.data() || {};
  if (!snap.exists || profile.active === false) return { denied: NextResponse.json({ message: "Account access is required." }, { status: 403 }) };
  return { db, uid: decoded.uid, profile: { ...profile, email: profile.email || decoded.email || "" } };
}

function respondError(error) {
  if (error?.statusCode) return NextResponse.json({ message: error.message }, { status: error.statusCode });
  console.error("[forms-api] failed", error?.code || error?.message);
  return NextResponse.json({ message: "Something went wrong. Please try again." }, { status: 500 });
}

export async function GET(request, context) {
  try {
    const a = await signedIn(request);
    if (a.denied) return a.denied;
    const { id } = await context.params;
    return NextResponse.json({ form: await getFormForStudent(a.db, id, a.uid) });
  } catch (error) {
    return respondError(error);
  }
}

export async function POST(request, context) {
  try {
    const a = await signedIn(request);
    if (a.denied) return a.denied;
    const { id } = await context.params;
    const { answers } = await request.json();
    return NextResponse.json(await submitResponse(a.db, id, a.uid, a.profile, answers), { status: 201 });
  } catch (error) {
    return respondError(error);
  }
}
