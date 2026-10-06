import { FieldValue } from "firebase-admin/firestore";
import { HERO_DEFAULTS, HERO_MAX_STATS, HERO_TEXT_LIMITS } from "../site-hero";

// `siteContent` holds the admin-managed cards on the public homepage:
//   program — "What we do" cards, gallery — "Activities / gallery" photos,
//   session — "Our training sessions" thumbnails.
// Server-SDK-only; the public page reads it through /api/site-content.
export const KINDS = {
  program: { fields: ["category", "title", "copy", "stat", "photo"], required: ["title"] },
  gallery: { fields: ["category", "title", "photo"], required: ["title"] },
  session: { fields: ["title", "photo"], required: ["title"] },
};
const MAX = { category: 60, title: 120, copy: 400, stat: 60, photo: 500 };

const DEFAULTS = {
  program: [
    { category: "Leadership", title: "Lead with clarity", copy: "Build the judgment, communication, and confidence to move people forward.", stat: "5+ batches", photo: "/tranning1.jpeg" },
    { category: "Teaching", title: "Teach for impact", copy: "Turn expertise into learning experiences that stay with people.", stat: "Ongoing support", photo: "/tranning3.jpeg" },
  ],
  gallery: [
    { category: "Education", title: "Classroom Sessions", photo: "/tranning2.jpeg" },
    { category: "Education", title: "Hands-on Training", photo: "/tranning18.jpeg" },
    { category: "Community", title: "Group Activities", photo: "/tranning145.jpeg" },
  ],
  session: [
    { title: "Microsoft Excel Training Session", photo: "/tranning2.jpeg" },
    { title: "PowerPoint Workshop Highlights", photo: "/tranning18.jpeg" },
    { title: "AutoCAD Training Session", photo: "/tranning145.jpeg" },
    { title: "Classroom Highlights", photo: "/tranning195.jpeg" },
  ],
};

const plain = (snapshot) => ({ id: snapshot.id, ...snapshot.data() });
const httpError = (message, statusCode) => Object.assign(new Error(message), { statusCode });
const str = (value, max) => (typeof value === "string" ? value.trim().slice(0, max) : "");
const assertKind = (kind) => {
  if (!KINDS[kind]) throw httpError("Unknown content type.", 400);
};

function clean(kind, body) {
  const data = {};
  for (const field of KINDS[kind].fields) {
    const value = str(body[field], MAX[field]);
    data[field] = field === "photo" && value && !/^(https?:\/\/|\/)/i.test(value) ? "" : value;
  }
  for (const field of KINDS[kind].required) {
    if (!data[field]) throw httpError(`${field[0].toUpperCase()}${field.slice(1)} is required.`, 400);
  }
  return data;
}

export async function listContent(db, kind) {
  assertKind(kind);
  const snapshot = await db.collection("siteContent").where("kind", "==", kind).get();
  return snapshot.docs.map(plain).sort((a, b) => (a.order || 0) - (b.order || 0));
}

export async function listAllContent(db) {
  const snapshot = await db.collection("siteContent").get();
  const out = { program: [], gallery: [], session: [] };
  snapshot.docs.map(plain).forEach((item) => out[item.kind]?.push(item));
  Object.values(out).forEach((list) => list.sort((a, b) => (a.order || 0) - (b.order || 0)));
  return out;
}

// First admin visit copies the built-in cards in so they can be edited.
export async function listContentSeeded(db, kind) {
  const items = await listContent(db, kind);
  if (items.length) return items;
  const seededFlag = db.collection("siteContentMeta").doc(kind);
  if ((await seededFlag.get()).exists) return items; // admin emptied it on purpose
  const batch = db.batch();
  DEFAULTS[kind].forEach((item, index) => {
    batch.set(db.collection("siteContent").doc(), { kind, ...item, order: index, createdAt: FieldValue.serverTimestamp() });
  });
  batch.set(seededFlag, { seededAt: FieldValue.serverTimestamp() });
  await batch.commit();
  return listContent(db, kind);
}

export async function saveContent(db, kind, body) {
  assertKind(kind);
  const data = clean(kind, body);
  if (typeof body.id === "string" && body.id) {
    const ref = db.collection("siteContent").doc(body.id);
    const snapshot = await ref.get();
    if (!snapshot.exists || snapshot.data().kind !== kind) throw httpError("Item not found.", 404);
    await ref.update({ ...data, updatedAt: FieldValue.serverTimestamp() });
    return { id: body.id };
  }
  const items = await listContent(db, kind);
  const order = items.length ? Math.max(...items.map((item) => item.order || 0)) + 1 : 0;
  const ref = await db.collection("siteContent").add({ kind, ...data, order, createdAt: FieldValue.serverTimestamp() });
  return { id: ref.id };
}

// Homepage hero ("Header" tab): a single settings doc, not a list, so it
// lives outside `siteContent`.
const HERO_MAX = HERO_TEXT_LIMITS;
const heroRef = (db) => db.collection("siteSettings").doc("hero");

function cleanHero(body) {
  const data = {};
  for (const [field, max] of Object.entries(HERO_MAX)) data[field] = str(body?.[field], max);
  if (!data.line1 && !data.line2 && !data.line3) throw httpError("Enter at least one headline line.", 400);
  const stats = Array.isArray(body?.stats) ? body.stats.slice(0, HERO_MAX_STATS) : [];
  data.stats = stats
    .map((stat) => ({
      label: str(stat?.label, 40),
      value: Number(stat?.value),
      suffix: str(stat?.suffix, 4),
    }))
    .filter((stat) => stat.label);
  if (data.stats.some((stat) => !Number.isFinite(stat.value) || stat.value < 0 || stat.value > 1e9)) {
    throw httpError("Each number must be 0 or more.", 400);
  }
  data.stats.forEach((stat) => { stat.value = Math.round(stat.value); });
  return data;
}

export async function getHero(db) {
  const snapshot = await heroRef(db).get();
  const data = snapshot.exists ? snapshot.data() : {};
  return {
    ...Object.fromEntries(Object.keys(HERO_MAX).map((field) => [field, typeof data[field] === "string" ? data[field] : HERO_DEFAULTS[field]])),
    stats: Array.isArray(data.stats) ? data.stats : HERO_DEFAULTS.stats,
  };
}

export async function saveHero(db, body) {
  const data = cleanHero(body);
  await heroRef(db).set({ ...data, updatedAt: FieldValue.serverTimestamp() });
  return data;
}

export async function deleteContent(db, id) {
  await db.collection("siteContent").doc(id).delete();
}

// `ids` is the full new order for one kind.
export async function reorderContent(db, ids) {
  if (!Array.isArray(ids)) throw httpError("Invalid order.", 400);
  const batch = db.batch();
  ids.forEach((id, index) => {
    if (typeof id === "string" && id) batch.update(db.collection("siteContent").doc(id), { order: index });
  });
  await batch.commit();
}
