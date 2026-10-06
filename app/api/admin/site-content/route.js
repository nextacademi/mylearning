import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getAdminAuth, getAdminDb } from "../../../../lib/firebase-admin";
import { getCachedUserSnapshot } from "../../../../lib/server/cached-profile";
import { deleteContent, getHero, listContentSeeded, reorderContent, saveContent, saveHero } from "../../../../lib/server/site-content-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const managers = new Set(["Admin", "Director"]);

function respondError(stage, error) {
  if (error?.statusCode) return NextResponse.json({ message: error.message }, { status: error.statusCode });
  console.error("[site-content-api] failed", { stage, code: error?.code || "unknown", message: error?.message || "unknown" });
  return NextResponse.json({ message: "Unable to manage website content. Please try again." }, { status: 500 });
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

// GET ?kind=program|gallery|session|hero; POST saves {kind, ...fields, id?};
// PUT reorders {ids}; DELETE removes {id}. `hero` is the single homepage
// header settings object rather than a list.
export async function GET(request) {
  try {
    const a = await access(request);
    if (a.denied) return a.denied;
    const kind = new URL(request.url).searchParams.get("kind");
    if (kind === "hero") return NextResponse.json({ hero: await getHero(a.db) });
    return NextResponse.json({ items: await listContentSeeded(a.db, kind) });
  } catch (error) {
    return respondError("list", error);
  }
}

export async function POST(request) {
  try {
    const a = await access(request);
    if (a.denied) return a.denied;
    const body = await request.json();
    if (body.kind === "hero") {
      const hero = await saveHero(a.db, body);
      revalidatePath("/"); // homepage is ISR — show the new header right away
      return NextResponse.json({ ok: true, hero });
    }
    return NextResponse.json({ ok: true, ...(await saveContent(a.db, body.kind, body)) });
  } catch (error) {
    return respondError("save", error);
  }
}

export async function PUT(request) {
  try {
    const a = await access(request);
    if (a.denied) return a.denied;
    await reorderContent(a.db, (await request.json()).ids);
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
    if (typeof id !== "string" || !id) return NextResponse.json({ message: "Item ID is required." }, { status: 400 });
    await deleteContent(a.db, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return respondError("delete", error);
  }
}
