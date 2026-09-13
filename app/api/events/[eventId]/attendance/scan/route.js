import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "../../../../../../lib/firebase-admin";
import { getCachedUserSnapshot } from "../../../../../../lib/server/cached-profile";
import { verifyQrToken, QrTokenError } from "../../../../../../lib/qr-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const managers = new Set(["Admin", "Director"]);

function fail(code, message, status) {
  return NextResponse.json({ code, message }, { status });
}

// Reuses the exact same QR primitive as /api/teacher/attendance/scan
// (self-issued token from /api/teacher/qr-token, already printed on every
// user's own ID card) — an authorized staff member (Admin/Director, or the
// Teacher organizing this specific event) scans a participant's existing ID
// QR to mark them present. No second QR-issuing system is introduced.
export async function POST(request, { params }) {
  let a;
  try {
    const { eventId } = await params;
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return fail("unauthorized", "Sign in to continue.", 401);
    const db = getAdminDb();
    const decoded = await getAdminAuth().verifyIdToken(token);
    const profile = await getCachedUserSnapshot(db, decoded.uid);
    const data = profile.data() || {};
    if (!profile.exists || data.active === false) return fail("unauthorized", "Account access is required.", 403);

    const eventSnapshot = await db.collection("academyEvents").doc(eventId).get();
    if (!eventSnapshot.exists) return fail("not_found", "Event not found.", 404);
    const event = eventSnapshot.data();
    const isManager = managers.has(data.role);
    const isOrganizerTeacher = data.role === "Teacher" && event.organizerId === decoded.uid;
    if (!isManager && !isOrganizerTeacher) return fail("unauthorized", "You are not authorized to scan attendance for this event.", 403);
    a = { db, eventRef: eventSnapshot.ref, staffId: decoded.uid };
  } catch {
    return fail("unauthorized", "Sign in to continue.", 401);
  }

  const body = await request.json().catch(() => ({}));
  const rawToken = typeof body.token === "string" ? body.token : "";
  if (!rawToken) return fail("invalid_request", "No QR code data received.", 400);

  let payload;
  try {
    payload = verifyQrToken(rawToken);
  } catch (error) {
    if (error instanceof QrTokenError) return fail(error.code, error.message, 400);
    return fail("invalid", "Invalid QR code.", 400);
  }

  const userId = payload.sub;
  const userSnapshot = await a.db.collection("users").doc(userId).get();
  if (!userSnapshot.exists) return fail("not_found", "Participant not found.", 404);
  const user = userSnapshot.data();
  if ((user.qrVersion || 0) !== payload.v) {
    return fail("expired", "This QR code has been replaced. Ask for a reissued ID card.", 400);
  }

  const participantRef = a.eventRef.collection("participants").doc(userId);
  const participantSnapshot = await participantRef.get();
  if (!participantSnapshot.exists) {
    return fail("not_registered", "This person is not a registered participant of this event.", 403);
  }
  const participant = participantSnapshot.data();
  const summary = { id: userId, displayName: participant.displayName || user.displayName || "", email: participant.email || user.email || "" };

  if (participant.attendanceStatus === "present") {
    return NextResponse.json({ code: "already_marked", message: "Attendance was already recorded for this participant.", participant: summary });
  }

  await participantRef.update({
    attendanceStatus: "present",
    attendanceAt: FieldValue.serverTimestamp(),
    markedBy: a.staffId,
  });
  return NextResponse.json({ code: "success", message: "Attendance marked.", participant: summary });
}
