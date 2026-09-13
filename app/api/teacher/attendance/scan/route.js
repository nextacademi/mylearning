import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "../../../../../lib/firebase-admin";
import { getCachedUserSnapshot } from "../../../../../lib/server/cached-profile";
import { verifyQrToken, QrTokenError } from "../../../../../lib/qr-token";
import { recordAttendanceScan } from "../../../../../lib/server/attendance-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const managers = new Set(["Admin", "Director"]);

async function access(request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token)
    return { denied: NextResponse.json({ code: "unauthorized", message: "Sign in to continue." }, { status: 401 }) };
  const db = getAdminDb();
  const decoded = await getAdminAuth().verifyIdToken(token);
  const profile = await getCachedUserSnapshot(db, decoded.uid);
  const data = profile.data() || {};
  if (!profile.exists || data.active === false || !["Teacher", ...managers].includes(data.role))
    return { denied: NextResponse.json({ code: "unauthorized", message: "Teacher, Admin, or Director access is required." }, { status: 403 }) };
  return { db, uid: decoded.uid, role: data.role };
}

function fail(code, message, status) {
  return NextResponse.json({ code, message }, { status });
}

export async function POST(request) {
  let a;
  try {
    a = await access(request);
  } catch {
    return fail("unauthorized", "Sign in as a teacher to continue.", 401);
  }
  if (a.denied) return a.denied;
  const { db, uid: actingUid, role } = a;
  const isManager = managers.has(role);

  const body = await request.json().catch(() => ({}));
  const classId = typeof body.classId === "string" ? body.classId : "";
  const rawToken = typeof body.token === "string" ? body.token : "";
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  if (!classId) return fail("invalid_request", "Select a class before scanning.", 400);
  if (!rawToken) return fail("invalid_request", "No QR code data received.", 400);

  // Optional: scanning against a real, pre-scheduled Class Session (see
  // /api/class-sessions) tags the attendance record with sessionId/location
  // — never trusted blindly from the client, re-verified server-side that
  // the session actually belongs to the class being scanned for.
  let session = null;
  if (sessionId) {
    const sessionSnap = await db.collection("classSessions").doc(sessionId).get();
    if (!sessionSnap.exists || sessionSnap.data().classId !== classId) {
      return fail("invalid_request", "This class session does not match the selected class.", 400);
    }
    session = sessionSnap.data();
  }

  let payload;
  try {
    payload = verifyQrToken(rawToken);
  } catch (error) {
    if (error instanceof QrTokenError) {
      return fail(error.code, error.message, 400);
    }
    return fail("invalid", "Invalid QR code.", 400);
  }

  if (payload.kind !== "student") {
    return fail("invalid", "This QR code does not belong to a student.", 400);
  }

  const classSnapshot = await db.collection("classes").doc(classId).get();
  if (!classSnapshot.exists) {
    return fail("unauthorized", "You do not have access to this class.", 403);
  }
  // Admin/Director can scan for any class (matches their existing
  // unrestricted permissions elsewhere); a Teacher only for a class they're
  // actually assigned to — server-verified, never trusted from the client.
  if (!isManager && !(classSnapshot.data().teacherIds || []).includes(actingUid)) {
    return fail("unauthorized", "You do not have access to this class.", 403);
  }

  const studentId = payload.sub;
  const studentSnapshot = await db.collection("users").doc(studentId).get();
  if (!studentSnapshot.exists || studentSnapshot.data().role !== "Student") {
    return fail("not_found", "Student not found.", 404);
  }
  const student = studentSnapshot.data();
  if (!isManager && !(student.teacherIds || []).includes(actingUid)) {
    return fail("unauthorized", "This student is not assigned to you.", 403);
  }
  if ((student.qrVersion || 0) !== payload.v) {
    return fail("expired", "This QR code has been replaced. Ask for a reissued ID card.", 400);
  }

  // The attendance record's teacherId is always the class's real assigned
  // teacher (or the session's assigned teacher, if more specific) — never
  // the Admin/Director's own uid — so it still shows up correctly in that
  // teacher's own dashboard/attendance views. Same reasoning as the manual
  // Director-marks-attendance fix in TrainingDetailsPage.jsx.
  const recordTeacherId = isManager
    ? session?.teacherId || (classSnapshot.data().teacherIds || [])[0] || actingUid
    : actingUid;

  const studentSummary = {
    id: studentId,
    displayName: student.displayName || "",
    email: student.email || "",
  };
  const courseId = classSnapshot.data().courseId || "";
  const className = classSnapshot.data().name || "class";

  // The D Card's QR is scanned twice per session: the first scan of the
  // day for this student/class checks them in; the second checks them out
  // and computes real session minutes from the stored checkInAt. A third+
  // scan the same day is a no-op — it never overwrites an already-recorded
  // checkout. See lib/server/attendance-core.js for the shared, now
  // transactional, implementation (also used by the student self-service
  // session-QR check-in route — one attendance-writing code path, not two).
  const result = await recordAttendanceScan(db, {
    classId,
    courseId,
    studentId,
    teacherId: recordTeacherId,
    markedBy: actingUid,
    sessionId: session ? sessionId : undefined,
    location: session?.location,
    className,
  });

  if (result.code === "already_checked_out") {
    return NextResponse.json({
      code: "already_checked_out",
      message: "This student has already checked in and out today.",
      student: studentSummary,
      attendance: { id: result.attendanceId, ...result.record, markedAt: undefined },
    });
  }

  return NextResponse.json({
    code: result.code,
    message: result.message,
    student: studentSummary,
    class: { id: classId, name: className },
    ...(result.durationMinutes != null ? { durationMinutes: result.durationMinutes } : {}),
  });
}
