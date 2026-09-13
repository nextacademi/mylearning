import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "../../../../../lib/firebase-admin";
import { getCachedUserSnapshot } from "../../../../../lib/server/cached-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const managers = new Set(["Admin", "Director"]);

function failure(stage, error) {
  console.error("[shop-products-api] failed", { stage, code: error?.code || "unknown" });
  return NextResponse.json({ message: `Shop API failed at ${stage}. Check the server log for the safe error code.` }, { status: 500 });
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

// Product create/update/delete is Admin/Director-only (see firestore.rules'
// `products` match — reads are open to any signed-in user directly via the
// client SDK, only writes go through here). Kept as a real API route
// rather than a direct client write so field validation lives in one
// place, matching every other admin-managed collection in this app
// (events, teachers, students).
// A category is optional (existing products predate this feature entirely
// and must keep working with none) — but when one IS given, it must be a
// real, active category, never trusted blindly from the client.
async function resolveCategoryId(db, categoryId) {
  if (categoryId === undefined) return { skip: true };
  if (!categoryId) return { value: "" };
  const snapshot = await db.collection("productCategories").doc(categoryId).get();
  if (!snapshot.exists || snapshot.data().active === false) {
    return { error: "Choose a valid, active category." };
  }
  return { value: categoryId };
}

// Variants (size/color/etc.) are genuinely optional — not every product
// needs them (a mug vs. a T-shirt) — and there is no existing separate
// Variant model anywhere in this schema, so they're stored as a plain
// embedded array on the product doc itself rather than a new collection
// (the simplest structure that fits this app's "do not over-engineer"
// convention and needs no new relation/rules). `label` is deliberately
// generic (not `size`) — this must never assume every variant is a
// clothing size. When variants exist, the product's own top-level `stock`
// becomes the derived SUM of variant stocks, so every existing consumer of
// `product.stock` (the Shop card's stock badge, low-stock threshold,
// Manage Products table, checkout's no-variant path) keeps working
// completely unchanged, with no need to know variants exist at all.
function resolveVariants(variants) {
  if (variants === undefined) return { skip: true };
  if (!Array.isArray(variants) || !variants.length) return { value: [], stock: null };
  const clean = [];
  for (const item of variants) {
    const label = typeof item?.label === "string" ? item.label.trim().slice(0, 60) : "";
    const stock = Number(item?.stock);
    if (!label) return { error: "Enter a name for every size/variant." };
    if (!Number.isInteger(stock) || stock < 0) return { error: `Enter a valid stock quantity for "${label}".` };
    clean.push({ id: typeof item?.id === "string" && item.id ? item.id : `${Date.now()}-${clean.length}`, label, stock });
  }
  const labels = clean.map((v) => v.label.toLowerCase());
  if (new Set(labels).size !== labels.length) return { error: "Size/variant names must be unique." };
  return { value: clean, stock: clean.reduce((sum, v) => sum + v.stock, 0) };
}

export async function POST(request) {
  try {
    const access = await requireManager(request);
    if (access.denied) return access.denied;
    const { name, description, price, stock, imageUrl, categoryId, variants } = await request.json();
    if (typeof name !== "string" || !name.trim()) return NextResponse.json({ message: "Product name is required." }, { status: 400 });
    const numericPrice = Number(price);
    if (!Number.isFinite(numericPrice) || numericPrice < 0) return NextResponse.json({ message: "Enter a valid price." }, { status: 400 });
    const numericStock = Number(stock);
    if (!Number.isInteger(numericStock) || numericStock < 0) return NextResponse.json({ message: "Enter a valid stock quantity." }, { status: 400 });
    const category = await resolveCategoryId(access.db, categoryId);
    if (category.error) return NextResponse.json({ message: category.error }, { status: 400 });
    const variantResult = resolveVariants(variants);
    if (variantResult.error) return NextResponse.json({ message: variantResult.error }, { status: 400 });

    const now = FieldValue.serverTimestamp();
    const ref = await access.db.collection("products").add({
      name: name.trim().slice(0, 200),
      description: typeof description === "string" ? description.trim().slice(0, 2000) : "",
      price: numericPrice,
      // When real variants are provided, their stock total is the actual
      // inventory truth; the plain `stock` field submitted alongside them
      // is ignored rather than allowed to silently disagree with it.
      stock: variantResult.stock != null ? variantResult.stock : numericStock,
      imageUrl: typeof imageUrl === "string" ? imageUrl : "",
      categoryId: category.skip ? "" : category.value,
      variants: variantResult.skip ? [] : variantResult.value,
      active: true,
      createdBy: access.adminUid,
      createdAt: now,
      updatedAt: now,
    });
    return NextResponse.json({ id: ref.id }, { status: 201 });
  } catch (error) {
    return failure("product create", error);
  }
}

export async function PATCH(request) {
  try {
    const access = await requireManager(request);
    if (access.denied) return access.denied;
    const { id, name, description, price, stock, imageUrl, active, categoryId, variants } = await request.json();
    if (typeof id !== "string" || !id) return NextResponse.json({ message: "Product ID is required." }, { status: 400 });
    const ref = access.db.collection("products").doc(id);
    const snapshot = await ref.get();
    if (!snapshot.exists) return NextResponse.json({ message: "Product not found." }, { status: 404 });

    const update = { updatedAt: FieldValue.serverTimestamp() };
    if (typeof name === "string") {
      if (!name.trim()) return NextResponse.json({ message: "Product name is required." }, { status: 400 });
      update.name = name.trim().slice(0, 200);
    }
    if (typeof description === "string") update.description = description.trim().slice(0, 2000);
    if (price !== undefined) {
      const numericPrice = Number(price);
      if (!Number.isFinite(numericPrice) || numericPrice < 0) return NextResponse.json({ message: "Enter a valid price." }, { status: 400 });
      update.price = numericPrice;
    }
    const variantResult = resolveVariants(variants);
    if (variantResult.error) return NextResponse.json({ message: variantResult.error }, { status: 400 });
    if (!variantResult.skip) update.variants = variantResult.value;
    if (variantResult.stock != null) {
      // Real variant stock totals take precedence over a manually-submitted
      // plain `stock` value in the same request.
      update.stock = variantResult.stock;
    } else if (stock !== undefined) {
      const numericStock = Number(stock);
      if (!Number.isInteger(numericStock) || numericStock < 0) return NextResponse.json({ message: "Enter a valid stock quantity." }, { status: 400 });
      update.stock = numericStock;
    }
    if (typeof imageUrl === "string") update.imageUrl = imageUrl;
    if (typeof active === "boolean") update.active = active;
    if (categoryId !== undefined) {
      const category = await resolveCategoryId(access.db, categoryId);
      if (category.error) return NextResponse.json({ message: category.error }, { status: 400 });
      update.categoryId = category.value;
    }

    await ref.update(update);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failure("product update", error);
  }
}

export async function DELETE(request) {
  try {
    const access = await requireManager(request);
    if (access.denied) return access.denied;
    const { id } = await request.json();
    if (typeof id !== "string" || !id) return NextResponse.json({ message: "Product ID is required." }, { status: 400 });
    await access.db.collection("products").doc(id).delete();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failure("product delete", error);
  }
}
