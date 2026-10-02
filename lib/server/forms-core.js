import { FieldValue } from "firebase-admin/firestore";
import { MAX_OPTIONS, MAX_QUESTIONS, OPTION_TYPES, QUESTION_TYPES } from "../forms-shared";

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
    return { id, type, label, required: q.required === true, options };
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
  const done = (await db.collection("formResponses").doc(`${snap.id}_${uid}`).get()).exists;
  return { id: snap.id, title: form.title, description: form.description || "", questions: form.questions || [], open: form.status === "open", alreadySubmitted: done };
}

export async function submitResponse(db, id, uid, profile, rawAnswers) {
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
    if (q.type === "checkbox") {
      const picked = Array.isArray(value) ? value : [];
      if (!picked.every((v) => q.options.includes(v))) throw httpError(`Invalid choice for "${q.label}".`, 400);
      answers[q.id] = picked;
    } else if (OPTION_TYPES.includes(q.type)) {
      if (typeof value !== "string" || !q.options.includes(value)) throw httpError(`Invalid choice for "${q.label}".`, 400);
      answers[q.id] = value;
    } else {
      answers[q.id] = str(value, 5000);
    }
  }

  const responseRef = db.collection("formResponses").doc(`${snap.id}_${uid}`);
  await db.runTransaction(async (tx) => {
    if ((await tx.get(responseRef)).exists) throw httpError("You have already submitted this form.", 409);
    tx.create(responseRef, {
      formId: snap.id,
      uid,
      name: profile.displayName || profile.email || "Student",
      email: profile.email || "",
      role: profile.role || "",
      answers,
      submittedAt: new Date().toISOString(),
    });
    tx.update(formRef, { responseCount: FieldValue.increment(1) });
  });
  return { ok: true };
}
