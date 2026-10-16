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
// POST { action: "exit" } → called from the impersonated session; reads
//                           `impersonatedBy` off the verified ID token and
//                           returns a token for that staff account again.
// Every start/exit is recorded in `impersonationLog` (server-only — no
// firestore.rules match, so clients can't read or alter it).
function failure(stage, error) {
  console.error("[impersonate-api] request failed", { stage, code: error?.code || "unknown", message: error?.message || "unknown" });
  return NextResponse.json({ message: "Unable to switch accounts. Please try again." }, { status: 500 });
}

const deny = (message, status = 403) => NextResponse.json({ message }, { status });
const nameOf = (data, fallback) => data?.displayName || data?.email || fallback;

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
      const staffUid = decoded.impersonatedBy;
      if (!staffUid) return deny("You are already signed in to your own account.", 400);
      // Fresh read (not the cache): a staff account deactivated or demoted
      // mid-session must not get its access back.
      const staff = await db.collection("users").doc(staffUid).get();
      if (!staff.exists || staff.data().active === false || !managers.has(staff.data().role)) {
        return deny("Your staff account no longer has access. Please sign in again.");
      }
      if (decoded.impersonationLogId) {
        await db.collection("impersonationLog").doc(decoded.impersonationLogId)
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
    await logRef.set({
      staffUid: decoded.uid,
      staffName: nameOf(staff, decoded.uid),
      staffRole: staff.role,
      targetUid,
      targetName: nameOf(target, targetUid),
      targetRole: target.role || "",
      startedAt: FieldValue.serverTimestamp(),
      endedAt: null,
      userAgent: (request.headers.get("user-agent") || "").slice(0, 300),
    });
    const customToken = await auth.createCustomToken(targetUid, {
      impersonatedBy: decoded.uid,
      impersonatorName: nameOf(staff, "Staff").slice(0, 80),
      impersonationLogId: logRef.id,
    });
    return NextResponse.json({ token: customToken, role: target.role || "" });
  } catch (error) {
    return failure(stage, error);
  }
}
