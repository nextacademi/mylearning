import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "../../../../../lib/firebase-admin";
import { getCachedUserSnapshot } from "../../../../../lib/server/cached-profile";
import { deleteLessonFile, getLessonFileForUser } from "../../../../../lib/server/lesson-content-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Authorised lesson-content stream — the ONLY path any role (including the
// owning Teacher/Admin previewing their own upload) ever uses to open a
// lesson's video/PDF bytes. Every request re-verifies the Firebase ID token,
// the account, and (via getLessonFileForUser) real course ownership /
// enrollment + published status for the lesson's actual current data —
// changing the ids in the URL/query just returns 403/404.
async function authenticate(request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { denied: NextResponse.json({ message: "Sign in to continue." }, { status: 401 }) };
  const db = getAdminDb();
  const decoded = await getAdminAuth().verifyIdToken(token);
  const snapshot = await getCachedUserSnapshot(db, decoded.uid);
  const profile = snapshot.data() || {};
  if (!snapshot.exists || profile.active === false) {
    return { denied: NextResponse.json({ message: "Account access is required." }, { status: 403 }) };
  }
  return { db, uid: decoded.uid, profile };
}

export async function GET(request, context) {
  try {
    const auth = await authenticate(request);
    if (auth.denied) return auth.denied;
    const { lessonId } = await context.params;
    const url = new URL(request.url);
    const courseId = url.searchParams.get("courseId") || "";
    const moduleId = url.searchParams.get("moduleId") || "";
    if (!courseId || !moduleId) {
      return NextResponse.json({ message: "Missing course or module id." }, { status: 400 });
    }

    const { buffer, mimeType, fileName } = await getLessonFileForUser(
      auth.db,
      { courseId, moduleId, lessonId },
      auth.uid,
      auth.profile,
    );
    const safeName = String(fileName || "lesson-file").replace(/["\\\r\n]/g, "_");

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": `inline; filename="${safeName}"`,
        "Content-Length": String(buffer.length),
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error?.statusCode) return NextResponse.json({ message: error.message }, { status: error.statusCode });
    console.error("[lesson-content-file] failed", { code: error?.code || "unknown", message: error?.message || "unknown" });
    return NextResponse.json({ message: "Unable to open this lesson's content. Please try again." }, { status: 500 });
  }
}

// Called by lib/course-modules-data.js's deleteLesson right before it removes
// the Firestore lesson doc, so an uploaded Storage object doesn't linger —
// client-side Storage deletes aren't possible for this path (see route.js's
// header comment), so this is the only cleanup path. Best-effort: a failed
// Storage delete never blocks the caller from deleting the lesson doc.
export async function DELETE(request, context) {
  try {
    const auth = await authenticate(request);
    if (auth.denied) return auth.denied;
    const { lessonId } = await context.params;
    const url = new URL(request.url);
    const courseId = url.searchParams.get("courseId") || "";
    const moduleId = url.searchParams.get("moduleId") || "";
    if (!courseId || !moduleId) {
      return NextResponse.json({ message: "Missing course or module id." }, { status: 400 });
    }
    const result = await deleteLessonFile(auth.db, { courseId, moduleId, lessonId }, { uid: auth.uid, role: auth.profile.role || "" });
    return NextResponse.json(result);
  } catch (error) {
    if (error?.statusCode) return NextResponse.json({ message: error.message }, { status: error.statusCode });
    console.error("[lesson-content-file] delete failed", { code: error?.code || "unknown", message: error?.message || "unknown" });
    return NextResponse.json({ message: "Unable to remove this lesson's content." }, { status: 500 });
  }
}
