import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "../../../../lib/firebase-admin";
import { getCachedUserSnapshot } from "../../../../lib/server/cached-profile";
import { computeEventStatus, validateEventFields } from "../../../../lib/events-shared";
import { broadcastEmail } from "../../../../lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const managers = new Set(["Admin", "Director"]);
const plain = (snapshot) => ({ id: snapshot.id, ...snapshot.data() });
const isoDate = (value) => (value?.toDate ? value.toDate().toISOString() : typeof value === "string" ? value : null);

function failure(stage, error) {
  console.error("[events-api] request failed", { stage, code: error?.code || "unknown", message: error?.message || "unknown" });
  return NextResponse.json({ message: "Unable to complete this request. Please try again." }, { status: 500 });
}

async function requireManager(request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { denied: NextResponse.json({ message: "Sign in to continue." }, { status: 401 }) };
  const auth = getAdminAuth();
  const db = getAdminDb();
  const decoded = await auth.verifyIdToken(token);
  const profile = await getCachedUserSnapshot(db, decoded.uid);
  const data = profile.data() || {};
  if (!profile.exists || data.active === false || !managers.has(data.role)) {
    return { denied: NextResponse.json({ message: "Administrator or Director access is required." }, { status: 403 }) };
  }
  return { auth, db, uid: decoded.uid };
}

function eventRow(event, participantRows) {
  const own = participantRows.filter((item) => item.eventId === event.id);
  return {
    id: event.id,
    name: event.name || "",
    type: event.type || "",
    description: event.description || "",
    eventDate: event.eventDate || "",
    startTime: event.startTime || "",
    endTime: event.endTime || "",
    location: event.location || "",
    organizer: event.organizer || "",
    organizerId: event.organizerId || "",
    maxParticipants: event.maxParticipants ?? null,
    targetAudience: Array.isArray(event.targetAudience) ? event.targetAudience : [],
    bannerUrl: event.bannerUrl || "",
    bannerPath: event.bannerPath || "",
    registrationRequired: Boolean(event.registrationRequired),
    registrationDeadline: event.registrationDeadline || "",
    status: event.status || "",
    computedStatus: computeEventStatus(event),
    published: Boolean(event.published),
    participantCount: own.length,
    presentCount: own.filter((item) => item.attendanceStatus === "present").length,
    createdBy: event.createdBy || "",
    createdAt: isoDate(event.createdAt),
    updatedAt: isoDate(event.updatedAt),
  };
}

function buildStats(rows) {
  const stats = { total: rows.length, upcoming: 0, ongoing: 0, completed: 0, cancelled: 0, totalParticipants: 0 };
  const byMonth = new Map();
  const byType = new Map();
  rows.forEach((row) => {
    if (row.computedStatus === "Upcoming") stats.upcoming += 1;
    else if (row.computedStatus === "Ongoing") stats.ongoing += 1;
    else if (row.computedStatus === "Completed") stats.completed += 1;
    else if (row.computedStatus === "Cancelled") stats.cancelled += 1;
    stats.totalParticipants += row.participantCount;
    const month = (row.eventDate || "").slice(0, 7);
    if (month) byMonth.set(month, (byMonth.get(month) || 0) + 1);
    if (row.type) byType.set(row.type, (byType.get(row.type) || 0) + 1);
  });
  return {
    ...stats,
    byMonth: [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, count]) => ({ month, count })),
    byType: [...byType.entries()].map(([type, count]) => ({ type, count })),
  };
}

// Notifies every active user in-app and by email when a new event is
// published — chunked batch writes (Firestore's 500-write limit) plus
// broadcastEmail's own bcc-chunking (lib/email.js) so this scales past a
// few dozen users without any per-user round trip beyond the one query.
async function announceNewEvent(db, eventId, fields) {
  // Filtered in memory, not with a Firestore `!=` query — that operator
  // only matches documents that HAVE the field set, silently excluding
  // every account (many Teacher/Admin/Director profiles) that has no
  // `active` field at all, the same reason every other list in this app
  // checks `active !== false` after a plain `.get()` instead.
  const usersSnapshot = await db.collection("users").get();
  const users = usersSnapshot.docs.map(plain).filter((user) => user.active !== false);
  const when = `${fields.eventDate}${fields.startTime ? ` at ${fields.startTime}` : ""}`;
  const body = `${fields.name} is happening on ${when}${fields.location ? ` at ${fields.location}` : ""}.`;

  const docs = users.map((user) => ({
    ref: db.collection("notifications").doc(),
    data: {
      userId: user.id,
      type: "event.created",
      title: "New event announced",
      body,
      entityId: eventId,
      actionUrl: null,
      readAt: null,
      createdAt: FieldValue.serverTimestamp(),
    },
  }));
  for (let i = 0; i < docs.length; i += 400) {
    const batch = db.batch();
    docs.slice(i, i + 400).forEach((item) => batch.set(item.ref, item.data));
    await batch.commit();
  }

  await broadcastEmail(users.map((user) => user.email), {
    subject: `New Event: ${fields.name}`,
    text: `A new event has been announced at Next Academy.\n\n${fields.name}\n${when}${fields.location ? `\nLocation: ${fields.location}` : ""}\n\n${fields.description || ""}\n\nSign in to Next Academy for details${fields.registrationRequired ? " and to register" : ""}.`,
  });
}

export async function GET(request) {
  try {
    const access = await requireManager(request);
    if (access.denied) return access.denied;
    const { db } = access;
    const [eventsSnapshot, participantGroups] = await Promise.all([
      db.collection("academyEvents").get(),
      db.collectionGroup("participants").get(),
    ]);
    const events = eventsSnapshot.docs.map(plain);
    // collectionGroup rows don't carry their parent event id by default —
    // derive it from each doc's own path (…/academyEvents/{eventId}/participants/{userId}).
    const participantRows = participantGroups.docs.map((doc) => ({
      ...plain(doc),
      eventId: doc.ref.parent.parent.id,
    }));
    const rows = events.map((event) => eventRow(event, participantRows)).sort((a, b) => (a.eventDate || "").localeCompare(b.eventDate || ""));
    return NextResponse.json({ events: rows, stats: buildStats(rows), canManage: true });
  } catch (error) {
    return failure("list", error);
  }
}

export async function POST(request) {
  try {
    const access = await requireManager(request);
    if (access.denied) return access.denied;
    const { db, uid } = access;
    const body = await request.json();
    const fields = validateEventFields(body);
    const ref = db.collection("academyEvents").doc();
    const now = FieldValue.serverTimestamp();
    await ref.set({
      ...fields,
      bannerUrl: "",
      bannerPath: "",
      // Denormalized so Student/public reads (which the rules only allow on
      // the event doc itself, never a list of the participants subcollection)
      // can still show capacity/"Event Full" without a dedicated endpoint.
      // The Admin dashboard's own participant counts are always computed
      // live from the subcollection instead (see GET below) — this field
      // exists purely for the read-only public/student view.
      participantCount: 0,
      createdBy: uid,
      createdAt: now,
      updatedAt: now,
    });

    // Best-effort broadcast — a failure here must never fail event creation
    // itself (awaited, not fire-and-forget, since a serverless response can
    // otherwise end the process before a background promise finishes).
    // Only fires for events created already published, since a Draft isn't
    // visible/actionable for anyone who'd be notified about it.
    if (fields.published) {
      try {
        await announceNewEvent(db, ref.id, fields);
      } catch (broadcastError) {
        console.error("[events-api] new-event broadcast failed", { message: broadcastError?.message || "unknown" });
      }
    }

    return NextResponse.json({ event: { id: ref.id, ...fields, bannerUrl: "", bannerPath: "" } }, { status: 201 });
  } catch (error) {
    return error?.message ? NextResponse.json({ message: error.message }, { status: 400 }) : failure("create", error);
  }
}

export async function PATCH(request) {
  try {
    const access = await requireManager(request);
    if (access.denied) return access.denied;
    const { db } = access;
    const body = await request.json();
    if (typeof body.id !== "string" || !body.id) return NextResponse.json({ message: "Event ID is required." }, { status: 400 });
    const ref = db.collection("academyEvents").doc(body.id);
    const snapshot = await ref.get();
    if (!snapshot.exists) return NextResponse.json({ message: "Event not found." }, { status: 404 });

    // A publish/unpublish toggle sends only { id, published } — every other
    // field must be left exactly as it was, so it skips full re-validation
    // (which would otherwise fail on fields the toggle call never sends).
    const isPublishToggleOnly = Object.keys(body).filter((key) => key !== "id").every((key) => key === "published");
    if (isPublishToggleOnly) {
      await ref.update({ published: Boolean(body.published), updatedAt: FieldValue.serverTimestamp() });
      return NextResponse.json({ ok: true });
    }

    const fields = validateEventFields({ ...snapshot.data(), ...body });
    const update = { ...fields, updatedAt: FieldValue.serverTimestamp() };
    if (typeof body.bannerUrl === "string") update.bannerUrl = body.bannerUrl;
    if (typeof body.bannerPath === "string") update.bannerPath = body.bannerPath;
    await ref.update(update);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return error?.message ? NextResponse.json({ message: error.message }, { status: 400 }) : failure("update", error);
  }
}

export async function DELETE(request) {
  try {
    const access = await requireManager(request);
    if (access.denied) return access.denied;
    const { db } = access;
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ message: "Event ID is required." }, { status: 400 });
    const ref = db.collection("academyEvents").doc(id);
    const snapshot = await ref.get();
    if (!snapshot.exists) return NextResponse.json({ message: "Event not found." }, { status: 404 });

    // Firestore never cascade-deletes subcollections — remove every
    // participant doc first, chunked well under the 500-write batch limit.
    const participants = await ref.collection("participants").get();
    const docs = participants.docs;
    for (let i = 0; i < docs.length; i += 400) {
      const batch = db.batch();
      docs.slice(i, i + 400).forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    }
    await ref.delete();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failure("delete", error);
  }
}
