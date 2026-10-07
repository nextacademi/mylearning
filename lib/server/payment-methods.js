import { FieldValue } from "firebase-admin/firestore";

// The ONE admin-editable list of payment methods (Finance → Payment
// Methods), stored at settings/paymentMethods. Every place that records
// money — manual income, expenses, invoice payments, enrollment payments —
// validates against this same list, and every dropdown reads it through
// /api/payment-methods. Until an admin saves their own list, the Singapore
// defaults apply.
export const DEFAULT_PAYMENT_METHODS = ["Cash", "PayNow", "Bank Transfer", "NETS", "Card", "Cheque", "Other"];
const MAX_METHODS = 20;
const MAX_LENGTH = 40;

const ref = (db) => db.collection("settings").doc("paymentMethods");

export async function getPaymentMethods(db) {
  const snapshot = await ref(db).get();
  const methods = snapshot.exists ? snapshot.data().methods : null;
  return Array.isArray(methods) && methods.length ? methods : DEFAULT_PAYMENT_METHODS;
}

// A method is acceptable if it's on the current list — or, when editing an
// existing record, if it's that record's own stored value left unchanged
// (so removing "Cheque" from the list never makes old cheque records
// un-editable).
export async function isAllowedPaymentMethod(db, method, storedMethod = "") {
  if (typeof method !== "string" || !method) return false;
  if (storedMethod && method === storedMethod) return true;
  return (await getPaymentMethods(db)).includes(method);
}

export async function savePaymentMethods(db, input, updatedBy) {
  if (!Array.isArray(input)) throw Object.assign(new Error("Send a list of payment methods."), { statusCode: 400 });
  const seen = new Set();
  const methods = [];
  for (const raw of input) {
    const name = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
    if (!name) continue;
    if (name.length > MAX_LENGTH) throw Object.assign(new Error(`Keep each payment method under ${MAX_LENGTH} characters.`), { statusCode: 400 });
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    methods.push(name);
  }
  if (!methods.length) throw Object.assign(new Error("Keep at least one payment method."), { statusCode: 400 });
  if (methods.length > MAX_METHODS) throw Object.assign(new Error(`Up to ${MAX_METHODS} payment methods.`), { statusCode: 400 });
  await ref(db).set({ methods, updatedBy, updatedAt: FieldValue.serverTimestamp() });
  return methods;
}
