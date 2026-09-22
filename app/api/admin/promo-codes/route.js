import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "../../../../lib/firebase-admin";
import { getCachedUserSnapshot } from "../../../../lib/server/cached-profile";
import { bulkGeneratePromos, createPromo, deletePromo, listPromos } from "../../../../lib/server/promo-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const managers = new Set(["Admin", "Director"]);

function failure(stage, error) {
  console.error("[promo-codes-api] failed", { stage, code: error?.code || "unknown", message: error?.message || "unknown" });
  return NextResponse.json({ message: "Unable to manage promo codes. Please try again." }, { status: 500 });
}
const respondError = (stage, error) => (error?.statusCode ? NextResponse.json({ message: error.message }, { status: error.statusCode }) : failure(stage, error));

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
  return { db, uid: decoded.uid, createdByName: data.displayName || data.email || decoded.uid };
}

export async function GET(request) {
  try {
    const a = await access(request);
    if (a.denied) return a.denied;
    return NextResponse.json({ promos: await listPromos(a.db) });
  } catch (error) {
    return respondError("list", error);
  }
}

export async function POST(request) {
  try {
    const a = await access(request);
    if (a.denied) return a.denied;
    const body = await request.json();
    const result = body.bulk
      ? await bulkGeneratePromos(a.db, body, a.uid, a.createdByName)
      : await createPromo(a.db, body, a.uid, a.createdByName);
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (error) {
    return respondError("create", error);
  }
}

export async function DELETE(request) {
  try {
    const a = await access(request);
    if (a.denied) return a.denied;
    const { id } = await request.json();
    return NextResponse.json(await deletePromo(a.db, id));
  } catch (error) {
    return respondError("delete", error);
  }
}
