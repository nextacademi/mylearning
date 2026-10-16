import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "../../../../lib/firebase-admin";
import { getCachedUserSnapshot } from "../../../../lib/server/cached-profile";
import { buildAnalytics, deletePost, listAllPosts, saveAccount, upsertPosts } from "../../../../lib/server/social-media-core";
import { connectorStatus, runSocialSync } from "../../../../lib/server/social-media-sync";
import { RANGES } from "../../../../lib/social-media-shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
const managers = new Set(["Admin", "Director"]);
const MAX_IMPORT_ROWS = 2000;

function failure(stage, error) {
  console.error("[social-media-api] request failed", { stage, code: error?.code || "unknown", message: error?.message || "unknown" });
  return NextResponse.json({ message: "Unable to complete this request. Please try again." }, { status: 500 });
}

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

// GET ?range=7d|30d|6mo|1y  → dashboard analytics
// GET ?view=posts           → every stored post (Manage data screen)
export async function GET(request) {
  try {
    const access = await requireManager(request);
    if (access.denied) return access.denied;
    const params = new URL(request.url).searchParams;
    if (params.get("view") === "posts") {
      return NextResponse.json({ posts: await listAllPosts(access.db) });
    }
    const requested = params.get("range");
    const range = RANGES.some((item) => item.key === requested) ? requested : "30d";
    const analytics = await buildAnalytics(access.db, range);
    return NextResponse.json({ ...analytics, connectors: connectorStatus() });
  } catch (error) {
    return failure("read", error);
  }
}

// POST { action: "sync" }                              → pull from platform APIs now
// POST { action: "upsert", posts: [...], source }      → manual entry / CSV import
// POST { action: "delete", id }                        → remove one post
// POST { action: "account", platform, followers, handle, url }
export async function POST(request) {
  let stage = "auth";
  try {
    const access = await requireManager(request);
    if (access.denied) return access.denied;
    const body = await request.json().catch(() => ({}));
    stage = body.action || "unknown";

    if (body.action === "sync") {
      return NextResponse.json(await runSocialSync(access.db, { uid: access.uid, trigger: "manual" }));
    }
    if (body.action === "upsert") {
      const posts = Array.isArray(body.posts) ? body.posts : [];
      if (!posts.length) return NextResponse.json({ message: "No posts to save." }, { status: 400 });
      if (posts.length > MAX_IMPORT_ROWS) {
        return NextResponse.json({ message: `Import at most ${MAX_IMPORT_ROWS} rows at a time.` }, { status: 400 });
      }
      const source = body.source === "import" ? "import" : "manual";
      const result = await upsertPosts(access.db, posts, { source, uid: access.uid });
      if (!result.saved && result.errors.length) {
        return NextResponse.json({ message: result.errors[0].message, ...result }, { status: 400 });
      }
      return NextResponse.json(result);
    }
    if (body.action === "delete") {
      const removed = await deletePost(access.db, body.id);
      if (!removed) return NextResponse.json({ message: "Post not found." }, { status: 404 });
      return NextResponse.json({ ok: true });
    }
    if (body.action === "account") {
      const result = await saveAccount(access.db, body, { source: "manual", uid: access.uid });
      if (result.error) return NextResponse.json({ message: result.error }, { status: 400 });
      return NextResponse.json(result);
    }
    return NextResponse.json({ message: "Unknown action." }, { status: 400 });
  } catch (error) {
    return failure(stage, error);
  }
}
