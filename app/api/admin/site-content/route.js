import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getAdminAuth, getAdminDb } from "../../../../lib/firebase-admin";
import { getCachedUserSnapshot } from "../../../../lib/server/cached-profile";
import { deleteContent, getHero, getHeroVideo, getPaymentSettings, saveHeroVideo, listContentSeeded, reorderContent, saveContent, saveHero, savePaymentSettings } from "../../../../lib/server/site-content-core";

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

// GET ?kind=program|gallery|session|course|hero|payment; POST saves
// {kind, ...fields, id?}; PUT reorders {ids}; DELETE removes {id}. `hero`
// (homepage header) and `payment` (Training Registration payment details)
// are single settings objects rather than lists.
export async function GET(request) {
  try {
    const a = await access(request);
    if (a.denied) return a.denied;
    const kind = new URL(request.url).searchParams.get("kind");
    if (kind === "hero") return NextResponse.json({ hero: await getHero(a.db) });
    if (kind === "payment") return NextResponse.json({ payment: await getPaymentSettings(a.db) });
    if (kind === "heroVideo") return NextResponse.json({ heroVideo: await getHeroVideo(a.db) });
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
    if (body.kind === "payment") return NextResponse.json({ ok: true, payment: await savePaymentSettings(a.db, body) });
    if (body.kind === "heroVideo") {
      const heroVideo = await saveHeroVideo(a.db, body);
      revalidatePath("/"); // the hero is in the homepage's first paint
      return NextResponse.json({ ok: true, heroVideo });
    }
    const saved = await saveContent(a.db, body.kind, body);
    if (body.kind === "course") revalidatePath("/"); // course cards are in the homepage's first paint
    return NextResponse.json({ ok: true, ...saved });
  } catch (error) {
    return respondError("save", error);
  }
}

export async function PUT(request) {
  try {
    const a = await access(request);
    if (a.denied) return a.denied;
    await reorderContent(a.db, (await request.json()).ids);
    revalidatePath("/");
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
    revalidatePath("/");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return respondError("delete", error);
  }
}
