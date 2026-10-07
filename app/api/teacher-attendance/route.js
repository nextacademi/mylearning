import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "../../../lib/firebase-admin";
import { getCachedUserSnapshot } from "../../../lib/server/cached-profile";
import { listTeacherAttendance, markTeacherAttendance } from "../../../lib/server/teacher-attendance-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const managers = new Set(["Admin", "Director"]);

// Teacher attendance (see lib/server/teacher-attendance-core.js). Admin SDK
// only — no client Firestore access, so no new security rule is needed.
// Admin/Director read and mark any teacher; a Teacher may only read their
// own records.
function failure(stage, error) {
  console.error("[teacher-attendance-api] failed", { stage, code: error?.code || "unknown", message: error?.message });
  return NextResponse.json({ message: "Unable to load teacher attendance. Please try again." }, { status: 500 });
}

async function access(request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { denied: NextResponse.json({ message: "Sign in to continue." }, { status: 401 }) };
  const db = getAdminDb();
  const decoded = await getAdminAuth().verifyIdToken(token);
  const profile = await getCachedUserSnapshot(db, decoded.uid);
  const data = profile.data() || {};
  if (!profile.exists || data.active === false || !["Teacher", ...managers].includes(data.role)) {
    return { denied: NextResponse.json({ message: "You do not have access to teacher attendance." }, { status: 403 }) };
  }
  return { db, uid: decoded.uid, role: data.role };
}

export async function GET(request) {
  try {
    const a = await access(request);
    if (a.denied) return a.denied;
    const params = new URL(request.url).searchParams;
    const courseId = params.get("courseId") || "";
    const teacherId = managers.has(a.role) ? params.get("teacherId") || "" : a.uid;
    const records = await listTeacherAttendance(a.db, { courseId, teacherId });
    return NextResponse.json({ records });
  } catch (error) {
    return failure("list", error);
  }
}

export async function POST(request) {
  try {
    const a = await access(request);
    if (a.denied) return a.denied;
    if (!managers.has(a.role)) return NextResponse.json({ message: "Only Admin or Director can mark teacher attendance." }, { status: 403 });
    const body = await request.json().catch(() => ({}));
    const result = await markTeacherAttendance(a.db, { ...body, markedBy: a.uid });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error.statusCode) return NextResponse.json({ message: error.message }, { status: error.statusCode });
    return failure("mark", error);
  }
}
