import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "../../../../lib/firebase-admin";
import { getCachedUserSnapshot } from "../../../../lib/server/cached-profile";
import { verifyQrToken, QrTokenError } from "../../../../lib/qr-token";
import { recordAttendanceScan } from "../../../../lib/server/attendance-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Student self-service check-in: the student scans the QR the teacher is
// displaying for the ACTIVE session (see app/api/teacher/class-sessions/qr)
// and this route validates everything server-side before ever writing
// attendance. Frontend never decides attendance is valid — every check
// below is authoritative. Writes through the exact same
// lib/server/attendance-core.js helper the teacher/admin-driven scan route
// uses — one attendance-writing code path, not a second attendance system.
async function access(request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { denied: NextResponse.json({ code: "unauthorized", message: "Sign in to continue." }, { status: 401 }) };
  const db = getAdminDb();
  const decoded = await getAdminAuth().verifyIdToken(token);
  const profile = await getCachedUserSnapshot(db, decoded.uid);
  const data = profile.data() || {};
  if (!profile.exists || data.active === false) {
    return { denied: NextResponse.json({ code: "unauthorized", message: "Sign in to continue." }, { status: 403 }) };
  }
  if (data.role !== "Student") {
    return { denied: NextResponse.json({ code: "unauthorized", message: "Only students can check in with this scanner." }, { status: 403 }) };
  }
  return { db, uid: decoded.uid, student: data };
}

function fail(code, message, status) {
  return NextResponse.json({ code, message }, { status });
}

export async function POST(request) {
  let a;
  try {
    a = await access(request);
  } catch {
    return fail("unauthorized", "Sign in to continue.", 401);
  }
  if (a.denied) return a.denied;
  const { db, uid: studentId, student } = a;

  const body = await request.json().catch(() => ({}));
  const rawToken = typeof body.token === "string" ? body.token : "";
  if (!rawToken) return fail("invalid_request", "No QR code data received.", 400);

  let payload;
  try {
    payload = verifyQrToken(rawToken);
  } catch (error) {
    if (error instanceof QrTokenError) return fail(error.code, error.message, 400);
    return fail("invalid", "Invalid QR Code.", 400);
  }
  if (payload.kind !== "session") {
    return fail("invalid", "This QR code is not an attendance session QR.", 400);
  }

  const sessionId = payload.sub;
  const sessionSnap = await db.collection("classSessions").doc(sessionId).get();
  if (!sessionSnap.exists) return fail("no_session", "There is currently no attendance session available.", 404);
  const session = sessionSnap.data();

  // Even a validly-signed, unexpired token is rejected the instant the
  // teacher stops the session or issues a new one (qrVersion bump) — never
  // trust the token's own expiry alone.
  if (!session.qrActive || (session.qrVersion || 0) !== payload.v) {
    return fail("expired", "This attendance QR has expired. Please scan the currently active class QR code.", 400);
  }
  if (session.status === "cancelled") {
    return fail("no_session", "There is currently no attendance session available.", 400);
  }
  const today = new Date().toISOString().slice(0, 10);
  if (session.date !== today) {
    return fail("expired", "This attendance QR has expired. Please scan the currently active class QR code.", 400);
  }

  // Real enrollment check — the exact same `enrollments/{courseId}_{uid}`
  // document every other part of this app already uses, never trusting
  // the scanned token for who's allowed to check in (it only ever
  // identifies the SESSION, never the student).
  const enrollmentSnap = await db.collection("enrollments").doc(`${session.courseId}_${studentId}`).get();
  const enrollment = enrollmentSnap.data();
  if (!enrollmentSnap.exists || enrollment.status === "withdrawn" || enrollment.classId !== session.classId) {
    return fail("not_enrolled", "You are not enrolled in this class.", 403);
  }

  const courseSnap = await db.collection("courses").doc(session.courseId).get();
  const courseTitle = courseSnap.exists ? courseSnap.data().title || "" : "";

  const result = await recordAttendanceScan(db, {
    classId: session.classId,
    courseId: session.courseId,
    studentId,
    teacherId: session.teacherId || "",
    markedBy: studentId,
    sessionId,
    location: session.location,
    className: session.title || courseTitle,
  });

  return NextResponse.json({
    code: result.code,
    message: result.code === "checked_in" ? "Attendance marked." : result.code === "checked_out" ? "Checked out." : "You are already marked present for this session.",
    course: { id: session.courseId, title: courseTitle },
    session: { id: sessionId, title: session.title || "", date: session.date, startTime: session.startTime, endTime: session.endTime, location: session.location },
    student: { id: studentId, displayName: student.displayName || "" },
    ...(result.durationMinutes != null ? { durationMinutes: result.durationMinutes } : {}),
  });
}
