import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "../../../../lib/firebase-admin";
import { getCachedUserSnapshot } from "../../../../lib/server/cached-profile";
import { MANAGER_ROLES, createFolder, deleteFolder, renameFolder } from "../../../../lib/server/documents-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Document folders — Admin/Director only. Reads happen through the main
// /api/documents GET (folders are returned inline there).
async function requireManager(request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { denied: NextResponse.json({ message: "Sign in to continue." }, { status: 401 }) };
  const db = getAdminDb();
  const decoded = await getAdminAuth().verifyIdToken(token);
  const snapshot = await getCachedUserSnapshot(db, decoded.uid);
  const profile = snapshot.data() || {};
  if (!snapshot.exists || profile.active === false || !MANAGER_ROLES.has(profile.role)) {
    return { denied: NextResponse.json({ message: "Administrator or Director access is required." }, { status: 403 }) };
  }
  return { db, uid: decoded.uid, name: profile.displayName || profile.email || decoded.uid };
}

function failure(stage, error) {
  if (error?.statusCode) return NextResponse.json({ message: error.message }, { status: error.statusCode });
  console.error("[document-folders-api] failed", { stage, code: error?.code || "unknown" });
  return NextResponse.json({ message: "Unable to manage folders. Please try again." }, { status: 500 });
}

export async function POST(request) {
  try {
    const a = await requireManager(request);
    if (a.denied) return a.denied;
    const body = await request.json().catch(() => ({}));
    const result = await createFolder(a.db, body.name, { uid: a.uid, name: a.name });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return failure("create", error);
  }
}

export async function PATCH(request) {
  try {
    const a = await requireManager(request);
    if (a.denied) return a.denied;
    const body = await request.json().catch(() => ({}));
    if (typeof body.id !== "string" || !body.id) return NextResponse.json({ message: "Folder ID is required." }, { status: 400 });
    const result = await renameFolder(a.db, body.id, body.name);
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    return failure("rename", error);
  }
}

export async function DELETE(request) {
  try {
    const a = await requireManager(request);
    if (a.denied) return a.denied;
    const body = await request.json().catch(() => ({}));
    if (typeof body.id !== "string" || !body.id) return NextResponse.json({ message: "Folder ID is required." }, { status: 400 });
    const result = await deleteFolder(a.db, body.id);
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    return failure("delete", error);
  }
}
