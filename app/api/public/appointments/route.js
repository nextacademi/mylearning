import { NextResponse } from "next/server";
import { getAdminDb } from "../../../../lib/firebase-admin";
import { bookableCourses, bookedTimesForDate, createAppointment } from "../../../../lib/server/appointment-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The public landing page's "Book an Appointment" widget (Get in touch
// section) — deliberately no sign-in required, same as the Contact form
// right next to it. Writes into the exact same `appointments` collection
// and goes through the exact same createAppointment validation (course
// must be real and open, slot uniqueness via transaction, field limits)
// as the authenticated in-app scheduler — Director/Admin's existing
// Appointments tab already shows these with no changes needed, and a
// visitor never gets to see anyone else's name/contact info (this route
// only ever returns booked TIMES, never the bookings themselves).
function failure(stage, error) {
  console.error("[public-appointments-api] failed", { stage, code: error?.code || "unknown", message: error?.message || "unknown" });
  return NextResponse.json({ message: "Unable to complete this request. Please try again." }, { status: 500 });
}

export async function GET(request) {
  try {
    const db = getAdminDb();
    const date = new URL(request.url).searchParams.get("date");
    if (date) return NextResponse.json({ booked: await bookedTimesForDate(db, date) });
    return NextResponse.json({ courses: await bookableCourses(db) });
  } catch (error) {
    return error?.statusCode ? NextResponse.json({ message: error.message }, { status: error.statusCode }) : failure("list", error);
  }
}

export async function POST(request) {
  try {
    const db = getAdminDb();
    const body = await request.json();
    const result = await createAppointment(db, body, { uid: null, manager: false });
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (error) {
    return error?.statusCode ? NextResponse.json({ message: error.message }, { status: error.statusCode }) : failure("create", error);
  }
}
