// Centralized SEO/branding config — every metadata export (layout, page,
// robots, sitemap, opengraph-image) reads from here so the site name/URL/
// description live in exactly one place. Only real, already-configured
// values: no invented address/phone/social accounts (this app currently
// has no verified public social profiles wired up anywhere else, so none
// are listed here — add them here, not per-page, once they exist).
export const SITE_NAME = "Next Academy";
export const SITE_TAGLINE = "Learning for what comes next";
export const SITE_DESCRIPTION =
  "Next Academy trains real students with real teachers, across real courses and batches — practical skills that turn straight into better jobs and stronger careers.";
// Same fallback chain apphosting.yaml/lib/auth-context.js already use for
// the deployed URL, so this never needs a second place to update.
export const SITE_URL =
  process.env.NEXT_PUBLIC_BASE_URL || "https://next-academy--mynextlms.asia-southeast1.hosted.app";
