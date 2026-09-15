import { SITE_URL } from "../lib/seo";

// This app's only real public, indexable pages today are the landing page
// itself and the two auth entry points — see app/robots.js's comment for
// why /dashboard, /teacher, /verify/[certificateId] and /promote/[slug]
// are deliberately excluded (private workspaces, or pages that expose a
// specific person's info and shouldn't be indexed). There are no separate
// /courses or /courses/[slug] routes to enumerate here: Training/Team/
// Events/About/Contact are all sections of this one landing page
// (components/PublicSite.js), addressed by #anchor, not by their own URL —
// a search engine indexes the page once, anchors aren't separate documents.
export default function sitemap() {
  const now = new Date();
  return [
    { url: SITE_URL, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/register`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/login`, lastModified: now, changeFrequency: "monthly", priority: 0.3 },
  ];
}
