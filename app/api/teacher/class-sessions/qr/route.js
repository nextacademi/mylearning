import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "../../../../../lib/firebase-admin";
import { getCachedUserSnapshot } from "../../../../../lib/server/cached-profile";
import { signQrToken } from "../../../../../lib/qr-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const managers = new Set(["Admin", "Director"]);
// Short-lived on purpose — a screenshot of the projected QR stops being
// useful within seconds, and the teacher's own screen re-requests a fresh
// one automatically before this expires (see the client polling interval).
const QR_TTL_MS = 45 * 1000;

async function access(request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { denied: NextResponse.json({ message: "Sign in to continue." }, { status: 401 }) };
  const db = getAdminDb();
  const decoded = await getAdminAuth().verifyIdToken(token);
  const profile = await getCachedUserSnapshot(db, decoded.uid);
  const data = profile.data() || {};
  if (!profile.exists || data.active === false || !["Teacher", ...managers].includes(data.role)) {
    return { denied: NextResponse.json({ message: "Teacher, Admin, or Director access is required." }, { status: 403 }) };
  }
  return { db, uid: decoded.uid, role: data.role };
}

function todayLocal() {
  return new Date().toISOString().slice(0, 10);
}

// Starts, refreshes, or stops a Class Session's live attendance QR. Reuses
// the existing classSessions doc (no new "attendance session" model) and
// the existing signed-token infrastructure (lib/qr-token.js) with a new
// `kind: "session"` — the same HMAC signing/verification every other QR in
// this app already uses, just a much shorter ttlMs. `qrVersion` mirrors
// the exact pattern already used to invalidate a student's D Card QR
// (users/{uid}.qrVersion) — bumping it here instantly invalidates any
// previously-issued token for this session, even before its own expiry.
export async function POST(request) {
  try {
    const a = await access(request);
    if (a.denied) return a.denied;
    const { sessionId, action } = await request.json().catch(() => ({}));
    if (typeof sessionId !== "string" || !sessionId) return NextResponse.json({ message: "Session ID is required." }, { status: 400 });
    if (!["start", "refresh", "stop"].includes(action)) return NextResponse.json({ message: "Invalid action." }, { status: 400 });

    const ref = a.db.collection("classSessions").doc(sessionId);
    const snapshot = await ref.get();
    if (!snapshot.exists) return NextResponse.json({ message: "Class session not found." }, { status: 404 });
    const session = snapshot.data();

    const isManager = managers.has(a.role);
    if (!isManager) {
      const classSnap = await a.db.collection("classes").doc(session.classId).get();
      if (!classSnap.exists || !(classSnap.data().teacherIds || []).includes(a.uid)) {
        return NextResponse.json({ message: "You are not authorized to manage this class session." }, { status: 403 });
      }
    }

    if (action === "stop") {
      await ref.update({ qrActive: false, updatedAt: FieldValue.serverTimestamp() });
      return NextResponse.json({ ok: true, qrActive: false });
    }

    // A QR can only ever be issued for the session's own real, current day
    // — never a past or future date, and never a cancelled session. No
    // hardcoded dates: "today" is always the server's own clock.
    if (session.status === "cancelled") {
      return NextResponse.json({ message: "This class session has been cancelled." }, { status: 400 });
    }
    if (session.date !== todayLocal()) {
      return NextResponse.json({ message: "Attendance QR can only be started on the session's actual date." }, { status: 400 });
    }

    const nextVersion = (session.qrVersion || 0) + 1;
    await ref.update({ qrVersion: nextVersion, qrActive: true, updatedAt: FieldValue.serverTimestamp() });

    const token = signQrToken({ sub: sessionId, kind: "session", v: nextVersion, ttlMs: QR_TTL_MS });
    return NextResponse.json({ ok: true, token, qrActive: true, expiresAt: Date.now() + QR_TTL_MS, ttlMs: QR_TTL_MS });
  } catch (error) {
    console.error("[class-session-qr-api] failed", { code: error?.code || "unknown", message: error?.message });
    return NextResponse.json({ message: "Unable to manage this session's attendance QR." }, { status: 500 });
  }
}
