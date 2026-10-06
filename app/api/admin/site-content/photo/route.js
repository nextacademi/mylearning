import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb, getAdminStorage } from "../../../../../lib/firebase-admin";
import { getCachedUserSnapshot } from "../../../../../lib/server/cached-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const managers = new Set(["Admin", "Director"]);
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);
const maxSize = 5 * 1024 * 1024;
const folders = new Set(["site", "team"]);

async function requireManager(request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { denied: NextResponse.json({ message: "Sign in to continue." }, { status: 401 }) };
  const db = getAdminDb();
  const decoded = await getAdminAuth().verifyIdToken(token);
  const profile = await getCachedUserSnapshot(db, decoded.uid);
  const data = profile.data() || {};
  if (!profile.exists || data.active === false || !managers.has(data.role)) {
    return { denied: NextResponse.json({ message: "Administrator or Director access is required." }, { status: 403 }) };
  }
  return {};
}

// Photo upload for Website content cards and Team members. Mirrors
// app/api/admin/training/thumbnail/route.js — proxied through the Admin SDK
// rather than a direct client Storage write. Returns a public URL the
// caller saves into the item's `photo` field.
export async function POST(request) {
  try {
    const access = await requireManager(request);
    if (access.denied) return access.denied;

    const form = await request.formData();
    const file = form.get("file");
    const folder = folders.has(form.get("folder")) ? form.get("folder") : "site";
    if (!(file instanceof File)) return NextResponse.json({ message: "Choose a photo to upload." }, { status: 400 });
    if (!allowedTypes.has(file.type)) return NextResponse.json({ message: "Upload a JPEG, PNG, WEBP, GIF, or AVIF image." }, { status: 400 });
    if (file.size > maxSize) return NextResponse.json({ message: "Photos must be under 5 MB." }, { status: 400 });

    const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_").slice(-120) || "photo";
    const path = `siteContent/${folder}/${Date.now()}_${safeName}`;
    const bucket = getAdminStorage().bucket();
    const storageFile = bucket.file(path);
    await storageFile.save(Buffer.from(await file.arrayBuffer()), { metadata: { contentType: file.type } });
    await storageFile.makePublic();
    return NextResponse.json({ url: `https://storage.googleapis.com/${bucket.name}/${path}`, path });
  } catch (error) {
    console.error("[site-content-photo-api] upload failed", { code: error?.code || "unknown", message: error?.message || "unknown" });
    return NextResponse.json({ message: "Unable to upload the photo. Please try again." }, { status: 500 });
  }
}
