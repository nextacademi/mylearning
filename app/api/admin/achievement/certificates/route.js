import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "../../../../../lib/firebase-admin";
import { getCachedUserSnapshot } from "../../../../../lib/server/cached-profile";
import { revokeCertificate, reissueCertificate } from "../../../../../lib/server/certificate-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const managers = new Set(["Admin", "Director"]);

function failure(stage, error) {
  console.error("[achievement-certificates-api] failed", { stage, code: error?.code || "unknown" });
  return NextResponse.json({ message: `Generated Certificates API failed at ${stage}. Check the server log for the safe error code.` }, { status: 500 });
}

async function requireManager(request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { denied: NextResponse.json({ message: "Administrator access is required." }, { status: 401 }) };
  const auth = getAdminAuth();
  const db = getAdminDb();
  const decoded = await auth.verifyIdToken(token);
  const profile = await getCachedUserSnapshot(db, decoded.uid);
  if (!profile.exists || profile.data().active === false || !managers.has(profile.data().role)) {
    return { denied: NextResponse.json({ message: "Administrator access is required." }, { status: 403 }) };
  }
  return { db, adminUid: decoded.uid };
}

// The Admin "Generated Certificates" view inside Achievement. Reads every
// certificate ever issued (auto or manually-issued by a Teacher — same
// collection, no separate table) and enriches each row with the student/
// course names the columns need, exactly like courseRow() already does for
// Training's admin list.
export async function GET(request) {
  try {
    const access = await requireManager(request);
    if (access.denied) return access.denied;
    const snapshot = await access.db.collection("certificates").orderBy("createdAt", "desc").get();
    const rows = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    const studentIds = [...new Set(rows.map((row) => row.studentId).filter(Boolean))];
    const courseIds = [...new Set(rows.map((row) => row.courseId).filter(Boolean))];
    const templateIds = [...new Set(rows.map((row) => row.templateId).filter(Boolean))];
    const [studentSnaps, courseSnaps, templateSnaps] = await Promise.all([
      studentIds.length ? access.db.getAll(...studentIds.map((id) => access.db.collection("users").doc(id))) : [],
      courseIds.length ? access.db.getAll(...courseIds.map((id) => access.db.collection("courses").doc(id))) : [],
      templateIds.length ? access.db.getAll(...templateIds.map((id) => access.db.collection("certificateTemplates").doc(id))) : [],
    ]);
    const students = new Map(studentSnaps.filter((s) => s.exists).map((s) => [s.id, s.data()]));
    const courses = new Map(courseSnaps.filter((s) => s.exists).map((s) => [s.id, s.data()]));
    const templates = new Map(templateSnaps.filter((s) => s.exists).map((s) => [s.id, s.data()]));

    const certificates = rows.map((row) => ({
      ...row,
      studentName: students.get(row.studentId)?.displayName || row.metadata?.studentName || "",
      studentUserId: students.get(row.studentId)?.userId || row.metadata?.studentUserId || "",
      courseName: courses.get(row.courseId)?.title || row.metadata?.courseName || row.courseId || "",
      templateName: templates.get(row.templateId)?.name || "",
    }));
    return NextResponse.json({ certificates });
  } catch (error) {
    return failure("certificate list", error);
  }
}

// Revoke/Reissue actions — see certificate-core.js for what each does and
// why (history is never deleted, exactly one active certificate per
// completion at a time).
export async function PATCH(request) {
  try {
    const access = await requireManager(request);
    if (access.denied) return access.denied;
    const { id, action } = await request.json();
    if (typeof id !== "string" || !id) return NextResponse.json({ message: "Certificate ID is required." }, { status: 400 });
    if (action === "revoke") {
      await revokeCertificate(access.db, id, access.adminUid);
      return NextResponse.json({ ok: true });
    }
    if (action === "reissue") {
      const newId = await reissueCertificate(access.db, id, access.adminUid);
      return NextResponse.json({ ok: true, id: newId });
    }
    return NextResponse.json({ message: "Unknown action." }, { status: 400 });
  } catch (error) {
    return error?.message ? NextResponse.json({ message: error.message }, { status: 400 }) : failure("certificate action", error);
  }
}
