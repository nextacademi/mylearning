import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "../../../../lib/firebase-admin";
import { getCachedUserSnapshot } from "../../../../lib/server/cached-profile";
import { computeEventStatus } from "../../../../lib/events-shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const plain = (snapshot) => ({ id: snapshot.id, ...snapshot.data() });

function failure(stage, error) {
  console.error("[events-register-api] failed", { stage, code: error?.code || "unknown", message: error?.message || "unknown" });
  return NextResponse.json({ message: "Unable to complete this request. Please try again." }, { status: 500 });
}

async function access(request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { denied: NextResponse.json({ message: "Sign in to continue." }, { status: 401 }) };
  const db = getAdminDb();
  const decoded = await getAdminAuth().verifyIdToken(token);
  const profile = await getCachedUserSnapshot(db, decoded.uid);
  const data = profile.data() || {};
  if (!profile.exists || data.active === false || data.status === "pending" || data.status === "rejected") {
    return { denied: NextResponse.json({ message: "Account access is required." }, { status: 403 }) };
  }
  return { db, uid: decoded.uid, profile: data };
}

// Runs the full check chain inside one transaction — published, registration
// open, before deadline, not already registered, under capacity — so two
// simultaneous requests can never both slip through capacity as full.
export async function POST(request) {
  try {
    const a = await access(request);
    if (a.denied) return a.denied;
    const body = await request.json().catch(() => ({}));
    const eventId = typeof body.eventId === "string" ? body.eventId : "";
    if (!eventId) return NextResponse.json({ message: "Event ID is required." }, { status: 400 });

    const eventRef = a.db.collection("academyEvents").doc(eventId);
    const participantRef = eventRef.collection("participants").doc(a.uid);

    const result = await a.db.runTransaction(async (transaction) => {
      const eventSnapshot = await transaction.get(eventRef);
      if (!eventSnapshot.exists) return { status: 404, body: { message: "Event not found." } };
      const event = plain(eventSnapshot);
      if (!event.published) return { status: 403, body: { message: "This event is not open for registration." } };
      if (!event.registrationRequired) return { status: 400, body: { message: "This event does not require registration." } };
      const status = computeEventStatus(event);
      if (status === "Completed" || status === "Cancelled") {
        return { status: 400, body: { message: "Registration Closed" } };
      }
      if (event.registrationDeadline) {
        const today = new Date().toISOString().slice(0, 10);
        if (today > event.registrationDeadline) return { status: 400, body: { message: "Registration Closed" } };
      }

      const existing = await transaction.get(participantRef);
      if (existing.exists) return { status: 409, body: { message: "You are already registered for this event." } };

      if (event.maxParticipants != null) {
        const countSnapshot = await transaction.get(eventRef.collection("participants").count());
        if (countSnapshot.data().count >= event.maxParticipants) {
          return { status: 409, body: { message: "Event Full" } };
        }
      }

      transaction.set(participantRef, {
        displayName: a.profile.displayName || "",
        email: a.profile.email || "",
        phone: a.profile.phone || "",
        role: a.profile.role || "",
        registeredAt: FieldValue.serverTimestamp(),
        attendanceStatus: null,
        attendanceAt: null,
        source: "self",
      });
      transaction.update(eventRef, { participantCount: FieldValue.increment(1) });
      return { status: 201, body: { ok: true } };
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    return failure("register", error);
  }
}

export async function DELETE(request) {
  try {
    const a = await access(request);
    if (a.denied) return a.denied;
    const eventId = new URL(request.url).searchParams.get("eventId");
    if (!eventId) return NextResponse.json({ message: "Event ID is required." }, { status: 400 });

    const eventSnapshot = await a.db.collection("academyEvents").doc(eventId).get();
    if (!eventSnapshot.exists) return NextResponse.json({ message: "Event not found." }, { status: 404 });
    const event = plain(eventSnapshot);
    const status = computeEventStatus(event);
    if (status === "Completed") {
      return NextResponse.json({ message: "This event has already ended and can no longer be cancelled." }, { status: 400 });
    }

    const participantRef = eventSnapshot.ref.collection("participants").doc(a.uid);
    const snapshot = await participantRef.get();
    if (!snapshot.exists) return NextResponse.json({ message: "You are not registered for this event." }, { status: 404 });
    const batch = a.db.batch();
    batch.delete(participantRef);
    batch.update(eventSnapshot.ref, { participantCount: FieldValue.increment(-1) });
    await batch.commit();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failure("cancel", error);
  }
}
