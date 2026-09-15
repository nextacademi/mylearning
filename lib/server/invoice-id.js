import { FieldValue } from "firebase-admin/firestore";

// Human-readable invoice number — INV-2026-00125. Same `_counters` +
// transaction pattern already used for certificate codes (lib/server/
// certificate-core.js) and course codes elsewhere in lib/server/* — one
// shared counter per year (not per course), since invoices are meant to
// read as one continuous academy-wide sequence, the way real invoice
// numbering conventionally works. `_counters/**` is already covered by
// firestore.rules' catch-all `match /{document=**} { allow read, write: if
// false; }` deny, so only the Admin SDK can ever touch it — no rules
// change needed.
async function nextInvoiceNumber(db, year) {
  const ref = db.collection("_counters").doc(`invoices_${year}`);
  const sequence = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const next = (snapshot.data()?.lastNumber || 0) + 1;
    transaction.set(ref, { lastNumber: next, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return next;
  });
  return `INV-${year}-${String(sequence).padStart(5, "0")}`;
}

// Idempotent — mirrors ensureUserId's shape. Enrollments created going
// forward already get an invoiceNumber at creation time (see
// createEnrollment in lib/server/enrollment-core.js); this is the lazy
// backfill path for enrollments that predate that (satisfies "old data
// must keep working, never duplicate an invoice" — calling this twice on
// the same enrollment returns its existing number, never mints a second
// one).
export async function ensureInvoiceNumber(db, enrollmentRef, enrollmentData) {
  if (enrollmentData.invoiceNumber) return enrollmentData.invoiceNumber;
  const enrolledYear = enrollmentData.enrolledAt?.toDate?.().getFullYear() || new Date().getFullYear();
  const invoiceNumber = await nextInvoiceNumber(db, enrolledYear);
  await enrollmentRef.update({ invoiceNumber, updatedAt: FieldValue.serverTimestamp() });
  return invoiceNumber;
}
