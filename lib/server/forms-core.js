import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { DEFAULT_SCALE, MAX_OPTIONS, MAX_QUESTIONS, OPTION_TYPES, OTHER_PREFIX, OTHER_TYPES, QUESTION_TYPES } from "../forms-shared";

// `forms` holds the form definition; `formResponses` holds one doc per
// (form, student) — the doc id is `${formId}_${uid}`, so a student can only
// submit once and "who filled this in" is a plain query by formId. Both
// collections are server-SDK-only (firestore.rules denies direct client access).
const plain = (snapshot) => ({ id: snapshot.id, ...snapshot.data() });
const httpError = (message, statusCode) => Object.assign(new Error(message), { statusCode });
const str = (value, max) => (typeof value === "string" ? value.trim().slice(0, max) : "");

function cleanQuestions(raw) {
  if (!Array.isArray(raw) || !raw.length) throw httpError("Add at least one question.", 400);
  if (raw.length > MAX_QUESTIONS) throw httpError(`A form can have at most ${MAX_QUESTIONS} questions.`, 400);
  const ids = new Set();
  return raw.map((q, index) => {
    const type = QUESTION_TYPES.some((t) => t.id === q?.type) ? q.type : "";
    const label = str(q?.label, 300);
    if (!type || !label) throw httpError(`Question ${index + 1} needs a title.`, 400);
    const id = /^[A-Za-z0-9_-]{1,40}$/.test(q.id) && !ids.has(q.id) ? q.id : `q${index + 1}x${Math.random().toString(36).slice(2, 6)}`;
    ids.add(id);
    let options = [];
    if (OPTION_TYPES.includes(type)) {
      options = [...new Set((Array.isArray(q.options) ? q.options : []).map((o) => str(o, 200)).filter(Boolean))].slice(0, MAX_OPTIONS);
      if (options.length < 2) throw httpError(`Question ${index + 1} needs at least two options.`, 400);
    }
    const scale = { ...DEFAULT_SCALE };
    if (type === "scale") {
      const min = Number(q.scale?.min) === 0 ? 0 : 1;
      const max = Math.min(10, Math.max(2, Math.round(Number(q.scale?.max)) || DEFAULT_SCALE.max));
      Object.assign(scale, { min, max, lowLabel: str(q.scale?.lowLabel, 60), highLabel: str(q.scale?.highLabel, 60) });
    }
    return { id, type, label, help: str(q.help, 500), required: q.required === true, options, other: OTHER_TYPES.includes(type) && q.other === true, scale };
  });
}

export async function listForms(db) {
  const snapshot = await db.collection("forms").orderBy("createdAt", "desc").get();
  return snapshot.docs.map(plain);
}

export async function saveForm(db, body, uid, createdByName) {
  const title = str(body.title, 200);
  if (!title) throw httpError("Give the form a title.", 400);
  const data = {
    title,
    description: str(body.description, 2000),
    confirmation: str(body.confirmation, 500),
    questions: cleanQuestions(body.questions),
    updatedAt: new Date().toISOString(),
  };
  if (body.id) {
    const ref = db.collection("forms").doc(String(body.id));
    if (!(await ref.get()).exists) throw httpError("This form no longer exists.", 404);
    await ref.update(data);
    return { id: ref.id };
  }
  const ref = await db.collection("forms").add({
    ...data, status: "open", responseCount: 0, createdBy: uid, createdByName, createdAt: new Date().toISOString(),
  });
  return { id: ref.id };
}

export async function setFormStatus(db, id, status) {
  if (!["open", "closed"].includes(status)) throw httpError("Invalid status.", 400);
  await db.collection("forms").doc(String(id)).update({ status, updatedAt: new Date().toISOString() });
  return { ok: true };
}

export async function deleteForm(db, id) {
  const responses = await db.collection("formResponses").where("formId", "==", String(id)).get();
  for (let i = 0; i < responses.docs.length; i += 400) {
    const batch = db.batch();
    responses.docs.slice(i, i + 400).forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }
  await db.collection("forms").doc(String(id)).delete();
  return { ok: true };
}

export async function listResponses(db, id) {
  const snapshot = await db.collection("formResponses").where("formId", "==", String(id)).get();
  return snapshot.docs.map(plain).sort((a, b) => (b.submittedAt || "").localeCompare(a.submittedAt || ""));
}

// What a student sees: the questions, whether the form is open, and whether
// they've already filled it in.
export async function getFormForStudent(db, id, uid) {
  const snap = await db.collection("forms").doc(String(id)).get();
  if (!snap.exists) throw httpError("This form doesn't exist.", 404);
  const form = snap.data();
  const done = uid ? (await db.collection("formResponses").doc(`${snap.id}_${uid}`).get()).exists : false;
  return { id: snap.id, title: form.title, description: form.description || "", confirmation: form.confirmation || "", questions: form.questions || [], open: form.status === "open", alreadySubmitted: done };
}

// Anyone with the link can respond. A signed-in account is recorded under its
// uid; a visitor gives a name + email and is keyed by that email (so the same
// address can't submit twice — the address itself isn't verified).
export async function submitResponse(db, id, identity, rawAnswers) {
  const uid = identity.uid || "";
  const email = str(identity.email, 200).toLowerCase();
  const name = str(identity.name, 120);
  if (!uid) {
    if (!name) throw httpError("Please enter your name.", 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw httpError("Please enter a valid email address.", 400);
  }
  const formRef = db.collection("forms").doc(String(id));
  const snap = await formRef.get();
  if (!snap.exists) throw httpError("This form doesn't exist.", 404);
  const form = snap.data();
  if (form.status !== "open") throw httpError("This form is closed and not accepting responses.", 400);
  const input = rawAnswers && typeof rawAnswers === "object" ? rawAnswers : {};

  const answers = {};
  for (const q of form.questions || []) {
    const value = input[q.id];
    const empty = value == null || value === "" || (Array.isArray(value) && !value.length);
    if (empty) {
      if (q.required) throw httpError(`"${q.label}" is required.`, 400);
      continue;
    }
    const validChoice = (v) => typeof v === "string" && (q.options.includes(v) || (q.other && v.startsWith(OTHER_PREFIX) && v.trim().length > OTHER_PREFIX.length && v.length <= 300));
    if (q.type === "checkbox") {
      const picked = Array.isArray(value) ? value : [];
      if (!picked.every(validChoice)) throw httpError(`Invalid choice for "${q.label}".`, 400);
      answers[q.id] = picked;
    } else if (OPTION_TYPES.includes(q.type)) {
      if (!validChoice(value)) throw httpError(`Invalid choice for "${q.label}".`, 400);
      answers[q.id] = value;
    } else if (q.type === "scale") {
      const n = Number(value);
      if (!Number.isInteger(n) || n < (q.scale?.min ?? 1) || n > (q.scale?.max ?? 5)) throw httpError(`Invalid value for "${q.label}".`, 400);
      answers[q.id] = n;
    } else if (q.type === "date") {
      if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw httpError(`Invalid date for "${q.label}".`, 400);
      answers[q.id] = value;
    } else if (q.type === "time") {
      if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value)) throw httpError(`Invalid time for "${q.label}".`, 400);
      answers[q.id] = value;
    } else {
      answers[q.id] = str(value, 5000);
    }
  }

  const responseKey = uid || `e_${createHash("sha1").update(email).digest("hex").slice(0, 24)}`;
  const responseRef = db.collection("formResponses").doc(`${snap.id}_${responseKey}`);
  await db.runTransaction(async (tx) => {
    if ((await tx.get(responseRef)).exists) throw httpError("You have already submitted this form.", 409);
    tx.create(responseRef, {
      formId: snap.id,
      uid,
      name: name || "Student",
      email,
      role: identity.role || (uid ? "" : "Guest"),
      answers,
      submittedAt: new Date().toISOString(),
    });
    tx.update(formRef, { responseCount: FieldValue.increment(1) });
  });
  return { ok: true };
}
