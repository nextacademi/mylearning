import { FieldValue } from "firebase-admin/firestore";

// Event hours — who worked / attended an event, and for how long.
//
// Each participant doc (academyEvents/{eventId}/participants/{userId}) gets:
//   eventRole      "Volunteer" | "Participant" (what they did at THIS event)
//   hoursCredited  hours counted for this event (0 until marked present)
// and the person's running totals live on their users/{uid} doc:
//   volunteerHours, eventHours, eventsAttended
// so a profile / list can show them without scanning every event.
//
// Every way of marking someone present — QR scan, the manual Present
// button, "Add walk-in" — goes through setEventAttendance(), which applies
// only the DIFFERENCE to the totals. Re-marking, switching role, editing
// hours or marking absent can therefore never double-count.
export const EVENT_ROLES = ["Participant", "Volunteer"];

// Default hours for an event = its scheduled length (startTime → endTime),
// rounded to the nearest quarter hour.
export function eventDurationHours(event) {
  const toMinutes = (hhmm) => {
    const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm || "");
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
  };
  const start = toMinutes(event?.startTime);
  const end = toMinutes(event?.endTime);
  if (start == null || end == null || end <= start) return 0;
  return Math.round(((end - start) / 60) * 4) / 4;
}

const totalField = (role) => (role === "Volunteer" ? "volunteerHours" : "eventHours");
const isRealUser = (id) => !id.startsWith("walkin_");

// status: "present" | "absent" | null. hours: number or undefined (=keep /
// default to the event's length). eventRole: optional new role.
export async function setEventAttendance(db, eventRef, event, participantId, { status, hours, eventRole, markedBy }) {
  const participantRef = eventRef.collection("participants").doc(participantId);
  const userRef = isRealUser(participantId) ? db.collection("users").doc(participantId) : null;

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(participantRef);
    const userSnap = userRef ? await tx.get(userRef) : null;
    if (!snap.exists) throw Object.assign(new Error("Participant not found."), { statusCode: 404 });
    const before = snap.data();

    const wasPresent = before.attendanceStatus === "present";
    const oldRole = EVENT_ROLES.includes(before.eventRole) ? before.eventRole : "Participant";
    const oldHours = wasPresent ? Number(before.hoursCredited) || 0 : 0;

    const nextStatus = status === undefined ? before.attendanceStatus || null : status;
    const nowPresent = nextStatus === "present";
    const newRole = EVENT_ROLES.includes(eventRole) ? eventRole : oldRole;
    let newHours = 0;
    if (nowPresent) {
      const requested = hours === undefined || hours === null || hours === "" ? null : Number(hours);
      if (requested != null && (!Number.isFinite(requested) || requested < 0 || requested > 24)) {
        throw Object.assign(new Error("Hours must be between 0 and 24."), { statusCode: 400 });
      }
      newHours = requested != null ? requested : wasPresent ? oldHours : eventDurationHours(event);
    }

    tx.update(participantRef, {
      attendanceStatus: nextStatus,
      attendanceAt: nowPresent ? (wasPresent ? before.attendanceAt || FieldValue.serverTimestamp() : FieldValue.serverTimestamp()) : null,
      markedBy: nextStatus ? markedBy : null,
      eventRole: newRole,
      hoursCredited: newHours,
    });

    if (userSnap?.exists) {
      const changes = {};
      const add = (field, amount) => { if (amount) changes[field] = (changes[field] || 0) + amount; };
      add(totalField(oldRole), -oldHours);
      add(totalField(newRole), newHours);
      if (wasPresent !== nowPresent) add("eventsAttended", nowPresent ? 1 : -1);
      const update = Object.fromEntries(Object.entries(changes).map(([field, amount]) => [field, FieldValue.increment(amount)]));
      if (Object.keys(update).length) tx.update(userRef, update);
    }
    return { attendanceStatus: nextStatus, eventRole: newRole, hoursCredited: newHours, wasPresent };
  });
}

// Take a removed participant's credited hours back off their totals.
export async function uncreditBeforeRemove(db, eventRef, event, participantId, markedBy) {
  const snap = await eventRef.collection("participants").doc(participantId).get();
  if (snap.exists && snap.data().attendanceStatus === "present") {
    await setEventAttendance(db, eventRef, event, participantId, { status: null, markedBy });
  }
}
