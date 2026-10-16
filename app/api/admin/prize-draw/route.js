import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "../../../../lib/firebase-admin";
import { getCachedUserSnapshot } from "../../../../lib/server/cached-profile";
import { LEARNER_ROLES } from "../../../../lib/learner-roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const managers = new Set(["Admin", "Director"]);
// Never part of a student lucky draw, even when registered for an event.
const STAFF_ROLES = new Set(["Admin", "Director", "Teacher", "Facilitator"]);

function failure(stage, error) {
  console.error("[prize-draw-api] request failed", { stage, code: error?.code || "unknown", message: error?.message || "unknown" });
  return NextResponse.json({ message: "Unable to complete this request. Please try again." }, { status: 500 });
}

async function requireManager(request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { denied: NextResponse.json({ message: "Sign in to continue." }, { status: 401 }) };
  const db = getAdminDb();
  const decoded = await getAdminAuth().verifyIdToken(token);
  const profile = await getCachedUserSnapshot(db, decoded.uid);
  const data = profile.data() || {};
  if (!profile.exists || data.active === false || !managers.has(data.role)) {
    return { denied: NextResponse.json({ message: "Administrator or Director access is required." }, { status: 403 }) };
  }
  return { db };
}

const member = (id, data) => ({
  id,
  name: (data.displayName || data.name || "").trim() || (data.email ? data.email.split("@")[0] : "Student"),
  email: data.email || "",
});

// Events and trainings an admin can pick as the draw pool, newest first.
async function listSources(db) {
  const [eventsSnap, coursesSnap, participantsSnap, enrollmentsSnap] = await Promise.all([
    db.collection("academyEvents").get(),
    db.collection("courses").get(),
    db.collectionGroup("participants").get(),
    db.collection("enrollments").get(),
  ]);
  const participantCounts = new Map();
  participantsSnap.docs.forEach((doc) => {
    const eventId = doc.ref.parent.parent?.id;
    if (eventId) participantCounts.set(eventId, (participantCounts.get(eventId) || 0) + 1);
  });
  const enrolledCounts = new Map();
  enrollmentsSnap.docs.forEach((doc) => {
    const data = doc.data();
    if (data.status !== "withdrawn" && data.courseId) enrolledCounts.set(data.courseId, (enrolledCounts.get(data.courseId) || 0) + 1);
  });
  const events = eventsSnap.docs
    .map((doc) => ({ id: doc.id, label: doc.data().name || "(untitled event)", date: doc.data().eventDate || "", count: participantCounts.get(doc.id) || 0 }))
    .sort((a, b) => b.date.localeCompare(a.date));
  const trainings = coursesSnap.docs
    .map((doc) => {
      const data = doc.data();
      const title = data.title || data.name || "(untitled training)";
      return { id: doc.id, label: data.batchName ? `${title} · ${data.batchName}` : title, date: typeof data.startDate === "string" ? data.startDate : "", count: enrolledCounts.get(doc.id) || 0 };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
  return { events, trainings };
}

async function allStudents(db) {
  const snapshot = await db.collection("users").where("role", "in", LEARNER_ROLES).get();
  return snapshot.docs.filter((doc) => doc.data().active !== false).map((doc) => member(doc.id, doc.data()));
}

// Registered event participants (walk-ins included), minus staff and event
// volunteers; optionally only those checked in as present.
async function eventParticipants(db, eventId, presentOnly) {
  const snapshot = await db.collection("academyEvents").doc(eventId).collection("participants").get();
  return snapshot.docs
    .filter((doc) => {
      const data = doc.data();
      if (STAFF_ROLES.has(data.role)) return false;
      if (data.eventRole && data.eventRole !== "Participant") return false;
      return !presentOnly || data.attendanceStatus === "present";
    })
    .map((doc) => member(doc.id, doc.data()));
}

async function trainingStudents(db, courseId) {
  const snapshot = await db.collection("enrollments").where("courseId", "==", courseId).get();
  const ids = [...new Set(snapshot.docs.map((doc) => doc.data()).filter((data) => data.status !== "withdrawn" && data.studentId).map((data) => data.studentId))];
  if (!ids.length) return [];
  const users = await db.getAll(...ids.map((id) => db.collection("users").doc(id)));
  return users.filter((doc) => doc.exists && doc.data().active !== false).map((doc) => member(doc.id, doc.data()));
}

// GET                                   → { events, trainings, studentCount }
// GET ?pool=all                         → { members } every active student
// GET ?pool=event&id=…[&present=1]      → { members } that event's participants
// GET ?pool=training&id=…               → { members } that training's enrolled students
export async function GET(request) {
  let stage = "auth";
  try {
    const access = await requireManager(request);
    if (access.denied) return access.denied;
    const params = new URL(request.url).searchParams;
    const pool = params.get("pool");
    const id = params.get("id") || "";
    stage = pool || "sources";

    if (!pool) {
      const [sources, students] = await Promise.all([listSources(access.db), allStudents(access.db)]);
      return NextResponse.json({ ...sources, studentCount: students.length });
    }
    if ((pool === "event" || pool === "training") && (!id || id.includes("/"))) {
      return NextResponse.json({ message: "Choose an event or training." }, { status: 400 });
    }
    const members = pool === "all"
      ? await allStudents(access.db)
      : pool === "event"
        ? await eventParticipants(access.db, id, params.get("present") === "1")
        : pool === "training"
          ? await trainingStudents(access.db, id)
          : null;
    if (!members) return NextResponse.json({ message: "Unknown draw pool." }, { status: 400 });
    return NextResponse.json({ members: members.sort((a, b) => a.name.localeCompare(b.name)) });
  } catch (error) {
    return failure(stage, error);
  }
}
