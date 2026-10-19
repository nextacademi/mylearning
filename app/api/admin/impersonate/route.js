import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "../../../../lib/firebase-admin";
import { getCachedUserSnapshot } from "../../../../lib/server/cached-profile";
import { canImpersonate } from "../../../../lib/impersonation-shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const managers = new Set(["Admin", "Director"]);

// "Log in as user": an Admin/Director signs in as another account to see and
// use the app exactly as that person does.
//
// POST { uid }            → custom sign-in token for that user. The token
//                           carries `impersonatedBy` (the staff uid) as a
//                           developer claim, which only this server can set.
//                           Also returns a `returnKey` the browser keeps as
//                           a fallback way back (see below).
// POST { action: "exit", logId?, returnKey? }
//                         → called from the impersonated session; reads
//                           `impersonatedBy` off the verified ID token and
//                           returns a token for that staff account again.
//                           Claims from a custom token can drop off the
//                           session (Firebase re-issues the ID token without
//                           them after e.g. updateProfile), so when they're
//                           gone the saved logId + returnKey are accepted
//                           instead — only from that same target account and
//                           only until the key expires.
// Every start/exit is recorded in `impersonationLog` (server-only — no
// firestore.rules match, so clients can't read or alter it).
function failure(stage, error) {
  console.error("[impersonate-api] request failed", { stage, code: error?.code || "unknown", message: error?.message || "unknown" });
  return NextResponse.json({ message: "Unable to switch accounts. Please try again." }, { status: 500 });
}

const deny = (message, status = 403) => NextResponse.json({ message }, { status });
const nameOf = (data, fallback) => data?.displayName || data?.email || fallback;
const RETURN_KEY_TTL_MS = 24 * 60 * 60 * 1000;
const hashKey = (key) => createHash("sha256").update(key).digest();

// The impersonation log a saved return key unlocks for `uid`, or null.
async function logForReturnKey(db, uid, { logId, returnKey }) {
  if (typeof logId !== "string" || !logId || logId.includes("/") || typeof returnKey !== "string" || !returnKey) return null;
  const snap = await db.collection("impersonationLog").doc(logId).get();
  const log = snap.data();
  if (!snap.exists || log.targetUid !== uid || typeof log.returnKeyHash !== "string") return null;
  if (!(log.returnKeyExpiresAt?.toMillis?.() > Date.now())) return null;
  const stored = Buffer.from(log.returnKeyHash, "hex");
  const given = hashKey(returnKey);
  return stored.length === given.length && timingSafeEqual(stored, given) ? { id: snap.id, staffUid: log.staffUid } : null;
}

export async function POST(request) {
  let stage = "auth";
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return deny("Sign in to continue.", 401);
    const auth = getAdminAuth();
    const db = getAdminDb();
    const decoded = await auth.verifyIdToken(token);
    const body = await request.json().catch(() => ({}));

    if (body.action === "exit") {
      stage = "exit";
      let staffUid = decoded.impersonatedBy;
      let logId = decoded.impersonationLogId;
      if (!staffUid) {
        if (!body.returnKey) return deny("You are already signed in to your own account.", 400);
        const log = await logForReturnKey(db, decoded.uid, body);
        if (!log) return deny("This \"Log in as\" session has expired. Sign out, then sign in to your own account.", 400);
        ({ staffUid, id: logId } = log);
      }
      // Fresh read (not the cache): a staff account deactivated or demoted
      // mid-session must not get its access back.
      const staff = await db.collection("users").doc(staffUid).get();
      if (!staff.exists || staff.data().active === false || !managers.has(staff.data().role)) {
        return deny("Your staff account no longer has access. Please sign in again.");
      }
      if (logId) {
        await db.collection("impersonationLog").doc(logId)
          .set({ endedAt: FieldValue.serverTimestamp() }, { merge: true })
          .catch(() => {});
      }
      return NextResponse.json({ token: await auth.createCustomToken(staffUid), role: staff.data().role });
    }

    stage = "start";
    if (decoded.impersonatedBy) return deny("Return to your own account before logging in as someone else.", 400);
    const staffSnap = await getCachedUserSnapshot(db, decoded.uid);
    const staff = staffSnap.data() || {};
    if (!staffSnap.exists || staff.active === false || !managers.has(staff.role)) {
      return deny("Administrator or Director access is required.");
    }

    const targetUid = typeof body.uid === "string" ? body.uid : "";
    if (!targetUid || targetUid.includes("/")) return deny("Choose a user.", 400);
    if (targetUid === decoded.uid) return deny("That's your own account.", 400);
    const targetSnap = await db.collection("users").doc(targetUid).get();
    if (!targetSnap.exists) return deny("This user has no profile yet.", 404);
    const target = targetSnap.data();
    if (!canImpersonate(staff.role, target.role)) {
      return deny(`${staff.role}s can't log in as a ${target.role} account.`);
    }
    try {
      const record = await auth.getUser(targetUid);
      if (record.disabled) return deny("This account is disabled in Firebase Authentication.", 400);
    } catch {
      return deny("This user has no sign-in account.", 404);
    }

    const logRef = db.collection("impersonationLog").doc();
    const returnKey = randomBytes(32).toString("base64url");
    const returnKeyExpiresAt = Date.now() + RETURN_KEY_TTL_MS;
    await logRef.set({
      staffUid: decoded.uid,
      staffName: nameOf(staff, decoded.uid),
      staffRole: staff.role,
      targetUid,
      targetName: nameOf(target, targetUid),
      targetRole: target.role || "",
      startedAt: FieldValue.serverTimestamp(),
      endedAt: null,
      // Only the hash is stored; the key itself goes to the staff browser.
      returnKeyHash: hashKey(returnKey).toString("hex"),
      returnKeyExpiresAt: new Date(returnKeyExpiresAt),
      userAgent: (request.headers.get("user-agent") || "").slice(0, 300),
    });
    const staffName = nameOf(staff, "Staff").slice(0, 80);
    const customToken = await auth.createCustomToken(targetUid, {
      impersonatedBy: decoded.uid,
      impersonatorName: staffName,
      impersonationLogId: logRef.id,
    });
    return NextResponse.json({ token: customToken, role: target.role || "", logId: logRef.id, returnKey, returnKeyExpiresAt, staffName });
  } catch (error) {
    return failure(stage, error);
  }
}
