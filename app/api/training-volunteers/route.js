import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "../../../lib/firebase-admin";
import { getCachedUserSnapshot } from "../../../lib/server/cached-profile";
import { verifyQrToken, QrTokenError } from "../../../lib/qr-token";
import {
  addTrainingVolunteer, listTrainingVolunteers, removeTrainingVolunteer, trainingDefaultHours, updateTrainingVolunteerHours,
} from "../../../lib/server/training-volunteers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const managers = new Set(["Admin", "Director"]);

// Training volunteers (lib/server/training-volunteers.js). Admin/Director
// for any training; a Teacher only for a training they're assigned to.
async function access(request, courseId) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { denied: NextResponse.json({ message: "Sign in to continue." }, { status: 401 }) };
  const db = getAdminDb();
  const decoded = await getAdminAuth().verifyIdToken(token);
  const profile = await getCachedUserSnapshot(db, decoded.uid);
  const data = profile.data() || {};
  if (!profile.exists || data.active === false) return { denied: NextResponse.json({ message: "Account access is required." }, { status: 403 }) };
  if (!courseId) return { denied: NextResponse.json({ message: "Training is required." }, { status: 400 }) };
  const courseSnap = await db.collection("courses").doc(courseId).get();
  if (!courseSnap.exists) return { denied: NextResponse.json({ message: "Training not found." }, { status: 404 }) };
  const course = { id: courseSnap.id, ...courseSnap.data() };
  const allowed = managers.has(data.role) || (data.role === "Teacher" && (course.teacherIds || []).includes(decoded.uid));
  if (!allowed) return { denied: NextResponse.json({ message: "You do not have access to this training's volunteers." }, { status: 403 }) };
  return { db, uid: decoded.uid, course };
}

const fail = (error, stage) => {
  if (error.statusCode) return NextResponse.json({ message: error.message }, { status: error.statusCode });
  console.error("[training-volunteers] failed", { stage, message: error?.message });
  return NextResponse.json({ message: "Unable to complete this request. Please try again." }, { status: 500 });
};

export async function GET(request) {
  try {
    const params = new URL(request.url).searchParams;
    const a = await access(request, params.get("courseId"));
    if (a.denied) return a.denied;
    const volunteers = await listTrainingVolunteers(a.db, a.course.id, params.get("date") || "");
    return NextResponse.json({ volunteers, defaultHours: trainingDefaultHours(a.course) });
  } catch (error) {
    return fail(error, "list");
  }
}

// { courseId, date, hours?, userId | name/email/phone | token (scanned ID QR) }
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const a = await access(request, body.courseId);
    if (a.denied) return a.denied;
    let person = body.userId ? { userId: String(body.userId) } : { name: body.name, email: body.email, phone: body.phone };
    let source = "manual";
    if (typeof body.token === "string" && body.token) {
      let payload;
      try {
        payload = verifyQrToken(body.token);
      } catch (error) {
        if (error instanceof QrTokenError) return NextResponse.json({ message: error.message }, { status: 400 });
        return NextResponse.json({ message: "Invalid QR code." }, { status: 400 });
      }
      const userSnap = await a.db.collection("users").doc(payload.sub).get();
      if (!userSnap.exists) return NextResponse.json({ message: "Member not found." }, { status: 404 });
      if ((userSnap.data().qrVersion || 0) !== payload.v) return NextResponse.json({ message: "This QR code has been replaced. Ask for a reissued ID card." }, { status: 400 });
      person = { userId: payload.sub };
      source = "scan";
    }
    const result = await addTrainingVolunteer(a.db, a.course, { date: body.date, person, hours: body.hours, source, markedBy: a.uid });
    return NextResponse.json({
      ok: true,
      ...result,
      message: `${result.displayName} ${result.already ? "was already checked in — hours updated to" : "checked in as volunteer —"} ${result.hours}h.`,
    }, { status: result.already ? 200 : 201 });
  } catch (error) {
    return fail(error, "add");
  }
}

// { courseId, id, hours }
export async function PATCH(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const a = await access(request, body.courseId);
    if (a.denied) return a.denied;
    if (!String(body.id || "").startsWith(`${a.course.id}_`)) return NextResponse.json({ message: "Volunteer record not found." }, { status: 404 });
    return NextResponse.json({ ok: true, ...(await updateTrainingVolunteerHours(a.db, body.id, body.hours)) });
  } catch (error) {
    return fail(error, "update");
  }
}

// ?courseId=&id=
export async function DELETE(request) {
  try {
    const params = new URL(request.url).searchParams;
    const a = await access(request, params.get("courseId"));
    if (a.denied) return a.denied;
    const id = params.get("id") || "";
    if (!id.startsWith(`${a.course.id}_`)) return NextResponse.json({ message: "Volunteer record not found." }, { status: 404 });
    return NextResponse.json(await removeTrainingVolunteer(a.db, id));
  } catch (error) {
    return fail(error, "remove");
  }
}
