import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "../../../../../../lib/firebase-admin";
import { getCachedUserSnapshot } from "../../../../../../lib/server/cached-profile";
import { verifyQrToken, QrTokenError } from "../../../../../../lib/qr-token";
import { setEventAttendance } from "../../../../../../lib/server/event-hours";

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
    a = { db, eventRef: eventSnapshot.ref, event, staffId: decoded.uid };
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
  const summary = { id: userId, displayName: user.displayName || "", email: user.email || "" };

  // Someone who worked/attended without registering (a volunteer helping
  // run it, a walk-in) is added on the spot instead of being turned away,
  // so their hours still count.
  let walkIn = false;
  if (!participantSnapshot.exists) {
    walkIn = true;
    const batch = a.db.batch();
    batch.set(participantRef, {
      displayName: user.displayName || "",
      email: user.email || "",
      phone: user.phone || "",
      role: user.role || "",
      registeredAt: FieldValue.serverTimestamp(),
      attendanceStatus: null,
      attendanceAt: null,
      source: "walk-in",
      eventRole: user.role === "Volunteer" ? "Volunteer" : "Participant",
      hoursCredited: 0,
      addedBy: a.staffId,
    });
    batch.update(a.eventRef, { participantCount: FieldValue.increment(1) });
    await batch.commit();
  } else if (participantSnapshot.data().attendanceStatus === "present") {
    const p = participantSnapshot.data();
    return NextResponse.json({
      code: "already_marked",
      message: `Already checked in — ${Number(p.hoursCredited) || 0}h credited.`,
      participant: { ...summary, displayName: p.displayName || summary.displayName },
    });
  }

  // Marks present AND credits the event's hours to their totals.
  const result = await setEventAttendance(a.db, a.eventRef, a.event, userId, { status: "present", markedBy: a.staffId });
  return NextResponse.json({
    code: "success",
    message: `${walkIn ? "Added as walk-in and checked in" : "Checked in"} — ${result.hoursCredited}h credited as ${result.eventRole}.`,
    participant: summary,
    hoursCredited: result.hoursCredited,
    eventRole: result.eventRole,
  });
}
