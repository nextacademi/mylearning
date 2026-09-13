import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "../../../lib/firebase-admin";
import { getCachedUserSnapshot } from "../../../lib/server/cached-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const managers = new Set(["Admin", "Director"]);
const allowedStatuses = new Set(["scheduled", "completed", "cancelled"]);

// A "class session" is one specific dated/timed physical meeting of an
// existing `classes/{id}` batch — see firestore.rules' classSessions block
// for why this is a new collection (nothing existing modeled a single
// occurrence ahead of time) rather than a duplicate of `classes` or a new
// "Batch" concept. Admin/Director can manage any session; Teacher only for
// classes they're actually assigned to (server-checked here, mirroring
// every other Teacher-scoped write in this app — never trusted from the
// client).
function failure(stage, error) {
  console.error("[class-sessions-api] failed", { stage, code: error?.code || "unknown" });
  return NextResponse.json({ message: `Class Sessions API failed at ${stage}. Check the server log for the safe error code.` }, { status: 500 });
}

async function access(request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { denied: NextResponse.json({ message: "Sign in to continue." }, { status: 401 }) };
  const auth = getAdminAuth();
  const db = getAdminDb();
  const decoded = await auth.verifyIdToken(token);
  const profile = await getCachedUserSnapshot(db, decoded.uid);
  const data = profile.data() || {};
  if (!profile.exists || data.active === false || !["Teacher", "Admin", "Director"].includes(data.role)) {
    return { denied: NextResponse.json({ message: "You do not have access to class sessions." }, { status: 403 }) };
  }
  return { db, uid: decoded.uid, role: data.role };
}

// Server-side ownership check for a Teacher — the same relationship
// firestore.rules' ownsClass() already checks, re-verified here since this
// route uses the Admin SDK (which bypasses Firestore rules entirely).
async function requireClassAccess(db, role, uid, classId) {
  if (managers.has(role)) return true;
  if (!classId) return false;
  const classSnap = await db.collection("classes").doc(classId).get();
  return classSnap.exists && (classSnap.data().teacherIds || []).includes(uid);
}

const text = (value, max) => {
  const v = typeof value === "string" ? value.trim() : "";
  return v.slice(0, max);
};

export async function GET(request) {
  try {
    const a = await access(request);
    if (a.denied) return a.denied;
    const courseId = new URL(request.url).searchParams.get("courseId");

    let snapshot;
    if (managers.has(a.role)) {
      snapshot = courseId
        ? await a.db.collection("classSessions").where("courseId", "==", courseId).get()
        : await a.db.collection("classSessions").get();
    } else {
      // Teacher: only sessions for classes they're actually assigned to —
      // resolved from their own class assignments, never trusting a
      // client-supplied filter alone.
      const ownClasses = await a.db.collection("classes").where("teacherIds", "array-contains", a.uid).get();
      const ownClassIds = ownClasses.docs.map((doc) => doc.id);
      if (!ownClassIds.length) return NextResponse.json({ sessions: [] });
      const chunks = [];
      for (let i = 0; i < ownClassIds.length; i += 10) chunks.push(ownClassIds.slice(i, i + 10));
      const results = await Promise.all(chunks.map((chunk) => a.db.collection("classSessions").where("classId", "in", chunk).get()));
      const docs = results.flatMap((r) => r.docs).filter((doc) => !courseId || doc.data().courseId === courseId);
      return NextResponse.json({ sessions: docs.map((doc) => ({ id: doc.id, ...doc.data() })) });
    }
    return NextResponse.json({ sessions: snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) });
  } catch (error) {
    return failure("session list", error);
  }
}

export async function POST(request) {
  try {
    const a = await access(request);
    if (a.denied) return a.denied;
    const body = await request.json();
    const courseId = typeof body.courseId === "string" ? body.courseId : "";
    const classId = typeof body.classId === "string" ? body.classId : "";
    const title = text(body.title, 120);
    const date = text(body.date, 20);
    const startTime = text(body.startTime, 10);
    const endTime = text(body.endTime, 10);
    const location = text(body.location, 200);
    const notes = text(body.notes, 1000);
    const teacherId = typeof body.teacherId === "string" ? body.teacherId : "";

    if (!courseId || !classId) return NextResponse.json({ message: "Choose a training and class." }, { status: 400 });
    if (!title) return NextResponse.json({ message: "Enter a class name/number." }, { status: 400 });
    if (!date) return NextResponse.json({ message: "Choose a date." }, { status: 400 });

    const classSnap = await a.db.collection("classes").doc(classId).get();
    if (!classSnap.exists || classSnap.data().courseId !== courseId) {
      return NextResponse.json({ message: "This class does not belong to the selected training." }, { status: 400 });
    }
    if (!(await requireClassAccess(a.db, a.role, a.uid, classId))) {
      return NextResponse.json({ message: "You are not authorized to create a class for this training." }, { status: 403 });
    }
    // A session's assigned instructor must be a real teacher already
    // assigned to this class — never an arbitrary uid from the client.
    const resolvedTeacherId = teacherId || (a.role === "Teacher" ? a.uid : (classSnap.data().teacherIds || [])[0] || "");
    if (resolvedTeacherId && !(classSnap.data().teacherIds || []).includes(resolvedTeacherId)) {
      return NextResponse.json({ message: "Choose a teacher already assigned to this class." }, { status: 400 });
    }

    const now = FieldValue.serverTimestamp();
    const ref = await a.db.collection("classSessions").add({
      courseId, classId, title, date, startTime, endTime, location, notes,
      teacherId: resolvedTeacherId,
      status: "scheduled",
      createdBy: a.uid,
      createdAt: now,
      updatedAt: now,
    });
    return NextResponse.json({ id: ref.id }, { status: 201 });
  } catch (error) {
    return failure("session create", error);
  }
}

export async function PATCH(request) {
  try {
    const a = await access(request);
    if (a.denied) return a.denied;
    const body = await request.json();
    const id = typeof body.id === "string" ? body.id : "";
    if (!id) return NextResponse.json({ message: "Session ID is required." }, { status: 400 });
    const ref = a.db.collection("classSessions").doc(id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ message: "Class session not found." }, { status: 404 });
    if (!(await requireClassAccess(a.db, a.role, a.uid, snap.data().classId))) {
      return NextResponse.json({ message: "You are not authorized to edit this class session." }, { status: 403 });
    }

    const update = { updatedAt: FieldValue.serverTimestamp() };
    if (typeof body.title === "string") update.title = text(body.title, 120);
    if (typeof body.date === "string") update.date = text(body.date, 20);
    if (typeof body.startTime === "string") update.startTime = text(body.startTime, 10);
    if (typeof body.endTime === "string") update.endTime = text(body.endTime, 10);
    if (typeof body.location === "string") update.location = text(body.location, 200);
    if (typeof body.notes === "string") update.notes = text(body.notes, 1000);
    if (typeof body.teacherId === "string" && body.teacherId) {
      const classSnap = await a.db.collection("classes").doc(snap.data().classId).get();
      if (!(classSnap.data()?.teacherIds || []).includes(body.teacherId)) {
        return NextResponse.json({ message: "Choose a teacher already assigned to this class." }, { status: 400 });
      }
      update.teacherId = body.teacherId;
    }
    if (typeof body.status === "string") {
      if (!allowedStatuses.has(body.status)) return NextResponse.json({ message: "Invalid status." }, { status: 400 });
      update.status = body.status;
    }

    await ref.update(update);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failure("session update", error);
  }
}

export async function DELETE(request) {
  try {
    const a = await access(request);
    if (a.denied) return a.denied;
    const { id } = await request.json();
    if (typeof id !== "string" || !id) return NextResponse.json({ message: "Session ID is required." }, { status: 400 });
    const ref = a.db.collection("classSessions").doc(id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ ok: true });
    if (!(await requireClassAccess(a.db, a.role, a.uid, snap.data().classId))) {
      return NextResponse.json({ message: "You are not authorized to delete this class session." }, { status: 403 });
    }
    await ref.delete();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failure("session delete", error);
  }
}
