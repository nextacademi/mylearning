import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "../../../../../lib/firebase-admin";
import { getCachedUserSnapshot } from "../../../../../lib/server/cached-profile";
import {
  deleteIncomeRecord,
  listIncomeRecords,
  recordIncome,
  updateIncomeRecord,
} from "../../../../../lib/server/finance-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Manual academy income (Finance → Income). Same authorization contract as
// every other Finance endpoint: only an active Admin/Director may read or
// write. The creator identity is taken from the verified token + profile,
// never from the request body.
const managers = new Set(["Admin", "Director"]);

function failure(stage, error) {
  console.error("[finance-income-api] failed", { stage, code: error?.code || "unknown", message: error?.message || "unknown" });
  return NextResponse.json({ message: "Unable to manage income records. Please try again." }, { status: 500 });
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
  return { db, uid: decoded.uid, createdByName: data.displayName || data.email || decoded.uid };
}

export async function GET(request) {
  try {
    const a = await access(request);
    if (a.denied) return a.denied;
    const url = new URL(request.url);
    const from = url.searchParams.get("from") || undefined;
    const to = url.searchParams.get("to") || undefined;
    const income = await listIncomeRecords(a.db, { from, to });
    return NextResponse.json({ income });
  } catch (error) {
    return failure("list", error);
  }
}

export async function POST(request) {
  try {
    const a = await access(request);
    if (a.denied) return a.denied;
    const body = await request.json();
    const result = await recordIncome(a.db, body, a.uid, a.createdByName);
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    return failure("create", error);
  }
}

export async function PATCH(request) {
  try {
    const a = await access(request);
    if (a.denied) return a.denied;
    const body = await request.json();
    if (typeof body.id !== "string" || !body.id) return NextResponse.json({ message: "Income record ID is required." }, { status: 400 });
    const result = await updateIncomeRecord(a.db, body.id, body);
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    return failure("update", error);
  }
}

export async function DELETE(request) {
  try {
    const a = await access(request);
    if (a.denied) return a.denied;
    const body = await request.json();
    if (typeof body.id !== "string" || !body.id) return NextResponse.json({ message: "Income record ID is required." }, { status: 400 });
    const result = await deleteIncomeRecord(a.db, body.id);
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    return failure("delete", error);
  }
}
