import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "../../../../lib/firebase-admin";
import { getCachedUserSnapshot } from "../../../../lib/server/cached-profile";
import { deleteMember, listTeamSeeded, reorderTeam, saveMember } from "../../../../lib/server/team-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const managers = new Set(["Admin", "Director"]);

function respondError(stage, error) {
  if (error?.statusCode) return NextResponse.json({ message: error.message }, { status: error.statusCode });
  console.error("[team-api] failed", { stage, code: error?.code || "unknown", message: error?.message || "unknown" });
  return NextResponse.json({ message: "Unable to manage the team. Please try again." }, { status: 500 });
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
  return { db };
}

export async function GET(request) {
  try {
    const a = await access(request);
    if (a.denied) return a.denied;
    return NextResponse.json({ members: await listTeamSeeded(a.db) });
  } catch (error) {
    return respondError("list", error);
  }
}

// POST saves (create, or update when `id` is present); PUT reorders; DELETE removes.
export async function POST(request) {
  try {
    const a = await access(request);
    if (a.denied) return a.denied;
    return NextResponse.json({ ok: true, ...(await saveMember(a.db, await request.json())) });
  } catch (error) {
    return respondError("save", error);
  }
}

export async function PUT(request) {
  try {
    const a = await access(request);
    if (a.denied) return a.denied;
    await reorderTeam(a.db, (await request.json()).ids);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return respondError("reorder", error);
  }
}

export async function DELETE(request) {
  try {
    const a = await access(request);
    if (a.denied) return a.denied;
    const { id } = await request.json();
    if (typeof id !== "string" || !id) return NextResponse.json({ message: "Member ID is required." }, { status: 400 });
    await deleteMember(a.db, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return respondError("delete", error);
  }
}
