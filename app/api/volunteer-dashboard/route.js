import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "../../../lib/firebase-admin";
import { getCachedUserSnapshot } from "../../../lib/server/cached-profile";
import { cached } from "../../../lib/redis-cache";
import { orgSummary, personalSummary } from "../../../lib/server/volunteer-dashboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const managers = new Set(["Admin", "Director"]);

// ?scope=me  → the caller's own Volunteer Home Panel (any signed-in member)
// ?scope=org → the Director/Admin leader console (managers only)
// ?refresh=1 bypasses the short cache (the dashboard's Refresh button).
export async function GET(request) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ message: "Sign in to continue." }, { status: 401 });
    const db = getAdminDb();
    const decoded = await getAdminAuth().verifyIdToken(token);
    const profile = await getCachedUserSnapshot(db, decoded.uid);
    const data = profile.data() || {};
    if (!profile.exists || data.active === false) return NextResponse.json({ message: "Account access is required." }, { status: 403 });

    const params = new URL(request.url).searchParams;
    const fresh = params.get("refresh") === "1";
    if (params.get("scope") === "org") {
      if (!managers.has(data.role)) return NextResponse.json({ message: "Director or Admin access is required." }, { status: 403 });
      const summary = fresh ? await orgSummary(db) : await cached("volunteer-dashboard:org", 60, () => orgSummary(db));
      return NextResponse.json(summary);
    }
    return NextResponse.json(await personalSummary(db, decoded.uid));
  } catch (error) {
    console.error("[volunteer-dashboard] failed", { message: error?.message });
    return NextResponse.json({ message: "Unable to load the dashboard. Please try again." }, { status: 500 });
  }
}
