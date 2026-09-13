import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "../../../../../lib/firebase-admin";
import { getCachedUserSnapshot } from "../../../../../lib/server/cached-profile";
import { checkAndIssueCertificate } from "../../../../../lib/server/certificate-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// This route is NOT a "request a certificate" button — students never call
// it and it accepts no student-submitted certificate data. It exists only
// because this app's attendance-marking (lib/teacher-data.js's
// saveAttendance) and gradebook (lib/teacher-assessments.js's
// createAssessment) writes are direct client-Firestore writes with no
// server route of their own — restructuring them into server routes just to
// host this check would be exactly the "unnecessarily rewrite existing
// working code" the task forbids. Instead, the Teacher's client code calls
// this immediately after those writes succeed, re-deriving eligibility from
// the same real data every time (see certificate-core.js) — a Student can
// never influence the outcome by calling this directly, since eligibility
// is only ever computed from existing attendance/assessment records.
async function access(request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { denied: NextResponse.json({ message: "Sign in as a teacher to continue." }, { status: 401 }) };
  const db = getAdminDb();
  const decoded = await getAdminAuth().verifyIdToken(token);
  const profile = await getCachedUserSnapshot(db, decoded.uid);
  const data = profile.data() || {};
  if (!profile.exists || data.active === false || !["Teacher", "Admin", "Director"].includes(data.role)) {
    return { denied: NextResponse.json({ message: "Teacher access is required." }, { status: 403 }) };
  }
  return { db, uid: decoded.uid, role: data.role };
}

export async function POST(request) {
  try {
    const a = await access(request);
    if (a.denied) return a.denied;
    const { studentId, courseId } = await request.json().catch(() => ({}));
    if (typeof studentId !== "string" || !studentId) return NextResponse.json({ message: "Student ID is required." }, { status: 400 });
    if (typeof courseId !== "string" || !courseId) return NextResponse.json({ message: "Course ID is required." }, { status: 400 });

    if (a.role === "Teacher") {
      const student = await a.db.collection("users").doc(studentId).get();
      if (!student.exists || !(student.data().teacherIds || []).includes(a.uid)) {
        return NextResponse.json({ message: "This student is not assigned to you." }, { status: 403 });
      }
    }

    const result = await checkAndIssueCertificate(a.db, { studentId, courseId });
    return NextResponse.json({ issued: Boolean(result), ...result });
  } catch (error) {
    console.error("[teacher-certificates-check-api] failed", { code: error?.code || "unknown", message: error?.message });
    return NextResponse.json({ message: "Unable to check certificate eligibility right now." }, { status: 500 });
  }
}
