import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "../../../../lib/firebase-admin";
import { getCachedUserSnapshot } from "../../../../lib/server/cached-profile";
import { createStandardAssignments, portalSummary, recordSubmission } from "../../../../lib/server/assignment-portal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const managers = new Set(["Admin", "Director"]);

// GET  → every training batch with each student's assignment status.
//        Admin/Director see every training; a Teacher sees only the ones
//        they teach, read-only (`canManage: false`).
// POST { assignmentId, studentId, link? } → record a submission for a student.
// POST { action: "setup", courseId } → create Assignment 1–4 for a training.
async function requireStaff(request, { allowTeacher = false } = {}) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { denied: NextResponse.json({ message: "Sign in to continue." }, { status: 401 }) };
  const db = getAdminDb();
  let decoded = null;
  try {
    decoded = await getAdminAuth().verifyIdToken(token);
  } catch {
    // Malformed or expired token.
  }
  if (!decoded) return { denied: NextResponse.json({ message: "Your session has expired. Please sign in again." }, { status: 401 }) };
  const profile = await getCachedUserSnapshot(db, decoded.uid);
  const data = profile.data() || {};
  const allowed = managers.has(data.role) || (allowTeacher && data.role === "Teacher");
  if (!profile.exists || data.active === false || !allowed) {
    return { denied: NextResponse.json({ message: "Administrator or Director access is required." }, { status: 403 }) };
  }
  return { db, uid: decoded.uid, isManager: managers.has(data.role) };
}

function failure(stage, error) {
  if (error?.statusCode) return NextResponse.json({ message: error.message }, { status: error.statusCode });
  console.error("[assignment-portal-api] failed", { stage, code: error?.code || "unknown", message: error?.message || "unknown" });
  return NextResponse.json({ message: "Unable to load assignments. Please try again." }, { status: 500 });
}

export async function GET(request) {
  try {
    const access = await requireStaff(request, { allowTeacher: true });
    if (access.denied) return access.denied;
    const summary = await portalSummary(access.db, { teacherId: access.isManager ? "" : access.uid });
    return NextResponse.json({ ...summary, canManage: access.isManager });
  } catch (error) {
    return failure("load", error);
  }
}

export async function POST(request) {
  try {
    const access = await requireStaff(request);
    if (access.denied) return access.denied;
    const body = await request.json().catch(() => ({}));
    if (body.action === "setup") await createStandardAssignments(access.db, access.uid, body.courseId);
    else await recordSubmission(access.db, access.uid, body);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failure("record", error);
  }
}
