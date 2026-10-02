import { NextResponse } from "next/server";
import { getAdminDb } from "../../../lib/firebase-admin";
import { listTeam } from "../../../lib/server/team-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public "Our Team" data. Returns an empty list on any failure so the page
// falls back to its built-in team.
export async function GET() {
  try {
    const members = (await listTeam(getAdminDb())).map(({ id, name, role, photo, socials }) => ({ id, name, role, photo, socials }));
    return NextResponse.json({ members }, { headers: { "Cache-Control": "public, max-age=60" } });
  } catch (error) {
    console.error("[team] failed", { message: error?.message });
    return NextResponse.json({ members: [] });
  }
}
