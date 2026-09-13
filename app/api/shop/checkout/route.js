import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "../../../../lib/firebase-admin";
import { getCachedUserSnapshot } from "../../../../lib/server/cached-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function access(request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { denied: NextResponse.json({ message: "Sign in to continue." }, { status: 401 }) };
  const db = getAdminDb();
  const decoded = await getAdminAuth().verifyIdToken(token);
  const profile = await getCachedUserSnapshot(db, decoded.uid);
  const data = profile.data() || {};
  if (!profile.exists || data.active === false) {
    return { denied: NextResponse.json({ message: "Account access is required." }, { status: 403 }) };
  }
  return { db, uid: decoded.uid, profile: data };
}

// Real, sequential, human-readable order number — same `_counters`
// transaction pattern already used for course/certificate codes elsewhere
// in this app, done inside the SAME checkout transaction so it's never
// issued twice or skipped on a failed order. Split into a read and a
// separate write (rather than one function doing both) because Firestore
// transactions require every `get()` across the whole transaction to
// happen before any `set()`/`update()` — the counter's read must join the
// other reads batched up front, and its write must join the other writes
// at the end, never interleaved with them.
const orderCounterRef = (db) => db.collection("_counters").doc("orders");
function formatOrderNumber(counterSnapshot) {
  const next = (counterSnapshot.data()?.lastOrderNumber || 0) + 1;
  return { next, orderNumber: `ORD-${String(next).padStart(6, "0")}` };
}

const phonePattern = /^[0-9+\-\s()]{6,20}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Runs the whole checkout — stock check, stock decrement, and order
// creation — inside one transaction, exactly like /api/events/register's
// capacity check, so two simultaneous buyers can never both succeed
// against a stale stock count and oversell a product. Firestore rules
// deny any direct client write to `products` (stock) or `orders`
// (create) specifically so this is the only path either can ever change
// through — see firestore.rules' comments on both collections.
export async function POST(request) {
  try {
    const a = await access(request);
    if (a.denied) return a.denied;

    const body = await request.json().catch(() => ({}));
    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length) return NextResponse.json({ message: "Your cart is empty." }, { status: 400 });

    const cleanItems = items
      .map((item) => ({
        productId: typeof item?.productId === "string" ? item.productId : "",
        quantity: Number(item?.quantity),
        // Never blindly trusted — re-validated against the product's real
        // variants array (read fresh, inside the transaction) below.
        variantId: typeof item?.variantId === "string" && item.variantId ? item.variantId : "",
      }))
      .filter((item) => item.productId && Number.isInteger(item.quantity) && item.quantity > 0);
    if (!cleanItems.length) return NextResponse.json({ message: "Your cart is empty." }, { status: 400 });

    // Customer/collection/notes are only ever sent by the new single-
    // product "Place Your Order" flow — the existing multi-item cart
    // checkout call site never sends them, so every one of these stays
    // fully optional and the cart flow's exact previous behavior/shape is
    // unchanged when they're absent.
    const customerName = typeof body.customerName === "string" ? body.customerName.trim().slice(0, 120) : "";
    const customerPhone = typeof body.customerPhone === "string" ? body.customerPhone.trim().slice(0, 30) : "";
    const customerEmail = typeof body.customerEmail === "string" ? body.customerEmail.trim().slice(0, 200) : "";
    if (customerPhone && !phonePattern.test(customerPhone)) return NextResponse.json({ message: "Enter a valid mobile number." }, { status: 400 });
    if (customerEmail && !emailPattern.test(customerEmail)) return NextResponse.json({ message: "Enter a valid email address." }, { status: 400 });
    const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 1000) : "";
    // A plain customer-entered collection date — not tied to a specific
    // Class Session record. Validated as a real, well-formed calendar date
    // string (never a fabricated default) and never a date in the past.
    const collectionDate = typeof body.collectionDate === "string" ? body.collectionDate.trim() : "";
    if (collectionDate) {
      const parsed = new Date(`${collectionDate}T00:00:00`);
      const today = new Date().toISOString().slice(0, 10);
      if (Number.isNaN(parsed.getTime()) || collectionDate < today) {
        return NextResponse.json({ message: "Choose a valid collection date." }, { status: 400 });
      }
    }

    const orderRef = a.db.collection("orders").doc();
    const result = await a.db.runTransaction(async (transaction) => {
      // All reads for this transaction, gathered up front — Firestore
      // requires every read to happen before any write.
      const productRefs = cleanItems.map((item) => a.db.collection("products").doc(item.productId));
      const [productSnapshots, counterSnapshot] = await Promise.all([
        Promise.all(productRefs.map((ref) => transaction.get(ref))),
        transaction.get(orderCounterRef(a.db)),
      ]);
      const { next: nextCounterValue, orderNumber } = formatOrderNumber(counterSnapshot);

      const orderItems = [];
      let totalAmount = 0;
      for (let i = 0; i < cleanItems.length; i++) {
        const snapshot = productSnapshots[i];
        const { quantity: requested, variantId } = cleanItems[i];
        if (!snapshot.exists) return { status: 404, body: { message: "One of the items in your cart no longer exists." } };
        const product = snapshot.data();
        if (product.active === false) return { status: 400, body: { message: `${product.name} is no longer available.` } };

        const variants = Array.isArray(product.variants) ? product.variants : [];
        if (variants.length) {
          // This product has real size/variant records — a size selection
          // is required, and it must be one that actually exists on the
          // product, never assumed from the product name.
          if (!variantId) return { status: 400, body: { message: `Please select a size for ${product.name}.` } };
          const variantIndex = variants.findIndex((v) => v.id === variantId);
          if (variantIndex === -1) return { status: 400, body: { message: `The selected size for ${product.name} is no longer available.` } };
          const variant = variants[variantIndex];
          if ((variant.stock || 0) < requested) {
            return { status: 409, body: { message: `Only ${variant.stock || 0} item(s) available in size ${variant.label}.` } };
          }
          const updatedVariants = variants.map((v, index) => (index === variantIndex ? { ...v, stock: v.stock - requested } : v));
          transaction.update(productRefs[i], {
            variants: updatedVariants,
            stock: updatedVariants.reduce((sum, v) => sum + v.stock, 0),
            updatedAt: FieldValue.serverTimestamp(),
          });
          orderItems.push({ productId: snapshot.id, name: product.name, price: product.price, quantity: requested, variantId, variantLabel: variant.label });
        } else {
          if ((product.stock || 0) < requested) return { status: 409, body: { message: `Not enough stock for ${product.name}. Only ${product.stock || 0} left.` } };
          transaction.update(productRefs[i], { stock: FieldValue.increment(-requested), updatedAt: FieldValue.serverTimestamp() });
          orderItems.push({ productId: snapshot.id, name: product.name, price: product.price, quantity: requested });
        }
        totalAmount += product.price * requested;
      }

      transaction.set(orderRef, {
        orderNumber,
        buyerId: a.uid,
        buyerName: a.profile.displayName || a.profile.email || a.uid,
        buyerEmail: a.profile.email || "",
        buyerRole: a.profile.role || "",
        customerName: customerName || a.profile.displayName || "",
        customerPhone: customerPhone || a.profile.phone || "",
        customerEmail: customerEmail || a.profile.email || "",
        notes,
        collectionDate,
        items: orderItems,
        totalAmount,
        status: "pending",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.set(orderCounterRef(a.db), { lastOrderNumber: nextCounterValue, updatedAt: FieldValue.serverTimestamp() }, { merge: true });

      return { status: 201, body: { ok: true, orderId: orderRef.id, orderNumber, totalAmount } };
    });

    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    console.error("[shop-checkout-api] failed", { code: error?.code || "unknown", message: error?.message || "unknown" });
    return NextResponse.json({ message: "Unable to complete your order. Please try again." }, { status: 500 });
  }
}
