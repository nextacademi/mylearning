import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "../../../../lib/firebase-admin";
import { getCachedUserSnapshot } from "../../../../lib/server/cached-profile";
import { deleteForm, listForms, saveForm, setFormStatus } from "../../../../lib/server/forms-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const managers = new Set(["Admin", "Director"]);

function respondError(stage, error) {
  if (error?.statusCode) return NextResponse.json({ message: error.message }, { status: error.statusCode });
  console.error("[forms-api] failed", { stage, code: error?.code || "unknown", message: error?.message || "unknown" });
  return NextResponse.json({ message: "Unable to manage forms. Please try again." }, { status: 500 });
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
  return { db, uid: decoded.uid, name: data.displayName || data.email || decoded.uid };
}

export async function GET(request) {
  try {
    const a = await access(request);
    if (a.denied) return a.denied;
    return NextResponse.json({ forms: await listForms(a.db) });
  } catch (error) {
    return respondError("list", error);
  }
}

// POST saves a form (create, or update when `id` is present); PATCH toggles
// open/closed; DELETE removes the form and all of its responses.
export async function POST(request) {
  try {
    const a = await access(request);
    if (a.denied) return a.denied;
    return NextResponse.json({ ok: true, ...(await saveForm(a.db, await request.json(), a.uid, a.name)) }, { status: 201 });
  } catch (error) {
    return respondError("save", error);
  }
}

export async function PATCH(request) {
  try {
    const a = await access(request);
    if (a.denied) return a.denied;
    const { id, status } = await request.json();
    return NextResponse.json(await setFormStatus(a.db, id, status));
  } catch (error) {
    return respondError("status", error);
  }
}

export async function DELETE(request) {
  try {
    const a = await access(request);
    if (a.denied) return a.denied;
    const { id } = await request.json();
    return NextResponse.json(await deleteForm(a.db, id));
  } catch (error) {
    return respondError("delete", error);
  }
}
