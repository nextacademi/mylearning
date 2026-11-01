import PublicSite from "../components/PublicSite";
import { SITE_NAME, SITE_URL } from "../lib/seo";
import { loadSeoSettingsSafe } from "../lib/server/seo-settings";
import { getAdminDb } from "../lib/firebase-admin";
import { getHero } from "../lib/server/site-content-core";

// ISR: the hero header (Website content → Header) is read here so the
// edited headline/numbers are in the first paint, not swapped in after
// load. Saving the header also calls revalidatePath("/").
export const revalidate = 60;

async function loadHero() {
  try {
    return await getHero(getAdminDb());
  } catch {
    return null; // e.g. no Admin credentials at build time — PublicSite uses its defaults
  }
}

export async function generateMetadata() {
  const seo = await loadSeoSettingsSafe();
  return {
    title: { absolute: seo.siteTitle },
    description: seo.description,
    alternates: { canonical: SITE_URL },
    openGraph: { title: seo.siteTitle, description: seo.description, url: SITE_URL },
  };
}

// Structured data Google reads for the knowledge panel / rich results:
// an EducationalOrganization (with the contact details and social profiles
// set in Website → SEO, only when filled in) and the WebSite itself.
function organizationJsonLd(seo) {
  return {
    "@context": "https://schema.org",
    "@type": "EducationalOrganization",
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/logo.jpeg`,
    description: seo.description,
    ...(seo.phone ? { telephone: seo.phone } : {}),
    ...(seo.email ? { email: seo.email } : {}),
    ...(seo.address ? { address: { "@type": "PostalAddress", streetAddress: seo.address, addressCountry: "SG" } } : {}),
    ...(seo.socialLinks?.length ? { sameAs: seo.socialLinks } : {}),
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

export default async function Home() {
  const [hero, seo] = await Promise.all([loadHero(), loadSeoSettingsSafe()]);
  return (
    <>
      {/* eslint-disable-next-line react/no-danger -- static, server-built JSON-LD, not user input */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd(seo)) }} />
      {/* eslint-disable-next-line react/no-danger */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd()) }} />
      <PublicSite initialHero={hero} />
    </>
  );
}
