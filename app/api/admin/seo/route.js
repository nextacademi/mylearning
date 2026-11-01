import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getAdminAuth, getAdminDb } from "../../../../lib/firebase-admin";
import { getCachedUserSnapshot } from "../../../../lib/server/cached-profile";
import { getSeoSettings, saveSeoSettings } from "../../../../lib/server/seo-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const managers = new Set(["Admin", "Director"]);

// Website → SEO (lib/server/seo-settings.js). Admin/Director only.
async function access(request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { denied: NextResponse.json({ message: "Sign in to continue." }, { status: 401 }) };
  const db = getAdminDb();
  const decoded = await getAdminAuth().verifyIdToken(token);
  const profile = await getCachedUserSnapshot(db, decoded.uid);
  const data = profile.data() || {};
  if (!profile.exists || data.active === false || !managers.has(data.role)) {
    return { denied: NextResponse.json({ message: "Only Admin or Director can edit SEO settings." }, { status: 403 }) };
  }
  return { db, uid: decoded.uid };
}

export async function GET(request) {
  try {
    const a = await access(request);
    if (a.denied) return a.denied;
    return NextResponse.json({ settings: await getSeoSettings(a.db) });
  } catch (error) {
    console.error("[seo-api] load failed", { message: error?.message });
    return NextResponse.json({ message: "Unable to load SEO settings." }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const a = await access(request);
    if (a.denied) return a.denied;
    const body = await request.json().catch(() => ({}));
    const settings = await saveSeoSettings(a.db, body, a.uid);
    // Re-render every page's <head> (title, meta, verification, analytics).
    revalidatePath("/", "layout");
    return NextResponse.json({ ok: true, settings });
  } catch (error) {
    if (error.statusCode) return NextResponse.json({ message: error.message }, { status: error.statusCode });
    console.error("[seo-api] save failed", { message: error?.message });
    return NextResponse.json({ message: "Unable to save SEO settings." }, { status: 500 });
  }
}
