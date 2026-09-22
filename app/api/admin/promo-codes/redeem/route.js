import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "../../../../../lib/firebase-admin";
import { getCachedUserSnapshot } from "../../../../../lib/server/cached-profile";
import { redeemPromo } from "../../../../../lib/server/promo-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const managers = new Set(["Admin", "Director"]);

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

// The "Live Checkout Simulator" — lets Director/Admin test that a code
// actually validates and see the real discount math, without a real order.
export async function POST(request) {
  try {
    const a = await access(request);
    if (a.denied) return a.denied;
    const result = await redeemPromo(a.db, await request.json());
    return NextResponse.json(result);
  } catch (error) {
    return error?.statusCode
      ? NextResponse.json({ message: error.message }, { status: error.statusCode })
      : (console.error("[promo-redeem-api] failed", { code: error?.code || "unknown", message: error?.message }),
         NextResponse.json({ message: "Unable to apply this code. Please try again." }, { status: 500 }));
  }
}
