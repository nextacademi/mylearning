import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "../../../../lib/firebase-admin";
import { getCachedUserSnapshot } from "../../../../lib/server/cached-profile";
import { buildFinanceOverview } from "../../../../lib/server/finance-core";
import { cached } from "../../../../lib/redis-cache";

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

// One overview endpoint backs every Finance tab (Dashboard, Income,
// Transactions, Profit & Loss, Reports) so they never compute totals
// differently from one another — `from`/`to` (YYYY-MM-DD) optionally scope
// income/expenses to a date range; outstanding due is always current-state.
export async function GET(request) {
  try {
    const a = await access(request);
    if (a.denied) return a.denied;
    const url = new URL(request.url);
    const from = url.searchParams.get("from") || undefined;
    const to = url.searchParams.get("to") || undefined;
    // Same overview for every Admin/Director requesting the same date
    // range — cached 30s, keyed by the range itself. NOT explicitly
    // invalidated by the separate expenses/income/payments/admissions
    // write routes this aggregates (their date-range fan-out makes precise
    // invalidation impractical here); the 30s TTL is the deliberate
    // staleness bound instead — acceptable for a dashboard overview, not
    // used for anything that authorizes a transaction.
    const overview = await cached(`admin-finance:${from || "-"}:${to || "-"}`, 30, () => buildFinanceOverview(a.db, { from, to }));
    return NextResponse.json(overview);
  } catch (error) {
    console.error("[finance-api] failed", { code: error?.code || "unknown", message: error?.message || "unknown" });
    return NextResponse.json({ message: "Unable to load finance data. Please try again." }, { status: 500 });
  }
}
