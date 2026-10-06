import { NextResponse } from "next/server";
import { getAdminDb } from "../../../lib/firebase-admin";
import { getHero, listAllContent } from "../../../lib/server/site-content-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public homepage cards (programs / gallery / training sessions) plus the
// hero header. Any failure returns empty lists / no hero so the page keeps
// its built-in defaults.
export async function GET() {
  try {
    const db = getAdminDb();
    const [all, hero] = await Promise.all([listAllContent(db), getHero(db)]);
    const strip = (list) => list.map(({ id, category, title, copy, stat, photo }) => ({ id, category, title, copy, stat, photo }));
    return NextResponse.json(
      { program: strip(all.program), gallery: strip(all.gallery), session: strip(all.session), hero },
      { headers: { "Cache-Control": "public, max-age=60" } },
    );
  } catch (error) {
    console.error("[site-content] failed", { message: error?.message });
    return NextResponse.json({ program: [], gallery: [], session: [], hero: null });
  }
}
