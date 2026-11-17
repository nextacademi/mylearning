import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "../../../../lib/firebase-admin";
import { getCachedUserSnapshot } from "../../../../lib/server/cached-profile";
import { getPaymentMethods } from "../../../../lib/server/payment-methods";
import { emailConfigured } from "../../../../lib/email";
import {
  approveRegistration,
  listBatches,
  listRegistrations,
  rejectRegistration,
  sendConfirmation,
} from "../../../../lib/server/training-registration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const managers = new Set(["Admin", "Director"]);

// Dashboard → Registrations (Admin / Director).
// GET                → { registrations, emailConfigured }
// GET ?view=batches  → { batches, paymentMethods, emailConfigured }
// POST { action: "approve", id, courseId, recordPayment?, sendEmail? }
// POST { action: "reject", id, reason? }
// POST { action: "send-email", id }   — (re)send confirmation + invoice
async function requireManager(request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { denied: NextResponse.json({ message: "Sign in to continue." }, { status: 401 }) };
  const db = getAdminDb();
  const auth = getAdminAuth();
  const decoded = await auth.verifyIdToken(token).catch(() => null);
  if (!decoded) return { denied: NextResponse.json({ message: "Your session has expired. Please sign in again." }, { status: 401 }) };
  const profile = await getCachedUserSnapshot(db, decoded.uid);
  const data = profile.data() || {};
  if (!profile.exists || data.active === false || !managers.has(data.role)) {
    return { denied: NextResponse.json({ message: "Administrator or Director access is required." }, { status: 403 }) };
  }
  return { db, auth, actor: { uid: decoded.uid, name: data.displayName || data.email || "" } };
}

function failure(stage, error) {
  if (error?.statusCode) return NextResponse.json({ message: error.message }, { status: error.statusCode });
  console.error("[training-registrations-api] failed", { stage, code: error?.code || "unknown", message: error?.message || "unknown" });
  return NextResponse.json({ message: "Unable to complete this request. Please try again." }, { status: 500 });
}

export async function GET(request) {
  try {
    const access = await requireManager(request);
    if (access.denied) return access.denied;
    if (new URL(request.url).searchParams.get("view") === "batches") {
      const [batches, paymentMethods] = await Promise.all([listBatches(access.db), getPaymentMethods(access.db)]);
      return NextResponse.json({ batches, paymentMethods, emailConfigured: emailConfigured() });
    }
    return NextResponse.json({ registrations: await listRegistrations(access.db), emailConfigured: emailConfigured() });
  } catch (error) {
    return failure("list", error);
  }
}

export async function POST(request) {
  try {
    const access = await requireManager(request);
    if (access.denied) return access.denied;
    const body = await request.json().catch(() => ({}));
    const id = typeof body.id === "string" && body.id && !body.id.includes("/") ? body.id : "";
    if (!id) return NextResponse.json({ message: "Registration ID is required." }, { status: 400 });
    const { db, auth, actor } = access;
    const origin = new URL(request.url).origin;
    if (body.action === "approve") {
      return NextResponse.json(await approveRegistration({ db, auth, id, input: body, actor, origin }));
    }
    if (body.action === "reject") {
      return NextResponse.json(await rejectRegistration({ db, id, reason: body.reason, actor }));
    }
    if (body.action === "send-email") {
      return NextResponse.json({ ok: true, email: await sendConfirmation({ db, auth, id, origin }) });
    }
    return NextResponse.json({ message: "Unknown action." }, { status: 400 });
  } catch (error) {
    return failure("action", error);
  }
}
