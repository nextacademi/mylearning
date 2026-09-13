import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "../../../../lib/firebase-admin";
import { getCachedUserSnapshot } from "../../../../lib/server/cached-profile";
import { uploadLessonFile } from "../../../../lib/server/lesson-content-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function access(request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { denied: NextResponse.json({ message: "Sign in to continue." }, { status: 401 }) };
  const db = getAdminDb();
  const decoded = await getAdminAuth().verifyIdToken(token);
  const snapshot = await getCachedUserSnapshot(db, decoded.uid);
  const profile = snapshot.data() || {};
  if (!snapshot.exists || profile.active === false) {
    return { denied: NextResponse.json({ message: "Account access is required." }, { status: 403 }) };
  }
  return { db, uid: decoded.uid, profile, role: profile.role || "" };
}

export async function POST(request) {
  try {
    const auth = await access(request);
    if (auth.denied) return auth.denied;

    const form = await request.formData();
    const courseId = String(form.get("courseId") || "");
    const moduleId = String(form.get("moduleId") || "");
    const lessonId = String(form.get("lessonId") || "");
    if (!courseId || !moduleId || !lessonId) {
      return NextResponse.json({ message: "Missing course, module, or lesson id." }, { status: 400 });
    }
    const file = form.get("file");
    if (!file || typeof file.arrayBuffer !== "function") {
      return NextResponse.json({ message: "Choose a file to upload." }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());

    const result = await uploadLessonFile(
      auth.db,
      { courseId, moduleId, lessonId, file, buffer },
      { uid: auth.uid, role: auth.role },
    );
    return NextResponse.json(result);
  } catch (error) {
    if (error?.statusCode) return NextResponse.json({ message: error.message }, { status: error.statusCode });
    console.error("[lesson-content-api] upload failed", { code: error?.code || "unknown", message: error?.message || "unknown" });
    return NextResponse.json({ message: "Unable to upload this file. Please try again." }, { status: 500 });
  }
}
