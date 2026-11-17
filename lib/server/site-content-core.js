import { FieldValue } from "firebase-admin/firestore";
import { HERO_DEFAULTS, HERO_MAX_STATS, HERO_TEXT_LIMITS } from "../site-hero";
import { toVideoEmbedUrl } from "../lesson-embed";
import { HERO_VIDEO_DEFAULTS, HERO_VIDEO_LIMITS } from "../hero-video";
import { COURSE_COLORS, COURSE_ICONS, COURSE_LIMITS, DEFAULT_COURSES, MAX_COURSE_PRICE, PAYMENT_FIELDS, paymentConfigured } from "../training-offer";

// `siteContent` holds the admin-managed cards on the public homepage:
//   program — "What we do" cards, gallery — "Activities / gallery" photos,
//   session — "Exciting New Videos" cards (picture + optional YouTube /
//             Facebook / Google Drive video link that plays on click),
//   course  — "Empower Your Career" course cards (title, duration,
//             schedule, price, colour, artwork) that also fill the
//             Training Registration form's course list.
// Server-SDK-only; the public page reads it through /api/site-content.
export const KINDS = {
  program: { fields: ["category", "title", "copy", "stat", "photo"], required: ["title"] },
  gallery: { fields: ["category", "title", "photo"], required: ["title"] },
  session: { fields: ["title", "photo", "videoUrl"], required: ["title"] },
  course: { fields: ["title", "duration", "schedule", "tagline", "iconImage"], required: ["title", "duration"] },
};
const MAX = { category: 60, title: 120, copy: 400, stat: 60, photo: 500, videoUrl: 500, iconImage: 500, ...COURSE_LIMITS };

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
  course: DEFAULT_COURSES.map(({ id: _id, ...course }) => ({ featured: false, ...course })),
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
    data[field] = (field === "photo" || field === "iconImage") && value && !/^(https?:\/\/|\/)/i.test(value) ? "" : value;
  }
  if (data.videoUrl && (!/^https:\/\//i.test(data.videoUrl) || !toVideoEmbedUrl(data.videoUrl))) {
    throw httpError("Use a YouTube, Facebook or Google Drive video link (starting with https://).", 400);
  }
  for (const field of KINDS[kind].required) {
    if (!data[field]) throw httpError(`${field[0].toUpperCase()}${field.slice(1)} is required.`, 400);
  }
  if (kind === "course") Object.assign(data, cleanCourseExtras(body));
  return data;
}

// Course cards carry a price, a colour theme and an artwork preset on top
// of their text fields.
function cleanCourseExtras(body) {
  const price = Number(body.price);
  if (!Number.isFinite(price) || price < 0 || price > MAX_COURSE_PRICE) {
    throw httpError(`Price must be a number between 0 and ${MAX_COURSE_PRICE}.`, 400);
  }
  return {
    price: Math.round(price * 100) / 100,
    color: COURSE_COLORS[body.color] ? body.color : "red",
    icon: COURSE_ICONS[body.icon] ? body.icon : "general",
    featured: body.featured === true,
  };
}

export async function listContent(db, kind) {
  assertKind(kind);
  const snapshot = await db.collection("siteContent").where("kind", "==", kind).get();
  return snapshot.docs.map(plain).sort((a, b) => (a.order || 0) - (b.order || 0));
}

export async function listAllContent(db) {
  const snapshot = await db.collection("siteContent").get();
  const out = { program: [], gallery: [], session: [], course: [] };
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

// Course cards as the public page and the registration API see them: the
// admin-edited list, or the built-in five until an admin has opened the
// Courses tab (which seeds the same five into Firestore).
export async function listCourses(db) {
  const items = await listContent(db, "course");
  if (items.length) return items.map(publicCourse);
  const seeded = (await db.collection("siteContentMeta").doc("course").get()).exists;
  return seeded ? [] : DEFAULT_COURSES.map(publicCourse);
}

export function publicCourse(item) {
  return {
    id: item.id,
    title: item.title || "",
    duration: item.duration || "",
    schedule: item.schedule || "",
    tagline: item.tagline || "",
    price: Number(item.price) || 0,
    color: COURSE_COLORS[item.color] ? item.color : "red",
    icon: COURSE_ICONS[item.icon] ? item.icon : "general",
    featured: item.featured === true,
    iconImage: typeof item.iconImage === "string" ? item.iconImage : "",
  };
}

// Payment details for the registration form ("Payment details" tab): a
// single settings doc, like the hero. Nothing is shown publicly until
// paymentConfigured() is true.
const paymentRef = (db) => db.collection("siteSettings").doc("payment");

export async function getPaymentSettings(db) {
  const snapshot = await paymentRef(db).get();
  const data = snapshot.exists ? snapshot.data() : {};
  return Object.fromEntries(Object.keys(PAYMENT_FIELDS).map((field) => [field, typeof data[field] === "string" ? data[field] : ""]));
}

export async function getPublicPayment(db) {
  const payment = await getPaymentSettings(db);
  return paymentConfigured(payment) ? payment : null;
}

export async function savePaymentSettings(db, body) {
  const data = {};
  for (const [field, max] of Object.entries(PAYMENT_FIELDS)) data[field] = str(body?.[field], max);
  if (data.paynowQr && !/^(https?:\/\/|\/)/i.test(data.paynowQr)) throw httpError("Upload the PayNow QR image or paste an https:// link.", 400);
  if (Boolean(data.bankName) !== Boolean(data.accountNumber) && !data.paynowQr && !data.paynowUen) {
    throw httpError("Enter both the bank name and the account number.", 400);
  }
  await paymentRef(db).set({ ...data, updatedAt: FieldValue.serverTimestamp() });
  return data;
}

// Homepage hero "video" slideshow (Website → Hero video): one settings doc.
const heroVideoRef = (db) => db.collection("siteSettings").doc("heroVideo");
const photoUrl = (value) => {
  const url = str(value, HERO_VIDEO_LIMITS.photo);
  return /^(https:\/\/|\/)/i.test(url) ? url : "";
};

function cleanHeroVideo(body) {
  const L = HERO_VIDEO_LIMITS;
  const slides = (Array.isArray(body?.slides) ? body.slides : [])
    .slice(0, L.maxSlides)
    .map((slide) => ({ photo: photoUrl(slide?.photo), label: str(slide?.label, L.label), caption: str(slide?.caption, L.caption) }))
    .filter((slide) => slide.photo || slide.caption || slide.label);
  if (slides.some((slide) => !slide.photo)) throw httpError("Every photo slide needs a photo (upload one or paste an https:// link).", 400);
  if (slides.some((slide) => !slide.caption)) throw httpError("Every photo slide needs a caption.", 400);
  const data = {
    enabled: body?.enabled !== false,
    intro: { show: body?.intro?.show !== false, text: str(body?.intro?.text, L.introText) },
    slides,
    courses: { show: body?.courses?.show !== false, label: str(body?.courses?.label, L.coursesLabel), photo: photoUrl(body?.courses?.photo) },
    end: {
      show: body?.end?.show !== false,
      heading: str(body?.end?.heading, L.endHeading),
      button: str(body?.end?.button, L.endButton),
      website: str(body?.end?.website, L.endWebsite),
      photo: photoUrl(body?.end?.photo),
    },
  };
  if (data.enabled && !data.intro.show && !slides.length && !data.courses.show && !data.end.show) {
    throw httpError("Turn on at least one part of the hero video, or switch it off to use the fixed video file.", 400);
  }
  if (data.end.show && !data.end.heading) throw httpError("Enter the end card heading.", 400);
  return data;
}

export async function getHeroVideo(db) {
  const snapshot = await heroVideoRef(db).get();
  if (!snapshot.exists) return HERO_VIDEO_DEFAULTS;
  const data = snapshot.data();
  return {
    enabled: data.enabled !== false,
    intro: { ...HERO_VIDEO_DEFAULTS.intro, ...(data.intro || {}) },
    slides: Array.isArray(data.slides) ? data.slides : HERO_VIDEO_DEFAULTS.slides,
    courses: { ...HERO_VIDEO_DEFAULTS.courses, ...(data.courses || {}) },
    end: { ...HERO_VIDEO_DEFAULTS.end, ...(data.end || {}) },
  };
}

export async function saveHeroVideo(db, body) {
  const data = cleanHeroVideo(body);
  await heroVideoRef(db).set({ ...data, updatedAt: FieldValue.serverTimestamp() });
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
