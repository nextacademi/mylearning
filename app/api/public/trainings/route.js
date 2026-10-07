import { NextResponse } from "next/server";
import { getAdminDb } from "../../../../lib/firebase-admin";
import { singaporeDate } from "../../../../lib/server/singapore-date";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The public homepage's "Current Training" / "Up-coming Training" lists.
// Those lists used to be built only from Events, so a real running training
// (a `courses` doc) never appeared and "Current Training" was always empty.
// `courses` is not publicly readable (firestore.rules), so — same pattern as
// /api/public-stats — this unauthenticated route reads it server-side and
// returns ONLY display fields: no teacher, student, price or internal ids
// beyond the course's own.
const HIDDEN_STATUSES = new Set(["Draft", "Archived", "Completed"]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET() {
  try {
    const db = getAdminDb();
    const snapshot = await db.collection("courses").get();
    const today = singaporeDate();
    const trainings = snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((course) => !HIDDEN_STATUSES.has(course.status))
      // A mistyped year (e.g. "162026-11-01") would sort as if it were in
      // the past and show as "current" — only real YYYY-MM-DD dates list.
      .filter((course) => ISO_DATE.test(course.startDate || "") && (!course.endDate || ISO_DATE.test(course.endDate)))
      .filter((course) => !course.endDate || course.endDate >= today)
      .map((course) => ({
        id: course.id,
        title: course.title || "",
        category: course.category || "",
        startDate: course.startDate,
        endDate: course.endDate || "",
        startTime: course.startTime || "",
        endTime: course.endTime || "",
        location: [course.campus, course.building].filter(Boolean).join(", "),
        current: course.startDate <= today,
      }))
      .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.title.localeCompare(b.title));
    return NextResponse.json({ trainings }, { headers: { "Cache-Control": "public, max-age=300" } });
  } catch (error) {
    console.error("[public-trainings] failed", { message: error?.message });
    return NextResponse.json({ trainings: [] });
  }
}
