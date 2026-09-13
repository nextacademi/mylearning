import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "../../../../../../lib/firebase-admin";
import { getCachedUserSnapshot } from "../../../../../../lib/server/cached-profile";

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
    return NextResponse.json({
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
      })),
      canManageParticipants: a.isManager,
    });
  } catch (error) {
    return failure("list", error);
  }
}

// Admin/Director manually adds a participant (Student, Teacher, or Staff)
// who did not self-register — e.g. a walk-in or a staff member helping run
// the event.
export async function POST(request, { params }) {
  try {
    const { eventId } = await params;
    const a = await access(request, eventId);
    if (a.denied) return a.denied;
    if (!a.isManager) return NextResponse.json({ message: "Administrator or Director access is required." }, { status: 403 });

    const body = await request.json();
    const userId = typeof body.userId === "string" ? body.userId : "";
    if (!userId) return NextResponse.json({ message: "Choose a person to add." }, { status: 400 });

    const userSnapshot = await a.db.collection("users").doc(userId).get();
    if (!userSnapshot.exists) return NextResponse.json({ message: "User not found." }, { status: 404 });
    const user = userSnapshot.data();

    const participantRef = a.eventRef.collection("participants").doc(userId);
    const existing = await participantRef.get();
    if (existing.exists) return NextResponse.json({ message: "This person is already a participant." }, { status: 409 });

    if (a.event.maxParticipants != null) {
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
      source: "manual",
      addedBy: a.uid,
    });
    batch.update(a.eventRef, { participantCount: FieldValue.increment(1) });
    await batch.commit();
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

    const body = await request.json();
    const userId = typeof body.userId === "string" ? body.userId : "";
    const attendanceStatus = body.attendanceStatus === null ? null : body.attendanceStatus;
    if (!userId) return NextResponse.json({ message: "Participant ID is required." }, { status: 400 });
    if (attendanceStatus !== null && !attendanceStatuses.has(attendanceStatus)) {
      return NextResponse.json({ message: "Choose a valid attendance status." }, { status: 400 });
    }
    const participantRef = a.eventRef.collection("participants").doc(userId);
    const snapshot = await participantRef.get();
    if (!snapshot.exists) return NextResponse.json({ message: "Participant not found." }, { status: 404 });

    await participantRef.update({
      attendanceStatus,
      attendanceAt: attendanceStatus ? FieldValue.serverTimestamp() : null,
      markedBy: attendanceStatus ? a.uid : null,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
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
    const batch = a.db.batch();
    batch.delete(participantRef);
    batch.update(a.eventRef, { participantCount: FieldValue.increment(-1) });
    await batch.commit();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failure("remove", error);
  }
}
