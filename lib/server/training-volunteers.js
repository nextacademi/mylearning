import { FieldValue } from "firebase-admin/firestore";
import { singaporeDate } from "./singapore-date";
import { eventDurationHours } from "./event-hours";

// Volunteers at a TRAINING (a course) — who helped run a class on a given
// day, and for how long. Events have their own participants list; trainings
// don't, so this is its own small collection:
//   trainingVolunteers/{courseId}_{personId}_{date}
//     { courseId, date, userId ("" for a guest), displayName, email, phone,
//       hours, source: "scan" | "manual", markedBy, markedAt }
// A member's hours are added to the same users/{uid}.volunteerHours total
// that event volunteering uses, so the Volunteer panels and leader console
// count both. Every write applies only the DIFFERENCE, so editing hours or
// removing someone never double-counts.

const httpError = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const iso = (value) => (value?.toDate ? value.toDate().toISOString() : null);

export const trainingDefaultHours = (course) => eventDurationHours(course) || 2;

export async function listTrainingVolunteers(db, courseId, date) {
  let query = db.collection("trainingVolunteers").where("courseId", "==", courseId);
  if (date) query = query.where("date", "==", date);
  const snapshot = await query.get();
  return snapshot.docs
    .map((d) => ({ id: d.id, ...d.data(), markedAt: iso(d.data().markedAt) }))
    .sort((a, b) => (b.date || "").localeCompare(a.date || "") || (a.displayName || "").localeCompare(b.displayName || ""));
}

// Add / check in a volunteer for one day. `person` is { userId } for a
// member or { name, email, phone } for a guest. Checking in the same member
// twice on the same day just updates their hours.
export async function addTrainingVolunteer(db, course, { date, person, hours, source, markedBy }) {
  const day = ISO_DATE.test(date || "") ? date : singaporeDate();
  const requested = hours === undefined || hours === null || hours === "" ? null : Number(hours);
  if (requested != null && (!Number.isFinite(requested) || requested < 0 || requested > 24)) throw httpError("Hours must be between 0 and 24.");
  const credit = requested != null ? requested : trainingDefaultHours(course);

  let userId = "";
  let details;
  if (person.userId) {
    const userSnap = await db.collection("users").doc(person.userId).get();
    if (!userSnap.exists) throw httpError("User not found.", 404);
    const user = userSnap.data();
    userId = person.userId;
    details = { displayName: user.displayName || user.email || "", email: user.email || "", phone: user.phone || "" };
  } else {
    const name = String(person.name || "").trim().slice(0, 120);
    if (!name) throw httpError("Choose a member, or enter the volunteer's name.");
    details = { displayName: name, email: String(person.email || "").trim().slice(0, 200), phone: String(person.phone || "").trim().slice(0, 40) };
  }
  const personKey = userId || `guest_${db.collection("trainingVolunteers").doc().id}`;
  const ref = db.collection("trainingVolunteers").doc(`${course.id}_${personKey}_${day}`);

  return db.runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    const before = existing.exists ? Number(existing.data().hours) || 0 : 0;
    tx.set(ref, {
      courseId: course.id,
      date: day,
      userId,
      ...details,
      hours: credit,
      source: source || "manual",
      markedBy,
      markedAt: FieldValue.serverTimestamp(),
    });
    if (userId && credit !== before) tx.update(db.collection("users").doc(userId), { volunteerHours: FieldValue.increment(credit - before) });
    return { id: ref.id, already: existing.exists, hours: credit, displayName: details.displayName, date: day };
  });
}

export async function updateTrainingVolunteerHours(db, id, hours) {
  const value = Number(hours);
  if (!Number.isFinite(value) || value < 0 || value > 24) throw httpError("Hours must be between 0 and 24.");
  const ref = db.collection("trainingVolunteers").doc(id);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw httpError("Volunteer record not found.", 404);
    const { userId, hours: before } = snap.data();
    tx.update(ref, { hours: value });
    if (userId && value !== (Number(before) || 0)) tx.update(db.collection("users").doc(userId), { volunteerHours: FieldValue.increment(value - (Number(before) || 0)) });
    return { hours: value };
  });
}

export async function removeTrainingVolunteer(db, id) {
  const ref = db.collection("trainingVolunteers").doc(id);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw httpError("Volunteer record not found.", 404);
    const { userId, hours } = snap.data();
    tx.delete(ref);
    if (userId && Number(hours)) tx.update(db.collection("users").doc(userId), { volunteerHours: FieldValue.increment(-Number(hours)) });
    return { ok: true };
  });
}
