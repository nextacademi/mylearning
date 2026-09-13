import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "../../../../../lib/firebase-admin";
import { getCachedUserSnapshot } from "../../../../../lib/server/cached-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const managers = new Set(["Admin", "Director"]);

function failure(stage, error) {
  console.error("[shop-categories-api] failed", { stage, code: error?.code || "unknown" });
  return NextResponse.json({ message: `Shop Categories API failed at ${stage}. Check the server log for the safe error code.` }, { status: 500 });
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

// No slug library in this project (checked package.json) — the project's
// existing ID conventions (lib/server/user-id.js, course codes) are all
// counter/random-suffix based, not slugs, so there's nothing to reuse here.
// This is intentionally the simplest possible transform, not a dependency.
function slugify(name) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

// Reads go directly through the client SDK (firestore.rules' productCategories
// `allow read: if signedIn()`), same as `products` — no GET route needed here,
// mirroring admin/shop/products/route.js's own POST/PATCH/DELETE-only shape.

export async function POST(request) {
  try {
    const access = await requireManager(request);
    if (access.denied) return access.denied;
    const { name, description, imageUrl, imagePath } = await request.json();
    if (typeof name !== "string" || !name.trim()) return NextResponse.json({ message: "Category name is required." }, { status: 400 });
    const trimmedName = name.trim().slice(0, 100);
    const slug = slugify(trimmedName);
    if (!slug) return NextResponse.json({ message: "Enter a valid category name." }, { status: 400 });

    const duplicate = await access.db.collection("productCategories").where("slug", "==", slug).limit(1).get();
    if (!duplicate.empty) return NextResponse.json({ message: "A category with this name already exists." }, { status: 400 });

    const now = FieldValue.serverTimestamp();
    const ref = await access.db.collection("productCategories").add({
      name: trimmedName,
      slug,
      description: typeof description === "string" ? description.trim().slice(0, 500) : "",
      imageUrl: typeof imageUrl === "string" ? imageUrl : "",
      imagePath: typeof imagePath === "string" ? imagePath : "",
      active: true,
      createdBy: access.adminUid,
      createdAt: now,
      updatedAt: now,
    });
    return NextResponse.json({ id: ref.id, slug }, { status: 201 });
  } catch (error) {
    return failure("category create", error);
  }
}

export async function PATCH(request) {
  try {
    const access = await requireManager(request);
    if (access.denied) return access.denied;
    const { id, name, description, imageUrl, imagePath, active } = await request.json();
    if (typeof id !== "string" || !id) return NextResponse.json({ message: "Category ID is required." }, { status: 400 });
    const ref = access.db.collection("productCategories").doc(id);
    const snapshot = await ref.get();
    if (!snapshot.exists) return NextResponse.json({ message: "Category not found." }, { status: 404 });

    const update = { updatedAt: FieldValue.serverTimestamp() };
    if (typeof name === "string") {
      const trimmedName = name.trim().slice(0, 100);
      if (!trimmedName) return NextResponse.json({ message: "Category name is required." }, { status: 400 });
      const slug = slugify(trimmedName);
      const duplicate = await access.db.collection("productCategories").where("slug", "==", slug).limit(1).get();
      if (!duplicate.empty && duplicate.docs[0].id !== id) {
        return NextResponse.json({ message: "A category with this name already exists." }, { status: 400 });
      }
      update.name = trimmedName;
      update.slug = slug;
    }
    if (typeof description === "string") update.description = description.trim().slice(0, 500);
    if (typeof imageUrl === "string") update.imageUrl = imageUrl;
    if (typeof imagePath === "string") update.imagePath = imagePath;
    if (typeof active === "boolean") update.active = active;

    await ref.update(update);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failure("category update", error);
  }
}

export async function DELETE(request) {
  try {
    const access = await requireManager(request);
    if (access.denied) return access.denied;
    const { id } = await request.json();
    if (typeof id !== "string" || !id) return NextResponse.json({ message: "Category ID is required." }, { status: 400 });

    // Never cascade-delete products, and never silently orphan them either
    // — if any product still references this category, refuse the delete
    // and point the admin at deactivation instead (same pattern already
    // used for certificate templates in use by a course).
    const inUse = await access.db.collection("products").where("categoryId", "==", id).limit(1).get();
    if (!inUse.empty) {
      return NextResponse.json({ message: "This category has products assigned to it. Deactivate it instead of deleting." }, { status: 400 });
    }
    await access.db.collection("productCategories").doc(id).delete();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failure("category delete", error);
  }
}
