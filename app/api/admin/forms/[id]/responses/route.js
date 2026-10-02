import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "../../../../../../lib/firebase-admin";
import { getCachedUserSnapshot } from "../../../../../../lib/server/cached-profile";
import { listResponses } from "../../../../../../lib/server/forms-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const managers = new Set(["Admin", "Director"]);

export async function GET(request, context) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ message: "Administrator access is required." }, { status: 401 });
    const db = getAdminDb();
    const decoded = await getAdminAuth().verifyIdToken(token);
    const profile = await getCachedUserSnapshot(db, decoded.uid);
    const data = profile.data() || {};
    if (!profile.exists || data.active === false || !managers.has(data.role)) {
      return NextResponse.json({ message: "Administrator access is required." }, { status: 403 });
    }
    const { id } = await context.params;
    return NextResponse.json({ responses: await listResponses(db, id) });
  } catch (error) {
    if (error?.statusCode) return NextResponse.json({ message: error.message }, { status: error.statusCode });
    console.error("[forms-api] responses failed", error?.code || error?.message);
    return NextResponse.json({ message: "Unable to load responses." }, { status: 500 });
  }
}
