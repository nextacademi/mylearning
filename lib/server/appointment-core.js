import { FieldValue } from "firebase-admin/firestore";
import { ALL_SLOTS, slotIndex, slotKey } from "../appointments-shared";

// Consultation appointments live in their own `appointments` collection.
// Every read/write goes through /api/appointments (Admin SDK), so
// firestore.rules needs no block for it — the catch-all deny already keeps
// the collection closed to direct client access, and a student can never
// read anyone else's booking (only booked TIMES are ever exposed).
const BOOKABLE_STATUSES = ["Upcoming", "Active"];
const plain = (snapshot) => ({ id: snapshot.id, ...snapshot.data() });
const iso = (value) => (value?.toDate ? value.toDate().toISOString() : null);
const sortKey = (item) => `${item.date}_${String(slotIndex(item.time)).padStart(2, "0")}`;

function httpError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

function assertDate(value) {
  const parsed = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : null;
  // Round-trip catches impossible dates like 2026-02-31 that Date rolls over.
  if (!parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw httpError("Choose a valid date.", 400);
  }
  return value;
}

// Trainings a consultation can be about — only ones still open to join.
export async function bookableCourses(db) {
  const snapshot = await db.collection("courses").where("status", "in", BOOKABLE_STATUSES).get();
  return snapshot.docs
    .map(plain)
    .map((course) => ({ id: course.id, title: course.title || course.name || "Untitled course" }))
    .sort((left, right) => left.title.localeCompare(right.title));
}

// Times already taken on a date — no names/contact details, so any signed-in
// user can safely see which slots are unavailable.
export async function bookedTimesForDate(db, date) {
  assertDate(date);
  const snapshot = await db.collection("appointments").where("date", "==", date).get();
  return snapshot.docs.map((doc) => doc.data()).filter((item) => item.status !== "cancelled").map((item) => item.time);
}

// Director/Admin see everything; everyone else only bookings they made.
export async function listAppointments(db, { uid, manager }) {
  const ref = db.collection("appointments");
  const snapshot = manager ? await ref.get() : await ref.where("bookedBy", "==", uid).get();
  return snapshot.docs
    .map(plain)
    .map((item) => ({
      id: item.id,
      date: item.date,
      time: item.time,
      name: item.name,
      phone: item.phone,
      email: item.email,
      courseId: item.courseId,
      courseTitle: item.courseTitle,
      status: item.status || "booked",
      bookedBy: item.bookedBy,
      createdAt: iso(item.createdAt),
    }))
    .sort((left, right) => sortKey(right).localeCompare(sortKey(left)));
}

export async function createAppointment(db, body, actor) {
  const date = assertDate(body.date);
  // A day of slack: the browser disables past dates in the user's own
  // timezone, the server only rejects clearly stale ones.
  if (date < new Date(Date.now() - 86400000).toISOString().slice(0, 10)) throw httpError("Choose a date that hasn't passed.", 400);
  const time = typeof body.time === "string" ? body.time : "";
  if (!ALL_SLOTS.includes(time)) throw httpError("Choose a valid time slot.", 400);

  const trim = (value, max) => (typeof value === "string" ? value.trim().slice(0, max) : "");
  const name = trim(body.name, 120);
  if (!name) throw httpError("Student name is required.", 400);
  const phone = trim(body.phone, 30);
  if (!/^[0-9+()\-\s]{6,30}$/.test(phone)) throw httpError("Enter a valid phone number.", 400);
  const email = trim(body.email, 160);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw httpError("Enter a valid email address.", 400);
  const courseId = trim(body.courseId, 200);
  if (!courseId || courseId.includes("/")) throw httpError("Choose a course.", 400);

  // Course title comes from the course doc, never from the request body.
  const courseSnap = await db.collection("courses").doc(courseId).get();
  if (!courseSnap.exists || !BOOKABLE_STATUSES.includes(courseSnap.data().status)) throw httpError("Choose an available course.", 400);
  const courseTitle = courseSnap.data().title || courseSnap.data().name || "Untitled course";

  const ref = db.collection("appointments").doc(slotKey(date, time));
  await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(ref);
    // A cancelled booking frees its slot — set() below overwrites it.
    if (existing.exists && existing.data().status !== "cancelled") {
      throw httpError("That time slot was just booked. Please choose another.", 409);
    }
    const now = FieldValue.serverTimestamp();
    transaction.set(ref, {
      date,
      time,
      name,
      phone,
      email,
      courseId,
      courseTitle,
      status: "booked",
      bookedBy: actor.uid,
      bookedByStaff: Boolean(actor.manager),
      createdAt: now,
      updatedAt: now,
    });
  });
  return { id: ref.id, date, time };
}

export async function cancelAppointment(db, id, actor) {
  if (typeof id !== "string" || !id || id.includes("/")) throw httpError("Appointment ID is required.", 400);
  const ref = db.collection("appointments").doc(id);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw httpError("Appointment not found.", 404);
  const appointment = snapshot.data();
  if (!actor.manager && appointment.bookedBy !== actor.uid) throw httpError("You can only cancel your own appointments.", 403);
  if (appointment.status === "cancelled") return { ok: true };
  const now = FieldValue.serverTimestamp();
  await ref.update({ status: "cancelled", cancelledBy: actor.uid, cancelledAt: now, updatedAt: now });
  return { ok: true };
}
