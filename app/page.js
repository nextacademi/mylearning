import PublicSite from "../components/PublicSite";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE, SITE_URL } from "../lib/seo";

export const metadata = {
  title: SITE_TAGLINE,
  description: SITE_DESCRIPTION,
  alternates: { canonical: SITE_URL },
  openGraph: { title: `${SITE_NAME} | ${SITE_TAGLINE}`, description: SITE_DESCRIPTION, url: SITE_URL },
};

// Organization + WebSite JSON-LD — only fields this app actually has real
// values for (name, url, logo, description). No address/phone/socials/
// ratings invented; add them here once they exist elsewhere in the app,
// never hardcode a second copy. WebSite's `potentialAction` is omitted —
// there's no real site search endpoint to point it at.
function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/logo.jpeg`,
    description: SITE_DESCRIPTION,
  };
}
function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL,
  };
}

export default function Home() {
  return (
    <>
      {/* eslint-disable-next-line react/no-danger -- static, server-built JSON-LD, not user input */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd()) }} />
      {/* eslint-disable-next-line react/no-danger */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd()) }} />
      <PublicSite />
    </>
  );
}
