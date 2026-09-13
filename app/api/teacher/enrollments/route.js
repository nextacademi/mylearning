import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "../../../../lib/firebase-admin";
import { getCachedUserSnapshot } from "../../../../lib/server/cached-profile";
import { buildEnrollmentsPayload, createEnrollment, loadCourseAndClass } from "../../../../lib/server/enrollment-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function failure(stage, error) {
  console.error("[teacher-enrollments-api] failed", { stage, code: error?.code || "unknown", message: error?.message || "unknown" });
  return NextResponse.json({ message: "Unable to manage enrollments. Please try again." }, { status: 500 });
}

// 1. authenticated user -> 2. role === Teacher (and active)
async function access(request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { denied: NextResponse.json({ message: "Sign in as a teacher to continue." }, { status: 401 }) };
  const db = getAdminDb();
  const decoded = await getAdminAuth().verifyIdToken(token);
  const profile = await getCachedUserSnapshot(db, decoded.uid);
  const data = profile.data() || {};
  if (!profile.exists || data.active === false || data.role !== "Teacher") {
    return { denied: NextResponse.json({ message: "Teacher access is required." }, { status: 403 }) };
  }
  return { db, uid: decoded.uid };
}

// 3. training exists -> 4. teacher is assigned to training -> 5. class belongs to training
async function requireAssignedTraining(db, uid, courseId) {
  const { course, classDoc, error } = await loadCourseAndClass(db, courseId);
  if (error) return { error };
  if (!(course.teacherIds || []).includes(uid)) {
    return { error: { status: 403, message: "You are not assigned to this training." } };
  }
  if (classDoc.courseId !== courseId) {
    return { error: { status: 400, message: "This training's class configuration is invalid." } };
  }
  return { course, classDoc };
}

export async function GET(request) {
  try {
    const a = await access(request);
    if (a.denied) return a.denied;
    const courseId = new URL(request.url).searchParams.get("courseId");
    if (!courseId) return NextResponse.json({ message: "Training ID is required." }, { status: 400 });

    const { course, classDoc, error } = await requireAssignedTraining(a.db, a.uid, courseId);
    if (error) return NextResponse.json({ message: error.message }, { status: error.status });

    const payload = await buildEnrollmentsPayload(a.db, course, classDoc, { includePayments: false });
    return NextResponse.json(payload);
  } catch (error) {
    return failure("list", error);
  }
}

// 6. student exists -> 7. student is active -> 8. not already enrolled ->
// 9. capacity available -> 10. create enrollment (all inside createEnrollment)
export async function POST(request) {
  try {
    const a = await access(request);
    if (a.denied) return a.denied;
    const body = await request.json();
    const courseId = typeof body.courseId === "string" ? body.courseId : "";
    const studentId = typeof body.studentId === "string" ? body.studentId : "";
    if (!courseId || !studentId) return NextResponse.json({ message: "Training and student are required." }, { status: 400 });

    const { course, classDoc, error } = await requireAssignedTraining(a.db, a.uid, courseId);
    if (error) return NextResponse.json({ message: error.message }, { status: error.status });

    const result = await createEnrollment(a.db, course, classDoc, studentId);
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    return failure("enroll", error);
  }
}
