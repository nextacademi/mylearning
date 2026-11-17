import { createHash, randomInt } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { ACADEMY_INFO } from "../academy-info";
import { emailConfigured, sendEmail } from "../email";
import { isLearnerRole } from "../learner-roles";
import { cacheDel } from "../redis-cache";
import {
  EDUCATION_OPTIONS,
  RECEIPT_MAX_BYTES,
  REGISTRATION_EMAIL,
  REGISTRATION_LIMITS,
  REGISTRATION_STATUSES,
  paymentConfigured,
  validWhatsapp,
} from "../training-offer";
import { createEnrollment, loadCourseAndClass } from "./enrollment-core";
import { buildEnrollmentInvoicePdf, loadEnrollment } from "./enrollment-invoice";
import { recordPayment } from "./payment-core";
import { isAllowedPaymentMethod } from "./payment-methods";
import { getPaymentSettings, listCourses } from "./site-content-core";
import { singaporeDate } from "./singapore-date";
import { generateUserId } from "./user-id";

// Public "Training Registration" requests (homepage → Submit a Training
// Registration) and their Admin/Director review (Dashboard → Registrations).
//
// `trainingRegistrations/{id}` and `_rateLimits/{key}` are never listed in
// firestore.rules, so the catch-all deny keeps every client out — only the
// Admin SDK (these API routes) reads or writes them. Payment receipts live
// in Storage under trainingRegistrations/{id}/…, which storage.rules'
// catch-all also denies; admins view them through the API.
const COLLECTION = "trainingRegistrations";
const RATE_LIMIT = { max: 5, windowMs: 60 * 60 * 1000 };
const MIN_FILL_MS = 3000;
const LOCK_MS = 2 * 60 * 1000;

const httpError = (message, statusCode) => Object.assign(new Error(message), { statusCode });
const text = (value, max) => (typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "");
const iso = (value) => (value?.toDate ? value.toDate().toISOString() : typeof value === "string" ? value : null);
const plain = (snapshot) => ({ id: snapshot.id, ...snapshot.data() });

// ---------------------------------------------------------------------------
// Receipt files: the declared type is ignored; the first bytes decide.
// ---------------------------------------------------------------------------
function sniffReceipt(bytes) {
  const head = bytes.subarray(0, 16);
  const ascii = (start, end) => String.fromCharCode(...head.subarray(start, end));
  if (ascii(0, 5) === "%PDF-") return { contentType: "application/pdf", ext: "pdf" };
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return { contentType: "image/jpeg", ext: "jpg" };
  if (head[0] === 0x89 && ascii(1, 4) === "PNG") return { contentType: "image/png", ext: "png" };
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return { contentType: "image/webp", ext: "webp" };
  if (ascii(4, 8) === "ftyp" && /^(heic|heix|hevc|heim|heis|mif1|msf1)$/.test(ascii(8, 12))) return { contentType: "image/heic", ext: "heic" };
  return null;
}

function newReference(now = new Date()) {
  const ymd = singaporeDate(now).replace(/-/g, "").slice(2);
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const suffix = Array.from({ length: 4 }, () => alphabet[randomInt(alphabet.length)]).join("");
  return `TR-${ymd}-${suffix}`;
}

// At most RATE_LIMIT.max submissions per IP per hour. The IP is only ever
// stored as a salted hash.
export function hashIp(ip) {
  return createHash("sha256").update(`${process.env.FIREBASE_ADMIN_PROJECT_ID || "next-academy"}:${ip || "unknown"}`).digest("hex").slice(0, 32);
}

async function takeRateLimit(db, ipHash) {
  const ref = db.collection("_rateLimits").doc(`training-registration_${ipHash}`);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const now = Date.now();
    const data = snapshot.exists ? snapshot.data() : null;
    const fresh = !data || now - (data.windowStart || 0) > RATE_LIMIT.windowMs;
    const count = fresh ? 0 : data.count || 0;
    if (count >= RATE_LIMIT.max) throw httpError("Too many registrations from this connection. Please try again in an hour, or contact us on WhatsApp.", 429);
    transaction.set(ref, { windowStart: fresh ? now : data.windowStart, count: count + 1, updatedAt: FieldValue.serverTimestamp() });
  });
}

// ---------------------------------------------------------------------------
// Public submit
// ---------------------------------------------------------------------------
function person(raw, label, { requireName = true } = {}) {
  const value = {
    name: text(raw?.name, REGISTRATION_LIMITS.name),
    title: text(raw?.title, REGISTRATION_LIMITS.title),
    email: text(raw?.email, REGISTRATION_LIMITS.email).toLowerCase(),
    whatsapp: text(raw?.whatsapp, REGISTRATION_LIMITS.whatsapp),
  };
  if (requireName && value.name.length < 2) throw httpError(`Enter the ${label}'s full name.`, 400);
  if (!REGISTRATION_EMAIL.test(value.email)) throw httpError(`Enter a valid ${label} email address.`, 400);
  if (!validWhatsapp(value.whatsapp)) throw httpError(`Enter a valid ${label} WhatsApp number (8–15 digits).`, 400);
  return value;
}

export function validateSubmission(fields, courses) {
  const course = courses.find((item) => item.id === fields.courseId);
  if (!course) throw httpError("Choose a course from the list.", 400);
  const trainee = person(fields.trainee, "trainee");
  const sameAsTrainee = fields.sameAsTrainee === true;
  const requester = sameAsTrainee ? { ...trainee } : person(fields.requester, "requester");
  const education = EDUCATION_OPTIONS.includes(fields.education) ? fields.education : "";
  if (!education) throw httpError("Choose the latest education.", 400);
  return {
    course: { id: course.id, title: course.title, duration: course.duration, schedule: course.schedule, price: course.price },
    trainee,
    requester,
    sameAsTrainee,
    company: text(fields.company, REGISTRATION_LIMITS.company),
    education,
  };
}

// `fields` is the parsed JSON part of the form; `file` a web File (or null).
export async function submitRegistration(db, storage, { fields, file, ip, userAgent }) {
  // Honeypot: a hidden field real visitors never see. Bots that fill it get
  // a normal-looking success without anything being saved.
  if (text(fields?.website, 200)) return { ref: newReference(), ignored: true };
  const startedAt = Number(fields?.startedAt);
  if (!Number.isFinite(startedAt) || Date.now() - startedAt < MIN_FILL_MS) {
    throw httpError("Please take a moment to check your details, then submit again.", 400);
  }

  const [courses, payment] = await Promise.all([listCourses(db), getPaymentSettings(db)]);
  const clean = validateSubmission(fields || {}, courses);

  // A receipt is required once payment details are published on the form.
  const receiptRequired = paymentConfigured(payment);
  let receipt = null;
  if (file && file.size > 0) {
    if (file.size > RECEIPT_MAX_BYTES) throw httpError("The payment receipt must be 10 MB or smaller.", 413);
    const bytes = Buffer.from(await file.arrayBuffer());
    const kind = sniffReceipt(bytes);
    if (!kind) throw httpError("Upload the receipt as a PDF or an image (JPG, PNG, WEBP or HEIC).", 400);
    receipt = { bytes, ...kind, originalName: text(file.name, 120) || `receipt.${kind.ext}` };
  } else if (receiptRequired) {
    throw httpError("Upload your payment receipt (PDF or image).", 400);
  }

  const ipHash = hashIp(ip);
  await takeRateLimit(db, ipHash);

  const ref = db.collection(COLLECTION).doc();
  let storedReceipt = null;
  if (receipt) {
    const path = `${COLLECTION}/${ref.id}/receipt-${Date.now()}.${receipt.ext}`;
    await storage.bucket().file(path).save(receipt.bytes, { resumable: false, metadata: { contentType: receipt.contentType } });
    storedReceipt = { path, name: receipt.originalName, contentType: receipt.contentType, size: receipt.bytes.length };
  }

  const reference = newReference();
  try {
    await ref.set({
      ref: reference,
      status: "pending",
      ...clean,
      receipt: storedReceipt,
      ipHash,
      userAgent: text(userAgent, 300),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    if (storedReceipt) await storage.bucket().file(storedReceipt.path).delete().catch(() => {});
    throw error;
  }

  notifyManagers(db, { id: ref.id, name: clean.trainee.name, course: clean.course.title }).catch((error) => {
    console.error("[training-registration] failed to notify managers", { id: ref.id, code: error?.code || "unknown" });
  });
  return { ref: reference };
}

async function notifyManagers(db, { id, name, course }) {
  const snapshot = await db.collection("users").where("role", "in", ["Admin", "Director"]).get();
  if (snapshot.empty) return;
  const now = FieldValue.serverTimestamp();
  const batch = db.batch();
  snapshot.docs.forEach((userDoc) => {
    batch.set(db.collection("notifications").doc(), {
      userId: userDoc.id,
      type: "training-registration",
      title: "New training registration",
      body: `${name} registered for ${course}.`,
      entityId: id,
      actionUrl: null,
      readAt: null,
      createdAt: now,
    });
  });
  await batch.commit();
}

// ---------------------------------------------------------------------------
// Admin: list, receipt, batches
// ---------------------------------------------------------------------------
function toRow(item) {
  return {
    id: item.id,
    ref: item.ref || "",
    status: REGISTRATION_STATUSES.includes(item.status) ? item.status : "pending",
    course: item.course || {},
    trainee: item.trainee || {},
    requester: item.requester || {},
    sameAsTrainee: item.sameAsTrainee === true,
    company: item.company || "",
    education: item.education || "",
    receipt: item.receipt ? { name: item.receipt.name, contentType: item.receipt.contentType, size: item.receipt.size } : null,
    createdAt: iso(item.createdAt),
    approval: item.approval ? { ...item.approval, approvedAt: iso(item.approval.approvedAt) } : null,
    rejection: item.rejection ? { ...item.rejection, rejectedAt: iso(item.rejection.rejectedAt) } : null,
    email: item.email ? { ...item.email, at: iso(item.email.at) } : null,
  };
}

export async function listRegistrations(db) {
  const snapshot = await db.collection(COLLECTION).orderBy("createdAt", "desc").limit(1000).get();
  return snapshot.docs.map((doc) => toRow(plain(doc)));
}

export async function readReceipt(db, storage, id) {
  const snapshot = await db.collection(COLLECTION).doc(id).get();
  const receipt = snapshot.exists ? snapshot.data().receipt : null;
  if (!receipt?.path) throw httpError("No receipt was uploaded with this registration.", 404);
  const [bytes] = await storage.bucket().file(receipt.path).download();
  return { bytes, contentType: receipt.contentType || "application/octet-stream", name: receipt.name || "receipt" };
}

const HIDDEN_BATCH_STATUSES = new Set(["Archived", "Completed"]);

// Training batches an approved trainee can be enrolled into — the same
// `courses` docs the Training module manages.
export async function listBatches(db) {
  const snapshot = await db.collection("courses").get();
  return snapshot.docs
    .map(plain)
    .filter((course) => !HIDDEN_BATCH_STATUSES.has(course.status))
    .map((course) => {
      const price = Number(course.price) || 0;
      const discount = Math.min(Number(course.discountPrice) || 0, price);
      return {
        id: course.id,
        title: course.title || "Untitled training",
        batchName: course.batchName || "",
        category: course.category || "",
        status: course.status || "",
        startDate: course.startDate || "",
        endDate: course.endDate || "",
        fee: Math.max(0, price - discount),
      };
    })
    .sort((a, b) => (b.startDate || "").localeCompare(a.startDate || "") || a.title.localeCompare(b.title));
}

// ---------------------------------------------------------------------------
// Admin: approve / reject / resend
// ---------------------------------------------------------------------------
async function claim(db, ref) {
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw httpError("Registration not found.", 404);
    const data = snapshot.data();
    if (data.status !== "pending") throw httpError("This registration has already been processed. Refresh the list.", 409);
    const lockedAt = data.processingAt?.toMillis?.() || 0;
    if (Date.now() - lockedAt < LOCK_MS) throw httpError("Someone else is processing this registration right now. Try again in a minute.", 409);
    transaction.update(ref, { processingAt: FieldValue.serverTimestamp() });
    return data;
  });
}

// Finds the trainee's account by email, or creates one the same way
// Dashboard → Students → Add Student does (Auth user + users doc with a
// unified User ID, role Student). A new account has no password yet: the
// confirmation email carries a "set your password" link, and "Forgot
// password?" on the login page works too.
async function resolveStudent(db, auth, trainee, registrationId) {
  const email = trainee.email.toLowerCase();
  let authUser = null;
  try {
    authUser = await auth.getUserByEmail(email);
  } catch (error) {
    if (error?.code !== "auth/user-not-found") throw error;
  }

  if (authUser) {
    const profileSnap = await db.collection("users").doc(authUser.uid).get();
    if (profileSnap.exists) {
      const profile = profileSnap.data();
      if (!isLearnerRole(profile.role) && profile.role !== "Guest") {
        throw httpError(`${email} belongs to a ${profile.role || "staff"} account, so it can't be enrolled as a trainee.`, 409);
      }
      if (profile.active === false) throw httpError(`The account for ${email} is inactive. Reactivate it under User first.`, 409);
      return { uid: authUser.uid, userId: profile.userId || "", created: null };
    }
    await createStudentProfile(db, authUser.uid, trainee, email, registrationId);
    return { uid: authUser.uid, userId: "", created: { auth: false, profile: true } };
  }

  const createdUser = await auth.createUser({ email, displayName: trainee.name, disabled: false }).catch((error) => {
    if (error?.code === "auth/invalid-email") throw httpError(`Sign-in doesn't accept the email ${email}. Check it with the trainee, then reject this request and ask them to register again.`, 400);
    throw error;
  });
  try {
    const userId = await createStudentProfile(db, createdUser.uid, trainee, email, registrationId);
    return { uid: createdUser.uid, userId, created: { auth: true, profile: true } };
  } catch (error) {
    await auth.deleteUser(createdUser.uid).catch(() => {});
    throw error;
  }
}

async function createStudentProfile(db, uid, trainee, email, registrationId) {
  const userId = await generateUserId(db, new Date());
  const now = FieldValue.serverTimestamp();
  await db.collection("users").doc(uid).create({
    uid,
    userId,
    email,
    displayName: trainee.name,
    phone: trainee.whatsapp,
    photoURL: "",
    role: "Student",
    active: true,
    status: "active",
    teacherIds: [],
    source: "training-registration",
    registrationId,
    createdAt: now,
    updatedAt: now,
  });
  return userId;
}

async function rollbackStudent(db, auth, uid, created) {
  if (!created) return;
  await db.collection("users").doc(uid).delete().catch(() => {});
  if (created.auth) await auth.deleteUser(uid).catch(() => {});
}

// input: { courseId, recordPayment?: { amount, method, reference? }, sendEmail? }
export async function approveRegistration({ db, auth, id, input, actor, origin }) {
  const ref = db.collection(COLLECTION).doc(id);
  const courseId = typeof input?.courseId === "string" ? input.courseId.trim() : "";
  if (!courseId || courseId.includes("/")) throw httpError("Choose the training batch to enroll into.", 400);

  const payment = input?.recordPayment;
  if (payment) {
    const amount = Number(payment.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw httpError("Enter the amount received, or untick “Record the payment”.", 400);
    if (!(await isAllowedPaymentMethod(db, payment.method))) throw httpError("Choose a valid payment method.", 400);
  }

  const registration = await claim(db, ref);
  let student = null;
  try {
    const loaded = await loadCourseAndClass(db, courseId);
    if (loaded.error) throw httpError(loaded.error.message, loaded.error.status);
    const { course, classDoc } = loaded;

    student = await resolveStudent(db, auth, registration.trainee, id);
    const enrolled = await createEnrollment(db, course, classDoc, student.uid);
    if (enrolled.status !== 201) throw httpError(enrolled.body.message || "Unable to enroll this trainee.", enrolled.status);
    // The account now has an enrollment, so it is never rolled back.
    student = { ...student, created: null, accountCreated: Boolean(student.created?.auth) };
    await cacheDel("admin-students:list");

    let paymentResult = null;
    if (payment) {
      const recorded = await recordPayment(db, {
        courseId: course.id,
        studentId: student.uid,
        amount: Number(payment.amount),
        paymentMethod: payment.method,
        paymentDate: singaporeDate(),
        reference: text(payment.reference, 120) || registration.ref || "",
        notes: `Training registration ${registration.ref || id} — payment receipt uploaded by the trainee.`,
        createdBy: actor.uid,
      }).catch((error) => ({ status: 500, body: { message: error?.message || "The payment could not be recorded." } }));
      paymentResult = recorded.status === 201
        ? { recorded: true, amount: Number(payment.amount), method: payment.method, paymentId: recorded.body.paymentId }
        : { recorded: false, error: recorded.body.message || "The payment could not be recorded." };
    }

    const approval = {
      courseId: course.id,
      batchTitle: course.title || "",
      batchName: course.batchName || "",
      studentId: student.uid,
      studentUserId: student.userId || "",
      accountCreated: student.accountCreated,
      enrollmentId: enrolled.body.enrollmentId,
      invoiceNumber: enrolled.body.invoiceNumber || "",
      finalFee: enrolled.body.finalFee ?? 0,
      payment: paymentResult,
      approvedBy: actor.uid,
      approvedByName: actor.name || "",
      approvedAt: FieldValue.serverTimestamp(),
    };
    await ref.update({ status: "approved", approval, processingAt: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() });

    const email = input?.sendEmail === false
      ? { status: "skipped", message: "Email not sent (unticked when approving)." }
      : await sendConfirmation({ db, auth, id, origin });
    return { ok: true, approval: { ...approval, approvedAt: new Date().toISOString() }, email };
  } catch (error) {
    if (student?.created) await rollbackStudent(db, auth, student.uid, student.created);
    await ref.update({ processingAt: FieldValue.delete() }).catch(() => {});
    throw error;
  }
}

export async function rejectRegistration({ db, id, reason, actor }) {
  const ref = db.collection(COLLECTION).doc(id);
  await claim(db, ref);
  await ref.update({
    status: "rejected",
    rejection: { reason: text(reason, 500), rejectedBy: actor.uid, rejectedByName: actor.name || "", rejectedAt: FieldValue.serverTimestamp() },
    processingAt: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Confirmation email + invoice PDF
// ---------------------------------------------------------------------------
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
const sgd = (value) => `S$${(Number(value) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function formatDay(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
  if (!match) return "";
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toLocaleDateString("en-SG", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function formatTime(value) {
  const match = /^(\d{1,2}):(\d{2})/.exec(value || "");
  if (!match) return "";
  const hours = Number(match[1]);
  return `${((hours + 11) % 12) + 1}:${match[2]} ${hours < 12 ? "AM" : "PM"}`;
}

async function passwordLink(auth, email, baseUrl) {
  try {
    return await auth.generatePasswordResetLink(email, { url: `${baseUrl}/login` });
  } catch {
    try {
      return await auth.generatePasswordResetLink(email);
    } catch {
      return null;
    }
  }
}

function buildConfirmationEmail({ registration, course, invoice, baseUrl, setPasswordUrl }) {
  const trainee = registration.trainee;
  const first = trainee.name.split(" ")[0] || trainee.name;
  const when = [formatDay(course.startDate), [formatTime(course.startTime), formatTime(course.endTime)].filter(Boolean).join(" – ")].filter(Boolean).join(", ");
  const where = [course.campus, course.building, course.room].filter(Boolean).join(", ");
  const details = [
    ["Reference", registration.ref],
    ["Course", registration.course?.title],
    ["Training batch", [course.title, course.batchName].filter(Boolean).join(" · ")],
    ["Schedule", registration.course?.schedule],
    ["Starts", when],
    ["Venue", where],
    ["Invoice", invoice.invoiceNumber],
    ["Total fee", sgd(invoice.finalFee)],
    ["Paid", sgd(invoice.totalPaid)],
    ["Balance due", sgd(invoice.dueAmount)],
  ].filter(([, value]) => value);
  const loginUrl = `${baseUrl}/login`;
  const account = setPasswordUrl
    ? `Your Next Academy student account has been created for ${trainee.email}. Set your password here to sign in: ${setPasswordUrl}`
    : `Sign in to Next Academy with ${trainee.email} at ${loginUrl}. New here or forgot your password? Use "Forgot password?" on the sign-in page.`;
  const subject = `Registration confirmed: ${registration.course?.title || course.title} — Next Academy`;

  const textBody = [
    `Hi ${first},`,
    "",
    `Your training registration has been approved and you are enrolled. Your invoice (${invoice.invoiceNumber}) is attached as a PDF.`,
    "",
    ...details.map(([label, value]) => `${label}: ${value}`),
    "",
    account,
    "",
    `Questions? Reply to this email or write to ${ACADEMY_INFO.email}.`,
    "",
    ACADEMY_INFO.legalName,
    ...ACADEMY_INFO.addressLines,
  ].join("\n");

  const rows = details
    .map(([label, value]) => `<tr><td style="padding:6px 12px 6px 0;color:#6b7280;font-size:13px;white-space:nowrap">${escapeHtml(label)}</td><td style="padding:6px 0;color:#111827;font-size:13px;font-weight:600">${escapeHtml(value)}</td></tr>`)
    .join("");
  const button = (href, label) => `<a href="${escapeHtml(href)}" style="display:inline-block;background:#e31b23;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:10px">${escapeHtml(label)}</a>`;
  const html = `<!doctype html><html><body style="margin:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:24px 12px">
<div style="background:#e31b23;color:#ffffff;border-radius:16px 16px 0 0;padding:22px 24px">
<div style="font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;opacity:.85">Next Academy</div>
<div style="font-size:22px;font-weight:800;margin-top:6px">Registration confirmed</div>
</div>
<div style="background:#ffffff;border-radius:0 0 16px 16px;padding:24px">
<p style="margin:0 0 12px;color:#111827;font-size:15px">Hi ${escapeHtml(first)},</p>
<p style="margin:0 0 18px;color:#374151;font-size:14px;line-height:22px">Your training registration has been approved and you are enrolled. Your invoice <b>${escapeHtml(invoice.invoiceNumber)}</b> is attached as a PDF.</p>
<table style="border-collapse:collapse;margin:0 0 20px">${rows}</table>
<p style="margin:0 0 14px;color:#374151;font-size:14px;line-height:22px">${setPasswordUrl ? `Your student account has been created for <b>${escapeHtml(trainee.email)}</b>. Set your password to sign in:` : `Sign in with <b>${escapeHtml(trainee.email)}</b>. New here or forgot your password? Use “Forgot password?” on the sign-in page.`}</p>
<p style="margin:0 0 22px">${setPasswordUrl ? button(setPasswordUrl, "Set your password") : button(loginUrl, "Sign in")}</p>
<p style="margin:0;color:#6b7280;font-size:12px;line-height:18px">Questions? Reply to this email or write to ${escapeHtml(ACADEMY_INFO.email)}.<br>${escapeHtml(ACADEMY_INFO.legalName)} · ${ACADEMY_INFO.addressLines.map(escapeHtml).join(", ")}</p>
</div></div></body></html>`;
  return { subject, text: textBody, html };
}

// Sends (or re-sends) the confirmation email with the invoice PDF for an
// approved registration and records the outcome on the request. Never
// reports "sent" unless Resend accepted the message.
export async function sendConfirmation({ db, auth, id, origin }) {
  const ref = db.collection(COLLECTION).doc(id);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw httpError("Registration not found.", 404);
  const registration = snapshot.data();
  if (registration.status !== "approved" || !registration.approval?.enrollmentId) throw httpError("Only an approved registration has a confirmation to send.", 400);

  let result;
  if (!emailConfigured()) {
    result = { status: "not_configured", message: "Email is not set up on the server (RESEND_API_KEY and RESEND_FROM_EMAIL are missing), so nothing was sent." };
  } else {
    try {
      const enrollment = await loadEnrollment(db, registration.approval.enrollmentId);
      if (!enrollment) throw new Error("The enrollment for this registration no longer exists.");
      const invoice = await buildEnrollmentInvoicePdf(db, enrollment, { origin });
      const courseSnap = await db.collection("courses").doc(registration.approval.courseId).get();
      const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || origin || `https://${ACADEMY_INFO.website}`).replace(/\/$/, "");
      const setPasswordUrl = registration.approval.accountCreated ? await passwordLink(auth, registration.trainee.email, baseUrl) : null;
      const message = buildConfirmationEmail({ registration, course: courseSnap.exists ? courseSnap.data() : {}, invoice, baseUrl, setPasswordUrl });
      const to = [registration.trainee.email];
      const cc = registration.requester?.email && registration.requester.email !== registration.trainee.email ? [registration.requester.email] : [];
      const messageId = await sendEmail({
        to,
        cc,
        replyTo: ACADEMY_INFO.email,
        ...message,
        attachments: [{ filename: invoice.filename, content: Buffer.from(invoice.bytes) }],
      });
      result = { status: "sent", message: `Sent to ${[...to, ...cc].join(", ")} with invoice ${invoice.invoiceNumber}.`, to: [...to, ...cc], messageId: messageId || "" };
    } catch (error) {
      console.error("[training-registration] confirmation email failed", { id, message: error?.message });
      result = { status: "failed", message: `The email could not be sent: ${error?.message || "unknown error"}` };
    }
  }
  await ref.update({ email: { ...result, at: FieldValue.serverTimestamp() }, updatedAt: FieldValue.serverTimestamp() });
  return result;
}

