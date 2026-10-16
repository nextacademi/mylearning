import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getAdminDb } from "../../../../lib/firebase-admin";
import { runSocialSync } from "../../../../lib/server/social-media-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Nightly Social Media sync, meant for Google Cloud Scheduler (e.g. 00:05
// Asia/Singapore) calling this URL with header
//   Authorization: Bearer <CRON_SECRET>
// Disabled (503) until CRON_SECRET is set, so it can never run unauthenticated.
function authorized(request) {
  const secret = process.env.CRON_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!secret || !supplied) return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handle(request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ message: "Scheduled sync is not configured." }, { status: 503 });
  }
  if (!authorized(request)) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  try {
    return NextResponse.json(await runSocialSync(getAdminDb(), { trigger: "schedule" }));
  } catch (error) {
    console.error("[social-sync-cron] failed", { message: error?.message || "unknown" });
    return NextResponse.json({ message: "Sync failed." }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
