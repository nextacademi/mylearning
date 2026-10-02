import { FieldValue } from "firebase-admin/firestore";

// `teamMembers` backs the public "Our Team" slider. Server-SDK-only; the
// public page reads it through /api/team. Photos are plain URLs / /public paths.
const SOCIAL_KEYS = ["facebook", "instagram", "linkedin", "twitter"];
const SOCIALS = {
  facebook: "https://facebook.com/nextacademy",
  instagram: "https://instagram.com/nextacademy",
  linkedin: "https://linkedin.com/company/nextacademy",
  twitter: "https://x.com/nextacademy",
};
const DEFAULTS = [
  ["Nazmul Khan", "Founder", "/team/founder.jpg"],
  ["Sahed Mohammad", "Co-founder", "/team/co-founder.jpg"],
  ["Jewel Shahin", "Teacher", "/team/jewel-shahin.jpg"],
  ["Aktaruzzamman", "Teacher", "/team/aktaruzzamman.jpg"],
  ["Joy Ahmed", "Teacher", "/team/joy-ahmed.jpg"],
  ["Amzad Hossain", "Training Coordinator", "/team/amzad-hossain.jpg"],
  ["Akhidul Hasan", "Training Coordinator", "/team/akhidul-hasan.jpg"],
  ["Mithun Debnath", "Facilitator", "/team/mitun.jpg"],
];

const plain = (snapshot) => ({ id: snapshot.id, ...snapshot.data() });
const httpError = (message, statusCode) => Object.assign(new Error(message), { statusCode });
const str = (value, max) => (typeof value === "string" ? value.trim().slice(0, max) : "");
const url = (value) => {
  const text = str(value, 500);
  return !text || /^(https?:\/\/|\/)/i.test(text) ? text : "";
};

function clean(body) {
  const name = str(body.name, 100);
  const role = str(body.role, 80);
  if (!name) throw httpError("Name is required.", 400);
  if (!role) throw httpError("Role is required.", 400);
  return {
    name,
    role,
    photo: url(body.photo),
    socials: Object.fromEntries(SOCIAL_KEYS.map((key) => [key, url(body.socials?.[key])])),
  };
}

export async function listTeam(db) {
  const snapshot = await db.collection("teamMembers").orderBy("order", "asc").get();
  return snapshot.docs.map(plain);
}

// First admin visit copies the built-in team in so it can be edited.
export async function listTeamSeeded(db) {
  const members = await listTeam(db);
  if (members.length) return members;
  const batch = db.batch();
  DEFAULTS.forEach(([name, role, photo], index) => {
    batch.set(db.collection("teamMembers").doc(), { name, role, photo, socials: SOCIALS, order: index, createdAt: FieldValue.serverTimestamp() });
  });
  await batch.commit();
  return listTeam(db);
}

export async function saveMember(db, body) {
  const data = clean(body);
  if (typeof body.id === "string" && body.id) {
    const ref = db.collection("teamMembers").doc(body.id);
    if (!(await ref.get()).exists) throw httpError("Team member not found.", 404);
    await ref.update({ ...data, updatedAt: FieldValue.serverTimestamp() });
    return { id: body.id };
  }
  const last = await db.collection("teamMembers").orderBy("order", "desc").limit(1).get();
  const order = last.empty ? 0 : (last.docs[0].data().order || 0) + 1;
  const ref = await db.collection("teamMembers").add({ ...data, order, createdAt: FieldValue.serverTimestamp() });
  return { id: ref.id };
}

export async function deleteMember(db, id) {
  await db.collection("teamMembers").doc(id).delete();
}

// `ids` is the full new order.
export async function reorderTeam(db, ids) {
  if (!Array.isArray(ids)) throw httpError("Invalid order.", 400);
  const batch = db.batch();
  ids.forEach((id, index) => {
    if (typeof id === "string" && id) batch.update(db.collection("teamMembers").doc(id), { order: index });
  });
  await batch.commit();
}
