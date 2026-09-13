import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "../../../../lib/firebase-admin";
import { getCachedUserSnapshot } from "../../../../lib/server/cached-profile";
import { signQrToken } from "../../../../lib/qr-token";
import { ensureUserId } from "../../../../lib/server/user-id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function access(request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token)
    return { denied: NextResponse.json({ message: "Sign in to continue." }, { status: 401 }) };
  const db = getAdminDb();
  const decoded = await getAdminAuth().verifyIdToken(token);
  const profile = await getCachedUserSnapshot(db, decoded.uid);
  const data = profile.data() || {};
  if (!profile.exists || data.active === false)
    return { denied: NextResponse.json({ message: "Account access is required." }, { status: 403 }) };
  // A pending/rejected registration must never receive an ID card, even via
  // a direct API call — this is the real, server-side enforcement point;
  // the UI hiding the button is only a convenience on top of this.
  if (data.status === "pending")
    return { denied: NextResponse.json({ message: "Your account is pending administrator approval." }, { status: 403 }) };
  if (data.status === "rejected")
    return { denied: NextResponse.json({ message: "Your registration was not approved." }, { status: 403 }) };
  return { db, uid: decoded.uid, profile: data };
}

export async function POST(request) {
  try {
    const a = await access(request);
    if (a.denied) return a.denied;
    const body = await request.json().catch(() => ({}));
    const mode = body.mode === "student" ? "student" : "self";
    const regenerate = Boolean(body.regenerate);

    let targetId = a.uid;
    let targetRef = a.db.collection("users").doc(a.uid);
    let targetData = a.profile;

    if (mode === "student") {
      if (a.profile.role !== "Teacher")
        return NextResponse.json({ message: "Teacher access is required to issue a student ID card." }, { status: 403 });
      const studentId = typeof body.studentId === "string" ? body.studentId : "";
      if (!studentId)
        return NextResponse.json({ message: "Student ID is required." }, { status: 400 });
      targetRef = a.db.collection("users").doc(studentId);
      const snapshot = await targetRef.get();
      targetData = snapshot.data() || {};
      if (
        !snapshot.exists ||
        targetData.role !== "Student" ||
        !(targetData.teacherIds || []).includes(a.uid)
      ) {
        return NextResponse.json(
          { message: "You are not authorized to issue a QR code for this student." },
          { status: 403 },
        );
      }
      targetId = studentId;
    }

    let qrVersion = targetData.qrVersion || 0;
    if (regenerate) {
      qrVersion += 1;
      await targetRef.update({ qrVersion, updatedAt: FieldValue.serverTimestamp() });
    }

    // A self-issued card's `kind` must stay "student" when the caller
    // actually is a Student, so it still works with the existing
    // attendance-scan contract (which only recognizes kind === "student").
    // Every other self-issuing role gets the generic "teacher" bucket —
    // nothing else in the app branches on kind besides attendance-scan.
    const kind = mode === "student" ? "student" : targetData.role === "Student" ? "student" : "teacher";
    const qrToken = signQrToken({ sub: targetId, kind, v: qrVersion });

    // The card must show the human-readable unified User ID, never the raw
    // Firebase Auth UID (`targetId`) — backfill it here if this account
    // predates the field, same belt-and-suspenders pattern used elsewhere.
    const userId = targetData.userId || (await ensureUserId(a.db, targetId));

    return NextResponse.json({
      token: qrToken,
      qrVersion,
      subject: {
        id: targetId,
        userId: userId || null,
        displayName: targetData.displayName || "",
        email: targetData.email || "",
        role: mode === "student" ? "Student" : targetData.role || "Member",
        photoURL: targetData.photoURL || "",
        active: targetData.active !== false,
        status: targetData.status || "active",
      },
    });
  } catch (error) {
    console.error("[qr-token-api] failed", { message: error?.message });
    return NextResponse.json({ message: "Unable to issue a QR code." }, { status: 500 });
  }
}
