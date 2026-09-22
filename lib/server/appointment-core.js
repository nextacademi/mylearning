import { FieldValue } from "firebase-admin/firestore";
import { ALL_SLOTS, APPOINTMENT_PURPOSES, slotIndex, slotKey } from "../appointments-shared";
const ASSIGNABLE_ROLES = ["Admin", "Director", "Teacher"];

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

// For the Admin panel's Book Appointment form: Type "Student" search-select
// (real registered students) and Assigned Staff dropdown (real Admin/
// Director/Teacher accounts) — manager-only, called from the same GET the
// course list already comes from.
export async function bookableStudents(db) {
  const snapshot = await db.collection("users").where("role", "==", "Student").get();
  return snapshot.docs
    .map(plain)
    .filter((user) => user.active !== false)
    .map((user) => ({ id: user.id, name: user.displayName || user.name || user.email || "Unnamed student", email: user.email || "", phone: user.phone || "" }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export async function assignableStaff(db) {
  const snapshot = await db.collection("users").where("role", "in", ASSIGNABLE_ROLES).get();
  return snapshot.docs
    .map(plain)
    .filter((user) => user.active !== false)
    .map((user) => ({ id: user.id, name: user.displayName || user.name || user.email || "Unnamed staff", role: user.role }))
    .sort((left, right) => left.name.localeCompare(right.name));
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
      purpose: item.purpose || "Consultation",
      type: item.type || (item.bookedBy ? "Student" : "Enquiry"),
      studentId: item.studentId || null,
      assignedTo: item.assignedTo || null,
      assignedToName: item.assignedToName || "",
      notes: item.notes || "",
      status: item.status || "booked",
      bookedBy: item.bookedBy,
      bookedByStaff: Boolean(item.bookedByStaff),
      rescheduledFrom: item.rescheduledFrom || null,
      createdAt: iso(item.createdAt),
    }))
    .sort((left, right) => sortKey(right).localeCompare(sortKey(left)));
}

export async function createAppointment(db, body, actor) {
  const date = assertDate(body.date);
  // A day of slack: the browser disables past dates in the user's own
  // timezone, the server only rejects clearly stale ones.
  if (date < new Date(Date.now() - 86400000).toISOString().slice(0, 10)) throw httpError("Choose a date that hasn't passed.", 400);
  // Self-service bookings (students/public) stay locked to the fixed slot
  // grid. A manager booking on someone's behalf can instead set any exact
  // time (e.g. a walk-in outside the normal grid) — still validated as a
  // real "h:mm AM/PM" string (same format/regex slotMinutes expects), and
  // still uniqueness-locked per exact time via slotKey below.
  const time = typeof body.time === "string" ? body.time.trim() : "";
  const validTimeFormat = /^(0?[1-9]|1[0-2]):[0-5]\d (AM|PM)$/.test(time);
  if (actor.manager ? !validTimeFormat : !ALL_SLOTS.includes(time)) {
    throw httpError(actor.manager ? "Enter a valid time, e.g. 3:15 PM." : "Choose a valid time slot.", 400);
  }

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

  const purpose = APPOINTMENT_PURPOSES.includes(body.purpose) ? body.purpose : "Consultation";
  const notes = trim(body.notes, 2000);

  // Type/studentId: self-service bookings are always "for" the signed-in
  // account (or an anonymous public enquiry) — never client-chosen. Only a
  // manager booking on someone's behalf picks Student vs Enquiry.
  let type = "Enquiry";
  let studentId = null;
  if (actor.manager) {
    if (body.type === "Student") {
      studentId = trim(body.studentId, 200);
      if (!studentId || studentId.includes("/")) throw httpError("Choose a student.", 400);
      const studentSnap = await db.collection("users").doc(studentId).get();
      if (!studentSnap.exists || studentSnap.data().role !== "Student") throw httpError("Choose a valid student.", 400);
      type = "Student";
    }
  } else if (actor.uid) {
    type = "Student";
    studentId = actor.uid;
  }

  // Assigned staff — manager-only, must be a real Admin/Director/Teacher.
  let assignedTo = null;
  let assignedToName = "";
  if (actor.manager && trim(body.assignedTo, 200)) {
    const staffId = trim(body.assignedTo, 200);
    const staffSnap = await db.collection("users").doc(staffId).get();
    if (!staffSnap.exists || !ASSIGNABLE_ROLES.includes(staffSnap.data().role)) throw httpError("Choose a valid staff member.", 400);
    assignedTo = staffId;
    assignedToName = (staffSnap.data().displayName || staffSnap.data().name || "").slice(0, 200);
  }

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
      purpose,
      type,
      studentId,
      assignedTo,
      assignedToName,
      notes,
      status: "booked",
      bookedBy: actor.uid,
      bookedByStaff: Boolean(actor.manager),
      createdAt: now,
      updatedAt: now,
    });
  });

  // Fire-and-forget: never let a notification failure fail the booking
  // itself. Every Admin/Director gets pinged the same way enrollment/
  // payment events already notify a single student.
  notifyManagers(db, { name, date, time, courseTitle, appointmentId: ref.id }).catch((error) => {
    console.error("[appointments] failed to notify managers", { appointmentId: ref.id, code: error?.code || "unknown" });
  });

  return { id: ref.id, date, time };
}

async function notifyManagers(db, { name, date, time, courseTitle, appointmentId }) {
  const snapshot = await db.collection("users").where("role", "in", ["Admin", "Director"]).get();
  if (snapshot.empty) return;
  const now = FieldValue.serverTimestamp();
  const batch = db.batch();
  snapshot.docs.forEach((userDoc) => {
    batch.set(db.collection("notifications").doc(), {
      userId: userDoc.id,
      type: "appointment",
      title: "New appointment booked",
      body: `${name} booked ${date} at ${time} for ${courseTitle}.`,
      entityId: appointmentId,
      actionUrl: null,
      readAt: null,
      createdAt: now,
    });
  });
  await batch.commit();
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

// Admin-panel-only action — marking a past consultation as done is an
// operational/staff call, not something a self-service booker does.
export async function markAppointmentCompleted(db, id, actor) {
  if (!actor.manager) throw httpError("Only Admin/Director can mark an appointment as completed.", 403);
  if (typeof id !== "string" || !id || id.includes("/")) throw httpError("Appointment ID is required.", 400);
  const ref = db.collection("appointments").doc(id);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw httpError("Appointment not found.", 404);
  const appointment = snapshot.data();
  if (appointment.status === "cancelled") throw httpError("A cancelled appointment can't be marked completed.", 400);
  if (appointment.status === "completed") return { ok: true };
  const now = FieldValue.serverTimestamp();
  await ref.update({ status: "completed", completedBy: actor.uid, completedAt: now, updatedAt: now });
  return { ok: true };
}

// Reschedule = atomically free the old slot and claim the new one — the
// doc id IS the slot (date_time), so this can't be a plain field update.
// Admin-panel-only, matching the reference design's action list.
export async function rescheduleAppointment(db, id, body, actor) {
  if (!actor.manager) throw httpError("Only Admin/Director can reschedule an appointment.", 403);
  if (typeof id !== "string" || !id || id.includes("/")) throw httpError("Appointment ID is required.", 400);
  const date = assertDate(body.date);
  const time = typeof body.time === "string" ? body.time.trim() : "";
  const validTimeFormat = /^(0?[1-9]|1[0-2]):[0-5]\d (AM|PM)$/.test(time);
  if (!validTimeFormat) throw httpError("Enter a valid time, e.g. 3:15 PM.", 400);

  const oldRef = db.collection("appointments").doc(id);
  const newRef = db.collection("appointments").doc(slotKey(date, time));

  const result = await db.runTransaction(async (transaction) => {
    const oldSnap = await transaction.get(oldRef);
    if (!oldSnap.exists) throw httpError("Appointment not found.", 404);
    const appointment = oldSnap.data();
    if (appointment.status !== "booked") throw httpError("Only an upcoming appointment can be rescheduled.", 400);

    if (newRef.id !== oldRef.id) {
      const newSnap = await transaction.get(newRef);
      if (newSnap.exists && newSnap.data().status !== "cancelled") {
        throw httpError("That time slot was just booked. Please choose another.", 409);
      }
    }

    const now = FieldValue.serverTimestamp();
    const { rescheduledFrom: _prevReschedule, createdAt, ...rest } = appointment;
    transaction.set(newRef, {
      ...rest,
      date,
      time,
      status: "booked",
      rescheduledFrom: { date: appointment.date, time: appointment.time },
      createdAt: createdAt || now,
      updatedAt: now,
    });
    if (newRef.id !== oldRef.id) transaction.delete(oldRef);
    return { id: newRef.id, date, time };
  });

  return result;
}
