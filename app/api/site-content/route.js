import { NextResponse } from "next/server";
import { getAdminDb } from "../../../lib/firebase-admin";
import { getHero, getPublicPayment, listAllContent, listCourses } from "../../../lib/server/site-content-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public homepage cards (programs / gallery / training sessions / course
// cards), the hero header, and the Training Registration payment details
// (null until an admin has entered real ones). Any failure returns empty
// lists / no hero so the page keeps its built-in defaults.
export async function GET() {
  try {
    const db = getAdminDb();
    const [all, hero, courses, payment] = await Promise.all([listAllContent(db), getHero(db), listCourses(db), getPublicPayment(db)]);
    const strip = (list) => list.map(({ id, category, title, copy, stat, photo, videoUrl }) => ({ id, category, title, copy, stat, photo, videoUrl: videoUrl || "" }));
    return NextResponse.json(
      { program: strip(all.program), gallery: strip(all.gallery), session: strip(all.session), hero, courses, payment },
      { headers: { "Cache-Control": "public, max-age=60" } },
    );
  } catch (error) {
    console.error("[site-content] failed", { message: error?.message });
    return NextResponse.json({ program: [], gallery: [], session: [], hero: null, courses: null, payment: null });
  }
}
