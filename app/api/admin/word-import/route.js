import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "../../../../lib/firebase-admin";
import { getCachedUserSnapshot } from "../../../../lib/server/cached-profile";
import { parseDocx } from "../../../../lib/server/word-import-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Word import is Admin/Director only. This route ONLY parses an uploaded
// .docx into safe structured content for review — it never writes to the
// database. The actual save goes through each module's own existing,
// role-checked API after the admin confirms the preview.
async function requireManager(request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { denied: NextResponse.json({ message: "Administrator access is required." }, { status: 401 }) };
  const decoded = await getAdminAuth().verifyIdToken(token);
  const snapshot = await getCachedUserSnapshot(getAdminDb(), decoded.uid);
  const profile = snapshot.data() || {};
  if (!snapshot.exists || profile.active === false || !["Admin", "Director"].includes(profile.role)) {
    return { denied: NextResponse.json({ message: "Administrator access is required." }, { status: 403 }) };
  }
  return { uid: decoded.uid };
}

export async function POST(request) {
  try {
    const access = await requireManager(request);
    if (access.denied) return access.denied;

    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json({ message: "Upload a .docx file." }, { status: 400 });
    }
    const form = await request.formData();
    const file = form.get("file");
    if (!file || typeof file.arrayBuffer !== "function") {
      return NextResponse.json({ message: "Unable to read this Word document. Please upload a valid .docx file." }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = await parseDocx(file, buffer);
    return NextResponse.json(parsed);
  } catch (error) {
    if (error?.statusCode) return NextResponse.json({ message: error.message }, { status: error.statusCode });
    console.error("[word-import-api] failed", { code: error?.code || "unknown", message: error?.message || "unknown" });
    return NextResponse.json({ message: "Unable to read this Word document. Please upload a valid .docx file." }, { status: 400 });
  }
}
