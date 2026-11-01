import { FieldValue } from "firebase-admin/firestore";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE } from "../seo";

// Google / SEO settings edited in Website → SEO (components/team/
// SeoManager.jsx), stored at settings/seo, and read by app/layout.js
// (title, description, keywords, share image, Search Console verification,
// Google Analytics) and app/page.js (the homepage's structured data).
// Everything has a sensible default so the site is fine before anyone saves.

export const DEFAULT_SEO = {
  siteTitle: `${SITE_NAME} | ${SITE_TAGLINE}`,
  description: SITE_DESCRIPTION,
  keywords: "Next Academy, Singapore training, Microsoft Office course, digital literacy, WPLN, volunteer Singapore, skills training, migrant worker training",
  shareImage: "",
  googleVerification: "",
  gaMeasurementId: "",
  phone: "",
  email: "",
  address: "",
  socialLinks: [],
};

const str = (value, max) => (typeof value === "string" ? value.trim().slice(0, max) : "");
const ref = (db) => db.collection("settings").doc("seo");

// Read on every page render (root layout), so keep a short in-memory copy.
let cache = null;
const TTL_MS = 5 * 60 * 1000;

export async function getSeoSettings(db) {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const snap = await ref(db).get();
  const value = snap.exists ? { ...DEFAULT_SEO, ...snap.data() } : DEFAULT_SEO;
  delete value.updatedAt;
  delete value.updatedBy;
  cache = { at: Date.now(), value };
  return value;
}

export async function saveSeoSettings(db, body, updatedBy) {
  // Accept either the bare code or the whole <meta …content="CODE"> tag
  // Search Console gives you.
  const verificationRaw = str(body.googleVerification, 400);
  const verificationMatch = /content=["']([^"']+)["']/i.exec(verificationRaw);
  const googleVerification = (verificationMatch ? verificationMatch[1] : verificationRaw).replace(/[^\w-]/g, "").slice(0, 120);

  const gaMeasurementId = str(body.gaMeasurementId, 40).toUpperCase();
  if (gaMeasurementId && !/^G-[A-Z0-9]{4,20}$/.test(gaMeasurementId)) {
    throw Object.assign(new Error("Google Analytics ID looks like G-XXXXXXXXXX."), { statusCode: 400 });
  }
  const shareImage = str(body.shareImage, 1000);
  if (shareImage && !/^(https:\/\/|\/)/.test(shareImage)) {
    throw Object.assign(new Error("Share image must be an https:// link or a /path on this site."), { statusCode: 400 });
  }
  const socialLinks = (Array.isArray(body.socialLinks) ? body.socialLinks : [])
    .map((link) => str(link, 300))
    .filter((link) => /^https:\/\/\S+\.\S+/.test(link))
    .slice(0, 10);

  const settings = {
    siteTitle: str(body.siteTitle, 70) || DEFAULT_SEO.siteTitle,
    description: str(body.description, 300) || DEFAULT_SEO.description,
    keywords: str(body.keywords, 500),
    shareImage,
    googleVerification,
    gaMeasurementId,
    phone: str(body.phone, 40),
    email: str(body.email, 200),
    address: str(body.address, 300),
    socialLinks,
  };
  await ref(db).set({ ...settings, updatedBy, updatedAt: FieldValue.serverTimestamp() });
  cache = { at: Date.now(), value: settings };
  return settings;
}

// Safe for build time / missing credentials: falls back to the defaults.
export async function loadSeoSettingsSafe() {
  try {
    const { getAdminDb } = await import("../firebase-admin");
    return await getSeoSettings(getAdminDb());
  } catch {
    return DEFAULT_SEO;
  }
}
