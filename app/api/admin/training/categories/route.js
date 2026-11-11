import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "../../../../../lib/firebase-admin";
import { getCachedUserSnapshot } from "../../../../../lib/server/cached-profile";
import { addTrainingCategory, deleteTrainingCategory } from "../../../../../lib/server/training-categories";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const managers = new Set(["Admin", "Director"]);

// POST { name } adds a training category; DELETE { id } removes one.
// The list itself is returned by GET /api/admin/training (`categories`).
async function requireManager(request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { denied: NextResponse.json({ message: "Sign in to continue." }, { status: 401 }) };
  const db = getAdminDb();
  const decoded = await getAdminAuth().verifyIdToken(token);
  const profile = await getCachedUserSnapshot(db, decoded.uid);
  const data = profile.data() || {};
  if (!profile.exists || data.active === false || !managers.has(data.role)) {
    return { denied: NextResponse.json({ message: "Administrator or Director access is required." }, { status: 403 }) };
  }
  return { db, uid: decoded.uid };
}

function failure(stage, error) {
  if (error?.statusCode) return NextResponse.json({ message: error.message }, { status: error.statusCode });
  console.error("[training-categories-api] failed", { stage, code: error?.code || "unknown", message: error?.message || "unknown" });
  return NextResponse.json({ message: "Unable to update training categories. Please try again." }, { status: 500 });
}

export async function POST(request) {
  try {
    const access = await requireManager(request);
    if (access.denied) return access.denied;
    const { name } = await request.json().catch(() => ({}));
    const category = await addTrainingCategory(access.db, name, access.uid, FieldValue.serverTimestamp());
    return NextResponse.json({ category }, { status: 201 });
  } catch (error) {
    return failure("create", error);
  }
}

export async function DELETE(request) {
  try {
    const access = await requireManager(request);
    if (access.denied) return access.denied;
    const { id } = await request.json().catch(() => ({}));
    await deleteTrainingCategory(access.db, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failure("delete", error);
  }
}
