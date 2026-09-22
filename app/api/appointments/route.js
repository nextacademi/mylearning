import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "../../../lib/firebase-admin";
import { getCachedUserSnapshot } from "../../../lib/server/cached-profile";
import {
  assignableStaff, bookableCourses, bookableStudents, bookedTimesForDate,
  cancelAppointment, createAppointment, listAppointments, markAppointmentCompleted, rescheduleAppointment,
} from "../../../lib/server/appointment-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const managers = new Set(["Admin", "Director"]);

function failure(stage, error) {
  console.error("[appointments-api] failed", { stage, code: error?.code || "unknown", message: error?.message || "unknown" });
  return NextResponse.json({ message: "Unable to manage appointments. Please try again." }, { status: 500 });
}
const respondError = (stage, error) => (error?.statusCode ? NextResponse.json({ message: error.message }, { status: error.statusCode }) : failure(stage, error));

// Any signed-in, active user may book/see their own; Admin/Director see and
// cancel everyone's. The acting identity always comes from the verified
// token — never from the request body.
async function access(request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { denied: NextResponse.json({ message: "Sign in to continue." }, { status: 401 }) };
  const db = getAdminDb();
  const decoded = await getAdminAuth().verifyIdToken(token);
  const profile = await getCachedUserSnapshot(db, decoded.uid);
  const data = profile.data() || {};
  if (!profile.exists || data.active === false) return { denied: NextResponse.json({ message: "Sign in to continue." }, { status: 403 }) };
  return { db, uid: decoded.uid, manager: managers.has(data.role) };
}

// ?date=YYYY-MM-DD -> only the already-booked times for that day.
// Otherwise -> this user's appointments (everyone's for Admin/Director)
// plus the trainings a consultation can be booked for.
export async function GET(request) {
  try {
    const a = await access(request);
    if (a.denied) return a.denied;
    const date = new URL(request.url).searchParams.get("date");
    if (date) return NextResponse.json({ booked: await bookedTimesForDate(a.db, date) });
    const [appointments, courses, students, staff] = await Promise.all([
      listAppointments(a.db, a),
      bookableCourses(a.db),
      a.manager ? bookableStudents(a.db) : Promise.resolve([]),
      a.manager ? assignableStaff(a.db) : Promise.resolve([]),
    ]);
    return NextResponse.json({ appointments, courses, students, staff });
  } catch (error) {
    return respondError("list", error);
  }
}

export async function POST(request) {
  try {
    const a = await access(request);
    if (a.denied) return a.denied;
    const result = await createAppointment(a.db, await request.json(), a);
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (error) {
    return respondError("create", error);
  }
}

export async function PATCH(request) {
  try {
    const a = await access(request);
    if (a.denied) return a.denied;
    const body = await request.json();
    if (body.action === "cancel") return NextResponse.json(await cancelAppointment(a.db, body.id, a));
    if (body.action === "complete") return NextResponse.json(await markAppointmentCompleted(a.db, body.id, a));
    if (body.action === "reschedule") return NextResponse.json({ ok: true, ...(await rescheduleAppointment(a.db, body.id, body, a)) });
    return NextResponse.json({ message: "Unknown action." }, { status: 400 });
  } catch (error) {
    return respondError("update", error);
  }
}
