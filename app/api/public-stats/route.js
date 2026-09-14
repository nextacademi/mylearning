import { NextResponse } from "next/server";
import { getAdminDb } from "../../../lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The public homepage's stat row needs real counts, but firestore.rules
// correctly requires auth to read users/courses/enrollments (there's no
// safe way to open a count-only Firestore rule without also opening full
// document reads to anonymous visitors). So this one small, unauthenticated
// route uses the Admin SDK server-side — same pattern as every other
// Admin-SDK-backed route in this app — to return ONLY four numbers, never
// any document content.
export async function GET() {
  try {
    const db = getAdminDb();
    const [students, teachers, courses, enrollments] = await Promise.all([
      db.collection("users").where("role", "==", "Student").count().get(),
      db.collection("users").where("role", "==", "Teacher").count().get(),
      db.collection("courses").count().get(),
      db.collection("enrollments").count().get(),
    ]);
    return NextResponse.json(
      {
        students: students.data().count,
        teachers: teachers.data().count,
        courses: courses.data().count,
        enrollments: enrollments.data().count,
      },
      { headers: { "Cache-Control": "public, max-age=300" } },
    );
  } catch (error) {
    console.error("[public-stats] failed", { message: error?.message });
    return NextResponse.json({ students: 0, teachers: 0, courses: 0, enrollments: 0 }, { status: 200 });
  }
}
