import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "../../../../../../lib/firebase-admin";
import { getCachedUserSnapshot } from "../../../../../../lib/server/cached-profile";
import { EVENT_ROLES, eventDurationHours, setEventAttendance, uncreditBeforeRemove } from "../../../../../../lib/server/event-hours";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const managers = new Set(["Admin", "Director"]);
const attendanceStatuses = new Set(["present", "absent"]);
const plain = (snapshot) => ({ id: snapshot.id, ...snapshot.data() });
const isoDate = (value) => (value?.toDate ? value.toDate().toISOString() : typeof value === "string" ? value : null);

function failure(stage, error) {
  console.error("[event-participants-api] failed", { stage, code: error?.code || "unknown", message: error?.message || "unknown" });
  return NextResponse.json({ message: "Unable to complete this request. Please try again." }, { status: 500 });
}

// Admin/Director may manage any event's participants/attendance. A Teacher
// may only manage attendance for an event where they are explicitly set as
// the organizer (organizerId) — a deliberate, minimum-privilege scope since
// there is no per-event ownership concept for events the way there is for
// classes/courses.
async function access(request, eventId) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { denied: NextResponse.json({ message: "Sign in to continue." }, { status: 401 }) };
  const db = getAdminDb();
  const decoded = await getAdminAuth().verifyIdToken(token);
  const profile = await getCachedUserSnapshot(db, decoded.uid);
  const data = profile.data() || {};
  if (!profile.exists || data.active === false) {
    return { denied: NextResponse.json({ message: "Account access is required." }, { status: 403 }) };
  }
  const eventSnapshot = await db.collection("academyEvents").doc(eventId).get();
  if (!eventSnapshot.exists) return { denied: NextResponse.json({ message: "Event not found." }, { status: 404 }) };
  const event = plain(eventSnapshot);
  const isManager = managers.has(data.role);
  const isOrganizerTeacher = data.role === "Teacher" && event.organizerId === decoded.uid;
  if (!isManager && !isOrganizerTeacher) {
    return { denied: NextResponse.json({ message: "You do not have access to this event's participants." }, { status: 403 }) };
  }
  return { db, uid: decoded.uid, isManager, event, eventRef: eventSnapshot.ref };
}

export async function GET(request, { params }) {
  try {
    const { eventId } = await params;
    const a = await access(request, eventId);
    if (a.denied) return a.denied;
    const snapshot = await a.eventRef.collection("participants").get();
    const rows = snapshot.docs.map(plain).sort((left, right) => (left.displayName || "").localeCompare(right.displayName || ""));
    // Each real user's running totals across ALL events (lib/server/event-hours.js).
    const userIds = rows.map((row) => row.id).filter((id) => !id.startsWith("walkin_"));
    const userDocs = userIds.length ? await a.db.getAll(...userIds.map((id) => a.db.collection("users").doc(id))) : [];
    const totals = new Map(userDocs.filter((d) => d.exists).map((d) => [d.id, {
      volunteerHours: Number(d.data().volunteerHours) || 0,
      eventHours: Number(d.data().eventHours) || 0,
      eventsAttended: Number(d.data().eventsAttended) || 0,
    }]));
    return NextResponse.json({
      defaultHours: eventDurationHours(a.event),
      participants: rows.map((row) => ({
        userId: row.id,
        displayName: row.displayName || "",
        email: row.email || "",
        phone: row.phone || "",
        role: row.role || "",
        registeredAt: isoDate(row.registeredAt),
        attendanceStatus: row.attendanceStatus || null,
        attendanceAt: isoDate(row.attendanceAt),
        source: row.source || "self",
        eventRole: EVENT_ROLES.includes(row.eventRole) ? row.eventRole : "Participant",
        hoursCredited: Number(row.hoursCredited) || 0,
        totals: totals.get(row.id) || null,
      })),
      canManageParticipants: a.isManager,
    });
  } catch (error) {
    return failure("list", error);
  }
}

// Admin/Director manually adds a participant (Student, Teacher, or Staff)
// who did not self-register — e.g. a walk-in or a staff member helping run
// the event. "Add walk-in" also marks them present straight away
// (markPresent) so their hours are credited. A walk-in with no account is
// added by name/email/phone (doc id walkin_...); their hours are recorded on
// the event but there is no profile to total them on.
export async function POST(request, { params }) {
  try {
    const { eventId } = await params;
    const a = await access(request, eventId);
    if (a.denied) return a.denied;
    if (!a.isManager) return NextResponse.json({ message: "Administrator or Director access is required." }, { status: 403 });

    const body = await request.json();
    let userId = typeof body.userId === "string" ? body.userId : "";
    const markPresent = body.markPresent === true;
    const eventRole = EVENT_ROLES.includes(body.eventRole) ? body.eventRole : "Participant";
    let user;
    if (userId) {
      const userSnapshot = await a.db.collection("users").doc(userId).get();
      if (!userSnapshot.exists) return NextResponse.json({ message: "User not found." }, { status: 404 });
      user = userSnapshot.data();
    } else {
      const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
      if (!name) return NextResponse.json({ message: "Choose a person, or enter the walk-in's name." }, { status: 400 });
      user = {
        displayName: name,
        email: typeof body.email === "string" ? body.email.trim().slice(0, 200) : "",
        phone: typeof body.phone === "string" ? body.phone.trim().slice(0, 40) : "",
        role: "Guest",
      };
      userId = `walkin_${a.eventRef.collection("participants").doc().id}`;
    }

    const participantRef = a.eventRef.collection("participants").doc(userId);
    const existing = await participantRef.get();
    if (existing.exists && !markPresent) return NextResponse.json({ message: "This person is already a participant." }, { status: 409 });
    if (existing.exists) {
      // Already registered: "Add walk-in" just marks them present.
      const result = await setEventAttendance(a.db, a.eventRef, a.event, userId, { status: "present", hours: body.hours, eventRole, markedBy: a.uid });
      return NextResponse.json({ ok: true, ...result });
    }

    // Capacity applies to sign-ups; someone physically there (a walk-in) is
    // always recorded.
    if (!markPresent && a.event.maxParticipants != null) {
      const countSnapshot = await a.eventRef.collection("participants").count().get();
      if (countSnapshot.data().count >= a.event.maxParticipants) {
        return NextResponse.json({ message: "Event Full — maximum participants reached." }, { status: 409 });
      }
    }

    const batch = a.db.batch();
    batch.set(participantRef, {
      displayName: user.displayName || "",
      email: user.email || "",
      phone: user.phone || "",
      role: user.role || "",
      registeredAt: FieldValue.serverTimestamp(),
      attendanceStatus: null,
      attendanceAt: null,
      source: markPresent ? "walk-in" : "manual",
      eventRole,
      hoursCredited: 0,
      addedBy: a.uid,
    });
    batch.update(a.eventRef, { participantCount: FieldValue.increment(1) });
    await batch.commit();
    if (markPresent) {
      const result = await setEventAttendance(a.db, a.eventRef, a.event, userId, { status: "present", hours: body.hours, eventRole, markedBy: a.uid });
      return NextResponse.json({ ok: true, ...result }, { status: 201 });
    }
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    return failure("add", error);
  }
}

// Mark attendance manually. Admin/Director may mark anyone; an
// organizer-Teacher is scoped to events they organize (checked in access()).
export async function PATCH(request, { params }) {
  try {
    const { eventId } = await params;
    const a = await access(request, eventId);
    if (a.denied) return a.denied;

    // Any of: attendanceStatus ("present" | "absent" | null), eventRole,
    // hours; omitted fields stay as they are. Hours/totals are handled by
    // setEventAttendance so they never double-count.
    const body = await request.json();
    const userId = typeof body.userId === "string" ? body.userId : "";
    if (!userId) return NextResponse.json({ message: "Participant ID is required." }, { status: 400 });
    const hasStatus = Object.prototype.hasOwnProperty.call(body, "attendanceStatus");
    const attendanceStatus = hasStatus ? (body.attendanceStatus === null ? null : body.attendanceStatus) : undefined;
    if (hasStatus && attendanceStatus !== null && !attendanceStatuses.has(attendanceStatus)) {
      return NextResponse.json({ message: "Choose a valid attendance status." }, { status: 400 });
    }
    if (body.eventRole !== undefined && !EVENT_ROLES.includes(body.eventRole)) {
      return NextResponse.json({ message: "Choose Participant or Volunteer." }, { status: 400 });
    }
    const result = await setEventAttendance(a.db, a.eventRef, a.event, userId, {
      status: attendanceStatus,
      hours: body.hours,
      eventRole: body.eventRole,
      markedBy: a.uid,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error.statusCode) return NextResponse.json({ message: error.message }, { status: error.statusCode });
    return failure("mark-attendance", error);
  }
}

export async function DELETE(request, { params }) {
  try {
    const { eventId } = await params;
    const a = await access(request, eventId);
    if (a.denied) return a.denied;
    if (!a.isManager) return NextResponse.json({ message: "Administrator or Director access is required." }, { status: 403 });

    const userId = new URL(request.url).searchParams.get("userId");
    if (!userId) return NextResponse.json({ message: "Participant ID is required." }, { status: 400 });
    const participantRef = a.eventRef.collection("participants").doc(userId);
    const snapshot = await participantRef.get();
    if (!snapshot.exists) return NextResponse.json({ message: "Participant not found." }, { status: 404 });
    await uncreditBeforeRemove(a.db, a.eventRef, a.event, userId, a.uid);
    const batch = a.db.batch();
    batch.delete(participantRef);
    batch.update(a.eventRef, { participantCount: FieldValue.increment(-1) });
    await batch.commit();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failure("remove", error);
  }
}
