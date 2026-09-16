import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "../../../../../lib/firebase-admin";
import { getCachedUserSnapshot } from "../../../../../lib/server/cached-profile";
import { listAwards, createAward, updateAward, revokeAward } from "../../../../../lib/server/award-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const managers = new Set(["Admin", "Director"]);

function failure(stage, error) {
  console.error("[achievement-awards-api] failed", { stage, code: error?.code || "unknown" });
  return NextResponse.json({ message: `Awards API failed at ${stage}. Check the server log for the safe error code.` }, { status: 500 });
}

async function requireManager(request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { denied: NextResponse.json({ message: "Administrator access is required." }, { status: 401 }) };
  const auth = getAdminAuth();
  const db = getAdminDb();
  const decoded = await auth.verifyIdToken(token);
  const profile = await getCachedUserSnapshot(db, decoded.uid);
  if (!profile.exists || profile.data().active === false || !managers.has(profile.data().role)) {
    return { denied: NextResponse.json({ message: "Administrator access is required." }, { status: 403 }) };
  }
  return { db, adminUid: decoded.uid, adminName: profile.data().displayName || profile.data().email || "Admin" };
}

// Admin "Awards" tab inside Achievement & Certificates — lists every award
// (achievements docs with kind:"award"), enriched with student/course names.
export async function GET(request) {
  try {
    const access = await requireManager(request);
    if (access.denied) return access.denied;
    const awards = await listAwards(access.db);
    return NextResponse.json({ awards });
  } catch (error) {
    return failure("award list", error);
  }
}

// Create a new award, optionally minting a linked certificate — see
// award-core.js's createAward for exactly what happens.
export async function POST(request) {
  try {
    const access = await requireManager(request);
    if (access.denied) return access.denied;
    const body = await request.json();
    const result = await createAward(access.db, body, access.adminUid, access.adminName);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return error?.statusCode ? NextResponse.json({ message: error.message }, { status: error.statusCode }) : failure("award create", error);
  }
}

// Edit or revoke — see award-core.js's updateAward/revokeAward.
export async function PATCH(request) {
  try {
    const access = await requireManager(request);
    if (access.denied) return access.denied;
    const body = await request.json();
    const { id, action } = body;
    if (typeof id !== "string" || !id) return NextResponse.json({ message: "Award ID is required." }, { status: 400 });
    if (action === "revoke") {
      await revokeAward(access.db, id);
      return NextResponse.json({ ok: true });
    }
    await updateAward(access.db, id, body);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return error?.statusCode ? NextResponse.json({ message: error.message }, { status: error.statusCode }) : failure("award update", error);
  }
}
