import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb, getAdminStorage } from "../../../../../../lib/firebase-admin";
import { getCachedUserSnapshot } from "../../../../../../lib/server/cached-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const managers = new Set(["Admin", "Director"]);
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const maxSize = 5 * 1024 * 1024;

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

// Mirrors app/api/admin/shop/products/image/route.js exactly — same
// Admin-SDK-proxied upload pattern, same cross-service Storage-Rules
// limitation documented there. See storage.rules' productCategories block.
export async function POST(request) {
  try {
    const access = await requireManager(request);
    if (access.denied) return access.denied;

    const form = await request.formData();
    const categoryId = form.get("categoryId");
    const file = form.get("file");
    if (typeof categoryId !== "string" || !categoryId) return NextResponse.json({ message: "Category ID is required." }, { status: 400 });
    if (!(file instanceof File)) return NextResponse.json({ message: "Choose a category image to upload." }, { status: 400 });
    if (!allowedTypes.has(file.type)) return NextResponse.json({ message: "Upload a JPEG, PNG, WEBP, or GIF image." }, { status: 400 });
    if (file.size > maxSize) return NextResponse.json({ message: "Category images must be under 5 MB." }, { status: 400 });

    const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_").slice(-120) || "category";
    const path = `productCategories/${categoryId}/image/${Date.now()}_${safeName}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const bucket = getAdminStorage().bucket();
    const storageFile = bucket.file(path);
    await storageFile.save(buffer, { metadata: { contentType: file.type } });
    await storageFile.makePublic();
    const imageUrl = `https://storage.googleapis.com/${bucket.name}/${path}`;
    return NextResponse.json({ imageUrl, imagePath: path });
  } catch (error) {
    console.error("[shop-category-image-api] upload failed", { code: error?.code || "unknown", message: error?.message || "unknown" });
    return NextResponse.json({ message: "Unable to upload the category image. Please try again." }, { status: 500 });
  }
}
