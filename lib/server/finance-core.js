import { FieldValue } from "firebase-admin/firestore";
import { listAdmissions } from "./payment-core";
import { ensureUserId } from "./user-id";

const plain = (snapshot) => ({ id: snapshot.id, ...snapshot.data() });
const date = (value) => (value?.toDate ? value.toDate().toISOString() : typeof value === "string" ? value : null);

export const expenseCategories = [
  "Rent",
  "Salary",
  "Utilities",
  "Equipment",
  "Marketing",
  "Transport",
  "Maintenance",
  "Software",
  "Training Materials",
  "Other",
];
const paymentMethods = new Set(["Cash", "Bank Transfer", "Card", "Other"]);

// Manual academy income (Finance → Income). A completely separate ledger
// from student `payments` — this is GENERAL academy income only (donations,
// sponsorships, grants, room rental, book sales, etc.), never a student's
// tuition payment. Per-student tuition (Course Fee / Registration Fee /
// Training Fee tied to an actual enrollment) is deliberately NOT offered
// here: that money already flows through the student Payments system and
// counting it again as manual income would double-count it in Total Income
// / Revenue. This list's "Training" source is different — it's for
// training-related money that ISN'T a per-student tuition payment (e.g. a
// corporate/bulk training contract, a flat sponsorship of a batch), so it
// doesn't already exist in `payments` and logging it here is correct, not
// a double-count.
// Stored in its own `finance_income` collection; folded into the shared
// finance totals by buildFinanceOverview so the Dashboard / Profit & Loss /
// Transactions stay a single consistent calculation.
export const incomeSources = [
  "Donation",
  "Sponsorship",
  "Grant",
  "Event Income",
  "Workshop Income",
  "Training",
  "Room / Facility Rental",
  "Material / Book Sales",
  "Membership",
  "Other",
];
export const incomeStatuses = ["Paid", "Pending"];
// Superset of the expense methods, plus the two local mobile-wallet
// options the requirement calls for.
const incomePaymentMethods = new Set(["Cash", "Bank Transfer", "bKash", "Nagad", "Card", "Other"]);

async function resolveUserNames(db, uids) {
  const unique = [...new Set(uids.filter(Boolean))];
  if (!unique.length) return new Map();
  const docs = await db.getAll(...unique.map((id) => db.collection("users").doc(id)));
  return new Map(
    docs.map((snapshot) => [snapshot.id, snapshot.exists ? snapshot.data().displayName || snapshot.data().email || snapshot.id : snapshot.id]),
  );
}

function inRange(isoDate, from, to) {
  if (!isoDate) return !from && !to;
  if (from && isoDate < from) return false;
  if (to && isoDate > to) return false;
  return true;
}

// System-wide, flat payment list (not scoped to one training) — the data
// source for the Income/Payments tab, Transactions, and Profit & Loss.
// Reuses the exact same `payments` collection lib/server/payment-core.js
// already writes to; nothing new is stored here.
export async function listAllPayments(db, { from, to } = {}) {
  const snapshot = await db.collection("payments").get();
  const rows = snapshot.docs.map(plain).map((item) => ({ ...item, paymentDate: item.paymentDate || date(item.createdAt), createdAt: date(item.createdAt) }));
  const filtered = from || to ? rows.filter((item) => inRange(item.paymentDate, from, to)) : rows;

  // .filter(Boolean): a manual-invoice payment (lib/server/invoice-core.js)
  // legitimately has courseId: null — without this, db.collection(...).doc(null)
  // throws and takes down the whole Finance overview load.
  const courseIds = [...new Set(filtered.map((item) => item.courseId).filter(Boolean))];
  const studentIds = [...new Set(filtered.map((item) => item.studentId))];
  const creatorIds = [...new Set(filtered.map((item) => item.createdBy))];
  const enrollmentIds = [...new Set(filtered.map((item) => item.enrollmentId).filter(Boolean))];
  // Payments recorded against a manual invoice (lib/server/invoice-core.js)
  // carry invoiceId instead of enrollmentId/courseId — resolved here too so
  // they read as "Registration Fee" etc. instead of the enrollment-only
  // fallback "Untitled training" on this same shared Income/Payments and
  // Transactions data source.
  const invoiceIds = [...new Set(filtered.map((item) => item.invoiceId).filter(Boolean))];
  const [courseDocs, studentDocs, creatorNames, enrollmentDocs, invoiceDocs] = await Promise.all([
    courseIds.length ? db.getAll(...courseIds.map((id) => db.collection("courses").doc(id))) : [],
    studentIds.length ? db.getAll(...studentIds.map((id) => db.collection("users").doc(id))) : [],
    resolveUserNames(db, creatorIds),
    enrollmentIds.length ? db.getAll(...enrollmentIds.map((id) => db.collection("enrollments").doc(id))) : [],
    invoiceIds.length ? db.getAll(...invoiceIds.map((id) => db.collection("invoices").doc(id))) : [],
  ]);
  const courseMap = new Map(courseDocs.filter((d) => d.exists).map((d) => [d.id, plain(d)]));
  const invoiceMap = new Map(invoiceDocs.filter((d) => d.exists).map((d) => [d.id, plain(d)]));
  const students = studentDocs.filter((d) => d.exists).map(plain);
  // The Firebase UID must never reach the UI as a "User ID" — backfill any
  // student still missing their unified User ID before rendering.
  await Promise.all(
    students
      .filter((student) => !student.userId)
      .map((student) => ensureUserId(db, student.id).then((id) => { student.userId = id; })),
  );
  const studentMap = new Map(students.map((student) => [student.id, student]));
  const enrollmentMap = new Map(enrollmentDocs.filter((d) => d.exists).map((d) => [d.id, plain(d)]));

  return filtered
    .map((item) => {
      const course = courseMap.get(item.courseId);
      const student = studentMap.get(item.studentId);
      const invoice = invoiceMap.get(item.invoiceId);
      return {
        ...item,
        courseTitle: course?.title || invoice?.description || invoice?.invoiceType || "Untitled training",
        courseCode: course?.courseCode || item.courseId,
        studentName: student?.displayName || student?.email || "Unknown student",
        userId: student?.userId || "—",
        recordedByName: creatorNames.get(item.createdBy) || item.createdBy,
        finalFee: Number(enrollmentMap.get(item.enrollmentId)?.finalFee) || 0,
      };
    })
    .sort((left, right) => (right.paymentDate || "").localeCompare(left.paymentDate || "") || (right.createdAt || "").localeCompare(left.createdAt || ""));
}

export async function listExpenses(db, { from, to } = {}) {
  const snapshot = await db.collection("expenses").get();
  const rows = snapshot.docs.map(plain).map((item) => ({ ...item, expenseDate: item.expenseDate || date(item.createdAt), createdAt: date(item.createdAt) }));
  const filtered = from || to ? rows.filter((item) => inRange(item.expenseDate, from, to)) : rows;
  const creatorNames = await resolveUserNames(db, filtered.map((item) => item.createdBy));
  return filtered
    .map((item) => ({ ...item, recordedByName: creatorNames.get(item.createdBy) || item.createdBy }))
    .sort((left, right) => (right.expenseDate || "").localeCompare(left.expenseDate || "") || (right.createdAt || "").localeCompare(left.createdAt || ""));
}

// Manual income records, newest first — same shape/date-range handling as
// listExpenses. `recordedByName` prefers a live lookup, falling back to the
// name denormalised at write time so history stays readable even if the
// creator is later removed.
export async function listIncomeRecords(db, { from, to } = {}) {
  const snapshot = await db.collection("finance_income").get();
  const rows = snapshot.docs.map(plain).map((item) => ({
    ...item,
    date: item.date || date(item.createdAt),
    createdAt: date(item.createdAt),
    updatedAt: date(item.updatedAt),
  }));
  const filtered = from || to ? rows.filter((item) => inRange(item.date, from, to)) : rows;
  const creatorNames = await resolveUserNames(db, filtered.map((item) => item.createdBy));
  return filtered
    .map((item) => ({
      ...item,
      status: item.status === "Pending" ? "Pending" : "Paid",
      recordedByName: creatorNames.get(item.createdBy) || item.createdByName || item.createdBy || "—",
    }))
    .sort((left, right) => (right.date || "").localeCompare(left.date || "") || (right.createdAt || "").localeCompare(left.createdAt || ""));
}

function badRequest(message) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

function validateIncomeInput(body) {
  const incomeDate = typeof body.date === "string" && body.date.trim() ? body.date.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(incomeDate)) throw badRequest("Income date is required.");
  const source = typeof body.source === "string" ? body.source.trim() : "";
  if (!incomeSources.includes(source)) throw badRequest("Choose a valid income source.");
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw badRequest("Income amount must be greater than zero.");
  const paymentMethod = typeof body.paymentMethod === "string" ? body.paymentMethod : "";
  if (!incomePaymentMethods.has(paymentMethod)) throw badRequest("Choose a valid payment method.");
  const status = body.status === "Pending" ? "Pending" : "Paid";
  const trim = (value, max) => (typeof value === "string" ? value.trim().slice(0, max) : "");
  return {
    date: incomeDate,
    source,
    amount,
    currency: "SGD",
    paymentMethod,
    status,
    personId: trim(body.personId, 200),
    personName: trim(body.personName, 200),
    courseId: trim(body.courseId, 200),
    courseName: trim(body.courseName, 200),
    reference: trim(body.reference, 120),
    description: trim(body.description, 1000),
  };
}

export async function recordIncome(db, body, createdBy, createdByName) {
  try {
    const fields = validateIncomeInput(body);
    const ref = await db.collection("finance_income").add({
      ...fields,
      createdBy,
      createdByName: (createdByName || "").slice(0, 200),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { status: 201, body: { ok: true, id: ref.id } };
  } catch (error) {
    if (error.statusCode) return { status: error.statusCode, body: { message: error.message } };
    throw error;
  }
}

export async function updateIncomeRecord(db, id, body) {
  const ref = db.collection("finance_income").doc(id);
  const snapshot = await ref.get();
  if (!snapshot.exists) return { status: 404, body: { message: "Income record not found." } };
  try {
    const fields = validateIncomeInput(body);
    // createdAt / createdBy / createdByName are never touched on edit.
    await ref.update({ ...fields, updatedAt: FieldValue.serverTimestamp() });
    return { status: 200, body: { ok: true } };
  } catch (error) {
    if (error.statusCode) return { status: error.statusCode, body: { message: error.message } };
    throw error;
  }
}

export async function deleteIncomeRecord(db, id) {
  const ref = db.collection("finance_income").doc(id);
  const snapshot = await ref.get();
  if (!snapshot.exists) return { status: 404, body: { message: "Income record not found." } };
  await ref.delete();
  return { status: 200, body: { ok: true } };
}

function validateExpenseInput(body) {
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw Object.assign(new Error("Expense amount must be greater than zero."), { statusCode: 400 });
  const category = typeof body.category === "string" ? body.category.trim() : "";
  if (!category) throw Object.assign(new Error("Choose an expense category."), { statusCode: 400 });
  const paymentMethod = typeof body.paymentMethod === "string" ? body.paymentMethod : "";
  if (!paymentMethods.has(paymentMethod)) throw Object.assign(new Error("Choose a valid payment method."), { statusCode: 400 });
  const expenseDate = typeof body.expenseDate === "string" && body.expenseDate ? body.expenseDate : "";
  if (!expenseDate) throw Object.assign(new Error("Expense date is required."), { statusCode: 400 });
  return {
    amount,
    currency: "SGD",
    category,
    paymentMethod,
    expenseDate,
    description: typeof body.description === "string" ? body.description.trim().slice(0, 500) : "",
    reference: typeof body.reference === "string" ? body.reference.trim().slice(0, 120) : "",
  };
}

export async function recordExpense(db, body, createdBy) {
  try {
    const fields = validateExpenseInput(body);
    const ref = await db.collection("expenses").add({
      ...fields,
      status: "Recorded",
      createdBy,
      createdAt: FieldValue.serverTimestamp(),
    });
    return { status: 201, body: { ok: true, id: ref.id } };
  } catch (error) {
    if (error.statusCode) return { status: error.statusCode, body: { message: error.message } };
    throw error;
  }
}

export async function updateExpense(db, id, body) {
  const ref = db.collection("expenses").doc(id);
  const snapshot = await ref.get();
  if (!snapshot.exists) return { status: 404, body: { message: "Expense not found." } };
  try {
    const fields = validateExpenseInput(body);
    await ref.update({ ...fields, updatedAt: FieldValue.serverTimestamp() });
    return { status: 200, body: { ok: true } };
  } catch (error) {
    if (error.statusCode) return { status: error.statusCode, body: { message: error.message } };
    throw error;
  }
}

export async function deleteExpense(db, id) {
  const ref = db.collection("expenses").doc(id);
  const snapshot = await ref.get();
  if (!snapshot.exists) return { status: 404, body: { message: "Expense not found." } };
  await ref.delete();
  return { status: 200, body: { ok: true } };
}

// Single source of truth for every number the Finance module shows — the
// Dashboard, Transactions, and Profit & Loss pages all call this same
// function (optionally date-scoped) instead of recomputing totals their
// own way, per the "one consistent calculation" requirement.
export async function buildFinanceOverview(db, { from, to } = {}) {
  const [admissions, payments, expenses, income] = await Promise.all([
    listAdmissions(db),
    listAllPayments(db, { from, to }),
    listExpenses(db, { from, to }),
    listIncomeRecords(db, { from, to }),
  ]);

  // Outstanding due is a current-state snapshot (not date-ranged) — it
  // doesn't make sense to ask "what was due between two dates."
  const totalDue = admissions.reduce((sum, item) => sum + (Number(item.dueAmount) || 0), 0);
  const paymentsIncome = payments.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  // Only "Paid" manual income counts as realised revenue — "Pending" is a
  // receivable, surfaced separately so Net Profit is never inflated by
  // money that hasn't come in.
  const manualPaidIncome = income
    .filter((item) => item.status !== "Pending")
    .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const manualPendingIncome = income
    .filter((item) => item.status === "Pending")
    .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const totalIncome = paymentsIncome + manualPaidIncome;
  const totalExpenses = expenses.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

  return {
    admissions,
    payments,
    expenses,
    income,
    totals: {
      income: totalIncome,
      incomeFromPayments: paymentsIncome,
      incomeManual: manualPaidIncome,
      incomePending: manualPendingIncome,
      incomeRecordCount: income.length,
      due: totalDue,
      expenses: totalExpenses,
      netProfit: totalIncome - totalExpenses,
      paidCount: admissions.filter((item) => item.paymentStatus === "Paid").length,
      partialCount: admissions.filter((item) => item.paymentStatus === "Partial").length,
      unpaidCount: admissions.filter((item) => item.paymentStatus === "Unpaid").length,
    },
  };
}
