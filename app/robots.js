import { SITE_URL } from "../lib/seo";

// Every route under /dashboard and /teacher is a private, login-gated
// workspace (Student/Volunteer/Teacher/Director/Admin) — see
// app/dashboard/[role]/page.jsx and the app/teacher/* tree — never content
// meant to be indexed. /api is server-only. This is belt-and-suspenders on
// top of the noindex robots metadata on those same routes (app/dashboard/
// layout.js, app/teacher/layout.js) — some crawlers honor robots.txt
// Disallow without ever fetching the page (and its meta tag) at all.
export default function robots() {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard", "/teacher", "/api", "/verify", "/promote"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
