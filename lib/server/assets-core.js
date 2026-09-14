import { FieldValue } from "firebase-admin/firestore";

const plain = (snapshot) => ({ id: snapshot.id, ...snapshot.data() });
const date = (value) => (value?.toDate ? value.toDate().toISOString() : typeof value === "string" ? value : null);

// A physical/capital asset register (Finance → Assets) — "what do we own
// and what is it worth", separate from `expenses` (money spent) and
// `finance_income` (money received). Buying a batch of chairs is both: it
// shows up here as an owned asset with a value, and — if the academy also
// wants it in Profit & Loss — gets logged separately as an Equipment
// expense. Keeping the two collections independent means this register
// never has to agree with or distort the P&L calculation in
// buildFinanceOverview.
export const assetCategories = [
  "Furniture",
  "Equipment",
  "Technology",
  "Deposit",
  "Renovation",
  "Other",
];
export const assetStatuses = ["Active", "Disposed"];

async function resolveUserNames(db, uids) {
  const unique = [...new Set(uids.filter(Boolean))];
  if (!unique.length) return new Map();
  const docs = await db.getAll(...unique.map((id) => db.collection("users").doc(id)));
  return new Map(
    docs.map((snapshot) => [snapshot.id, snapshot.exists ? snapshot.data().displayName || snapshot.data().email || snapshot.id : snapshot.id]),
  );
}

export async function listAssets(db) {
  const snapshot = await db.collection("assets").get();
  const rows = snapshot.docs.map(plain).map((item) => ({
    ...item,
    purchaseDate: item.purchaseDate || date(item.createdAt),
    createdAt: date(item.createdAt),
    updatedAt: date(item.updatedAt),
  }));
  const creatorNames = await resolveUserNames(db, rows.map((item) => item.createdBy));
  return rows
    .map((item) => ({ ...item, recordedByName: creatorNames.get(item.createdBy) || item.createdBy || "—" }))
    .sort((left, right) => (right.purchaseDate || "").localeCompare(left.purchaseDate || "") || (right.createdAt || "").localeCompare(left.createdAt || ""));
}

function badRequest(message) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

function validateAssetInput(body) {
  const itemName = typeof body.itemName === "string" ? body.itemName.trim().slice(0, 160) : "";
  if (!itemName) throw badRequest("Item name is required.");
  const category = typeof body.category === "string" ? body.category.trim() : "";
  if (!assetCategories.includes(category)) throw badRequest("Choose a valid asset category.");
  const quantity = Number(body.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) throw badRequest("Quantity must be greater than zero.");
  const unitCost = Number(body.unitCost);
  if (!Number.isFinite(unitCost) || unitCost < 0) throw badRequest("Unit cost must be zero or greater.");
  const purchaseDate = typeof body.purchaseDate === "string" && body.purchaseDate ? body.purchaseDate : "";
  if (!purchaseDate) throw badRequest("Purchase date is required.");
  const status = assetStatuses.includes(body.status) ? body.status : "Active";
  return {
    itemName,
    category,
    quantity,
    unitCost,
    // Computed server-side — never trust a client-submitted total.
    totalValue: Math.round(quantity * unitCost * 100) / 100,
    currency: "SGD",
    purchaseDate,
    status,
    description: typeof body.description === "string" ? body.description.trim().slice(0, 500) : "",
    reference: typeof body.reference === "string" ? body.reference.trim().slice(0, 120) : "",
  };
}

export async function recordAsset(db, body, createdBy) {
  try {
    const fields = validateAssetInput(body);
    const ref = await db.collection("assets").add({
      ...fields,
      createdBy,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { status: 201, body: { ok: true, id: ref.id } };
  } catch (error) {
    if (error.statusCode) return { status: error.statusCode, body: { message: error.message } };
    throw error;
  }
}

export async function updateAsset(db, id, body) {
  const ref = db.collection("assets").doc(id);
  const snapshot = await ref.get();
  if (!snapshot.exists) return { status: 404, body: { message: "Asset not found." } };
  try {
    const fields = validateAssetInput(body);
    await ref.update({ ...fields, updatedAt: FieldValue.serverTimestamp() });
    return { status: 200, body: { ok: true } };
  } catch (error) {
    if (error.statusCode) return { status: error.statusCode, body: { message: error.message } };
    throw error;
  }
}

export async function deleteAsset(db, id) {
  const ref = db.collection("assets").doc(id);
  const snapshot = await ref.get();
  if (!snapshot.exists) return { status: 404, body: { message: "Asset not found." } };
  await ref.delete();
  return { status: 200, body: { ok: true } };
}
