import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "../../../../lib/firebase-admin";
import { getCachedUserSnapshot } from "../../../../lib/server/cached-profile";
import {
  buildEnrollmentsPayload,
  createEnrollment,
  loadCourseAndClass,
  removeEnrollment,
} from "../../../../lib/server/enrollment-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const managers = new Set(["Admin", "Director"]);

function failure(stage, error) {
  console.error("[enrollments-api] failed", { stage, code: error?.code || "unknown", message: error?.message || "unknown" });
  return NextResponse.json({ message: "Unable to manage enrollments. Please try again." }, { status: 500 });
}

async function access(request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { denied: NextResponse.json({ message: "Administrator access is required." }, { status: 401 }) };
  const db = getAdminDb();
  const decoded = await getAdminAuth().verifyIdToken(token);
  const profile = await getCachedUserSnapshot(db, decoded.uid);
  const data = profile.data() || {};
  if (!profile.exists || data.active === false || !managers.has(data.role)) {
    return { denied: NextResponse.json({ message: "Administrator access is required." }, { status: 403 }) };
  }
  return { db };
}

export async function GET(request) {
  try {
    const a = await access(request);
    if (a.denied) return a.denied;
    const courseId = new URL(request.url).searchParams.get("courseId");
    if (!courseId) return NextResponse.json({ message: "Training ID is required." }, { status: 400 });

    const { course, classDoc, error } = await loadCourseAndClass(a.db, courseId);
    if (error) return NextResponse.json({ message: error.message }, { status: error.status });

    const payload = await buildEnrollmentsPayload(a.db, course, classDoc);
    return NextResponse.json(payload);
  } catch (error) {
    return failure("list", error);
  }
}

export async function POST(request) {
  try {
    const a = await access(request);
    if (a.denied) return a.denied;
    const body = await request.json();
    const courseId = typeof body.courseId === "string" ? body.courseId : "";
    const studentId = typeof body.studentId === "string" ? body.studentId : "";
    if (!courseId || !studentId) return NextResponse.json({ message: "Training and student are required." }, { status: 400 });

    const { course, classDoc, error } = await loadCourseAndClass(a.db, courseId);
    if (error) return NextResponse.json({ message: error.message }, { status: error.status });

    const result = await createEnrollment(a.db, course, classDoc, studentId);
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    return failure("enroll", error);
  }
}

export async function DELETE(request) {
  try {
    const a = await access(request);
    if (a.denied) return a.denied;
    const body = await request.json();
    const courseId = typeof body.courseId === "string" ? body.courseId : "";
    const studentId = typeof body.studentId === "string" ? body.studentId : "";
    if (!courseId || !studentId) return NextResponse.json({ message: "Training and student are required." }, { status: 400 });

    const result = await removeEnrollment(a.db, courseId, studentId);
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    return failure("unenroll", error);
  }
}
