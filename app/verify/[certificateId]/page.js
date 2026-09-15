import VerifyCertificatePage from "../../../components/achievement/VerifyCertificatePage";

// Shows one specific person's name/certificate details keyed by URL — a
// verification utility for whoever has the link/QR, not a page meant to
// be indexed or turn up in a search for that person's name. See
// app/robots.ts's Disallow for the matching crawl rule.
export const metadata = {
  title: "Verify Certificate",
  robots: { index: false, follow: false },
};

export default function VerifyCertificateRoute() {
  return <VerifyCertificatePage />;
}
