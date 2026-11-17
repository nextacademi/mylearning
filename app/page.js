import PublicSite from "../components/PublicSite";
import { SITE_NAME, SITE_URL } from "../lib/seo";
import { loadSeoSettingsSafe } from "../lib/server/seo-settings";
import { getAdminDb } from "../lib/firebase-admin";
import { getHero, getHeroVideo, listCourses } from "../lib/server/site-content-core";
import { HERO_VIDEO_DEFAULTS } from "../lib/hero-video";
import { ACADEMY_INFO } from "../lib/academy-info";
import { listTeam } from "../lib/server/team-core";
import { realSocialLinks } from "../lib/team-socials";
import { DEFAULT_COURSES } from "../lib/training-offer";
import heroVideoSrc from "../public/hero-intro.mp4";
import heroThumb from "../public/hero-intro-thumb.jpg";

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

// Course cards (Website content → Courses), also in the first paint so a
// changed price never flashes the old one.
// Team (Website → Team) for the organization's people in structured data.
async function loadTeam() {
  try {
    return await listTeam(getAdminDb());
  } catch {
    return [];
  }
}

async function loadHeroVideo() {
  try {
    return await getHeroVideo(getAdminDb());
  } catch {
    return HERO_VIDEO_DEFAULTS;
  }
}

async function loadCourses() {
  try {
    return await listCourses(getAdminDb());
  } catch {
    return null; // PublicSite falls back to the built-in course list
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
// the EducationalOrganization (contact details from Website → SEO, falling
// back to the academy's real address/email in lib/academy-info.js), the
// WebSite, the homepage course cards as Courses (Website → Courses) and the
// hero intro video.
const ORG_ID = `${SITE_URL}/#organization`;
const absolute = (path) => new URL(path, SITE_URL).href;
const postalAddress = {
  "@type": "PostalAddress",
  streetAddress: ACADEMY_INFO.addressLines.join(", ").replace(/,?\s*Singapore\s*\d{6}$/i, ""),
  addressLocality: "Singapore",
  postalCode: (/\b(\d{6})\b/.exec(ACADEMY_INFO.addressLines.join(" ")) || [])[1],
  addressCountry: "SG",
};

function organizationJsonLd(seo, team = []) {
  const people = team
    .filter((member) => member.name && member.role)
    .map((member) => {
      const sameAs = Object.values(realSocialLinks(member.socials));
      return {
        "@type": "Person",
        name: member.name,
        jobTitle: member.role,
        ...(member.photo ? { image: absolute(member.photo) } : {}),
        ...(sameAs.length ? { sameAs } : {}),
      };
    });
  return {
    "@context": "https://schema.org",
    "@type": "EducationalOrganization",
    "@id": ORG_ID,
    name: SITE_NAME,
    alternateName: `${SITE_NAME} Singapore`,
    legalName: ACADEMY_INFO.legalName,
    url: SITE_URL,
    logo: `${SITE_URL}/logo.jpeg`,
    description: seo.description,
    email: seo.email || ACADEMY_INFO.email,
    ...(seo.phone ? { telephone: seo.phone } : {}),
    address: seo.address ? { "@type": "PostalAddress", streetAddress: seo.address, addressCountry: "SG" } : postalAddress,
    areaServed: { "@type": "Country", name: "Singapore" },
    ...(seo.socialLinks?.length ? { sameAs: seo.socialLinks } : {}),
    ...(people.length ? { employee: people } : {}),
  };
}
function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL,
    publisher: { "@id": ORG_ID },
  };
}

// "3 Months" → "P3M", "10 Weeks" → "P10W", "2 Days" → "P2D"
function isoDuration(text) {
  const match = /(\d+)\s*(day|week|month|year)/i.exec(text || "");
  return match ? `P${match[1]}${match[2][0].toUpperCase()}` : null;
}
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const courseAnchor = (title) => `course-${String(title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`;

function coursesJsonLd(courses) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Courses at ${SITE_NAME} Singapore`,
    itemListElement: courses.map((course, index) => {
      const url = `${SITE_URL}/#${courseAnchor(course.title)}`;
      const day = WEEKDAYS.find((name) => new RegExp(name, "i").test(course.schedule || ""));
      const timeRequired = isoDuration(course.duration);
      return {
        "@type": "ListItem",
        position: index + 1,
        url,
        item: {
          "@type": "Course",
          name: course.title,
          description: [
            `${/\bcourse$/i.test(course.title) ? course.title : `${course.title} course`} at ${SITE_NAME} in Singapore${course.tagline ? ` (${course.tagline})` : ""}.`,
            [course.duration, course.schedule].filter(Boolean).join(", ") && `${[course.duration, course.schedule].filter(Boolean).join(", ")}.`,
            "Hands-on classes with real trainers.",
          ].filter(Boolean).join(" "),
          url,
          inLanguage: "en",
          provider: { "@type": "EducationalOrganization", "@id": ORG_ID, name: SITE_NAME, sameAs: SITE_URL },
          ...(timeRequired ? { timeRequired } : {}),
          offers: [{
            "@type": "Offer",
            category: "Paid",
            price: Number(course.price) || 0,
            priceCurrency: "SGD",
            url,
            availability: "https://schema.org/InStock",
          }],
          hasCourseInstance: [{
            "@type": "CourseInstance",
            courseMode: "Onsite",
            location: { "@type": "Place", name: ACADEMY_INFO.legalName, address: postalAddress },
            ...(day ? { courseSchedule: { "@type": "Schedule", repeatFrequency: "P1W", byDay: `https://schema.org/${day}` } } : {}),
          }],
        },
      };
    }),
  };
}

function heroVideoJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: `${SITE_NAME} Singapore: practical computer, Excel, AutoCAD and AI courses`,
    description: `A short look at ${SITE_NAME} in Singapore: real classes with real trainers, hands-on practice, and our courses (Basic Computer, Advance Excel, Basic AutoCAD, AI Learning and WPLN Preparatory).`,
    thumbnailUrl: [absolute(heroThumb.src)],
    contentUrl: absolute(heroVideoSrc),
    uploadDate: "2026-11-17T00:00:00+08:00",
    duration: "PT17S",
    inLanguage: "en",
    publisher: { "@id": ORG_ID },
  };
}

// "<" escaped so text typed in the LMS can never close the <script> tag.
const jsonLd = (data) => ({ __html: JSON.stringify(data).replace(/</g, "\\u003c") });

export default async function Home() {
  const [hero, seo, courses, team, heroVideo] = await Promise.all([loadHero(), loadSeoSettingsSafe(), loadCourses(), loadTeam(), loadHeroVideo()]);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(organizationJsonLd(seo, team))} />
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(websiteJsonLd())} />
      {heroVideo.enabled === false && <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(heroVideoJsonLd())} />}
      {(courses || DEFAULT_COURSES).length > 0 && (
        <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(coursesJsonLd(courses || DEFAULT_COURSES))} />
      )}
      <PublicSite initialHero={hero} initialCourses={courses} initialHeroVideo={heroVideo} />
    </>
  );
}
