import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb, getAdminStorage } from "../../../../../../lib/firebase-admin";
import { getCachedUserSnapshot } from "../../../../../../lib/server/cached-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const managers = new Set(["Admin", "Director"]);
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxSize = 8 * 1024 * 1024;

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
  return { db };
}

// Reuses the exact same Admin-SDK-proxied upload pattern as
// app/api/admin/shop/products/image and app/api/admin/events/banner — no
// new storage provider, just a new destination path under the same bucket.
export async function POST(request) {
  try {
    const access = await requireManager(request);
    if (access.denied) return access.denied;

    const form = await request.formData();
    const templateId = form.get("templateId");
    const file = form.get("file");
    if (typeof templateId !== "string" || !templateId) return NextResponse.json({ message: "Template ID is required." }, { status: 400 });
    if (!(file instanceof File)) return NextResponse.json({ message: "Choose a certificate background image to upload." }, { status: 400 });
    if (!allowedTypes.has(file.type)) return NextResponse.json({ message: "Upload a JPEG, PNG, or WEBP image." }, { status: 400 });
    if (file.size > maxSize) return NextResponse.json({ message: "Certificate backgrounds must be under 8 MB." }, { status: 400 });

    const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_").slice(-120) || "certificate";
    const path = `certificateTemplates/${templateId}/${Date.now()}_${safeName}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const bucket = getAdminStorage().bucket();
    const storageFile = bucket.file(path);
    await storageFile.save(buffer, { metadata: { contentType: file.type } });
    await storageFile.makePublic();
    const backgroundUrl = `https://storage.googleapis.com/${bucket.name}/${path}`;
    return NextResponse.json({ backgroundUrl, backgroundPath: path });
  } catch (error) {
    console.error("[achievement-template-image-api] upload failed", { code: error?.code || "unknown", message: error?.message || "unknown" });
    return NextResponse.json({ message: "Unable to upload the certificate background. Please try again." }, { status: 500 });
  }
}
