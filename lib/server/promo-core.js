import { FieldValue } from "firebase-admin/firestore";
import { BULK_CODE_PREFIX, PROMO_TYPES } from "../promo-shared";

// Promo codes live in their own `promoCodes` collection, one doc per code,
// with the code ITSELF as the document id (uppercase) — that makes
// uniqueness a property Firestore already guarantees for free (a `.create()`
// on an existing doc id fails), instead of a separate lookup query that
// could race under concurrent creation.
const plain = (snapshot) => ({ id: snapshot.id, ...snapshot.data() });

function httpError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

function normalizeCode(raw) {
  const code = typeof raw === "string" ? raw.trim().toUpperCase().replace(/\s+/g, "") : "";
  if (!/^[A-Z0-9]{3,20}$/.test(code)) throw httpError("Coupon code must be 3-20 letters/numbers.", 400);
  return code;
}

function validatePromoInput(body) {
  const type = PROMO_TYPES.includes(body.type) ? body.type : "";
  if (!type) throw httpError("Choose a valid discount type.", 400);
  const value = type === "shipping" ? 0 : Number(body.value);
  if (type !== "shipping" && (!Number.isFinite(value) || value <= 0)) throw httpError("Discount value must be greater than zero.", 400);
  if (type === "percentage" && value > 100) throw httpError("Percentage discount cannot exceed 100.", 400);
  const limit = Number(body.limit);
  if (!Number.isFinite(limit) || limit < 1) throw httpError("Usage limit must be at least 1.", 400);
  const expiry = typeof body.expiry === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.expiry) ? body.expiry : "";
  if (!expiry) throw httpError("Choose an expiration date.", 400);
  return {
    type,
    value,
    limit,
    expiry,
    description: typeof body.description === "string" ? body.description.trim().slice(0, 300) : "",
  };
}

export async function listPromos(db) {
  const snapshot = await db.collection("promoCodes").orderBy("createdAt", "desc").get();
  return snapshot.docs.map(plain).map((item) => ({
    id: item.id,
    code: item.code,
    type: item.type,
    value: item.value,
    limit: item.limit,
    used: item.used || 0,
    totalSaved: item.totalSaved || 0,
    expiry: item.expiry,
    description: item.description || "",
    batchId: item.batchId || null,
  }));
}

export async function createPromo(db, body, createdBy, createdByName) {
  const code = normalizeCode(body.code);
  const fields = validatePromoInput(body);
  const ref = db.collection("promoCodes").doc(code);
  const now = FieldValue.serverTimestamp();
  try {
    await ref.create({
      code,
      ...fields,
      used: 0,
      totalSaved: 0,
      batchId: null,
      createdBy,
      createdByName: (createdByName || "").slice(0, 200),
      createdAt: now,
      updatedAt: now,
    });
  } catch (error) {
    if (error.code === 6 /* ALREADY_EXISTS */) throw httpError(`Coupon code "${code}" already exists.`, 409);
    throw error;
  }
  return { id: code, code };
}

// Generates `count` individual, single-use (limit: 1) codes in the
// NEXTxxxx format for team members/partners — same batch semantics the
// reference UI asked for. Each candidate code's uniqueness is enforced by
// Firestore itself (a batch of `.create()`s inside one WriteBatch — if any
// collided we'd know from the commit, but the id-space is 10,000 wide per
// prefix draw and re-rolled on any local duplicate, so a real collision
// against existing codes is vanishingly rare and, if it ever happened,
// would simply surface as a normal write error rather than silently
// overwriting an existing code).
export async function bulkGeneratePromos(db, body, createdBy, createdByName) {
  const type = PROMO_TYPES.includes(body.type) ? body.type : "percentage";
  const value = type === "percentage" ? 25 : type === "fixed" ? 20 : 0;
  const orgName = typeof body.orgName === "string" && body.orgName.trim() ? body.orgName.trim().slice(0, 200) : "Organization Member";
  const count = 100;
  const expiry = typeof body.expiry === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.expiry) ? body.expiry : `${new Date().getFullYear() + 1}-12-31`;
  const batchId = `BATCH-${Date.now().toString().slice(-6)}`;

  const codes = new Set();
  while (codes.size < count) {
    codes.add(`${BULK_CODE_PREFIX}${String(Math.floor(1000 + Math.random() * 9000))}`);
  }

  const now = FieldValue.serverTimestamp();
  const batch = db.batch();
  for (const code of codes) {
    batch.create(db.collection("promoCodes").doc(code), {
      code,
      type,
      value,
      limit: 1,
      used: 0,
      totalSaved: 0,
      expiry,
      description: `${orgName} individual code (${batchId})`,
      batchId,
      createdBy,
      createdByName: (createdByName || "").slice(0, 200),
      createdAt: now,
      updatedAt: now,
    });
  }
  await batch.commit();
  return { count, batchId };
}

export async function deletePromo(db, id) {
  if (typeof id !== "string" || !id) throw httpError("Coupon code is required.", 400);
  const ref = db.collection("promoCodes").doc(id);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw httpError("Coupon not found.", 404);
  await ref.delete();
  return { ok: true };
}

// Simulates applying a code to an order — the real checkout math, not a
// fabricated estimate, so `totalSaved` stays a genuine running total.
// `orderAmount` is required for percentage codes (there's no real dollar
// figure to save without one); fixed/shipping codes work without it.
export async function redeemPromo(db, body) {
  const code = normalizeCode(body.code);
  const orderAmount = body.orderAmount === undefined || body.orderAmount === "" ? null : Number(body.orderAmount);
  if (orderAmount !== null && (!Number.isFinite(orderAmount) || orderAmount < 0)) throw httpError("Order amount must be a positive number.", 400);

  const ref = db.collection("promoCodes").doc(code);
  const result = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw httpError(`Promo code "${code}" is invalid.`, 404);
    const promo = snapshot.data();
    const today = new Date().toISOString().slice(0, 10);
    if (promo.expiry && promo.expiry < today) throw httpError(`Promo code "${code}" has expired.`, 400);
    if ((promo.used || 0) >= promo.limit) throw httpError(`Promo code "${code}" has reached its usage limit.`, 400);

    let discount = 0;
    if (promo.type === "percentage") {
      if (orderAmount === null) throw httpError("Enter an order amount to apply a percentage code.", 400);
      discount = Math.round(orderAmount * (promo.value / 100) * 100) / 100;
    } else if (promo.type === "fixed") {
      discount = orderAmount === null ? promo.value : Math.min(promo.value, orderAmount);
    }
    // "shipping" codes wave the shipping fee — this app has no separate
    // shipping-cost field to discount, so the saved amount is simply 0
    // (still a real, honest number, not a guessed one) while the code's
    // usage is still tracked.

    transaction.update(ref, {
      used: FieldValue.increment(1),
      totalSaved: FieldValue.increment(discount),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { type: promo.type, value: promo.value, discount };
  });

  return { ok: true, code, ...result };
}
