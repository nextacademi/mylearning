import PromoteLandingPage from "../../../components/PromoteLandingPage";

// A specific teacher/student's personal referral landing page (keyed by
// their own promo slug — see app/api/promote/[slug]/route.js and
// components/PromoteLandingPage.jsx), not general site content — shouldn't
// be indexed or compete in search against the real homepage. See
// app/robots.ts's Disallow for the matching crawl rule.
export const metadata = {
  robots: { index: false, follow: false },
};

export default function PromoteSlugPage() {
  return <PromoteLandingPage />;
}
