import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "../lib/auth-context";
import { ThemeProvider } from "../lib/theme-context";
import { ToastProvider } from "../components/ui/Toast";
import { ConfirmProvider } from "../components/ui/ConfirmDialog";
import PwaRegister from "../components/PwaRegister";
import AiAssistantWidget from "../components/ai-assistant/AiAssistantWidget";
import ImpersonationBanner from "../components/auth/ImpersonationBanner";
import Script from "next/script";
import { SITE_NAME, SITE_URL } from "../lib/seo";
import { loadSeoSettingsSafe } from "../lib/server/seo-settings";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// `metadataBase` resolves every relative URL below (and in any page's own
// `openGraph.images`/`alternates.canonical`) against the real deployed
// origin — without it, Next falls back to localhost and social-preview/
// canonical URLs silently break in production. `title.template` lets every
// other page just set `title: "Page Name"` and get "Page Name | Next
// Academy" for free instead of repeating the suffix everywhere.
// Title / description / keywords / share image / Google Search Console
// verification all come from Website → SEO (lib/server/seo-settings.js),
// falling back to lib/seo.js defaults.
export async function generateMetadata() {
  const seo = await loadSeoSettingsSafe();
  const images = seo.shareImage ? [{ url: seo.shareImage }] : undefined;
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: seo.siteTitle, template: `%s | ${SITE_NAME}` },
    description: seo.description,
    keywords: seo.keywords ? seo.keywords.split(",").map((k) => k.trim()).filter(Boolean) : undefined,
    manifest: "/manifest.json",
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title: seo.siteTitle,
      description: seo.description,
      url: SITE_URL,
      locale: "en_SG",
      ...(images ? { images } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: seo.siteTitle,
      description: seo.description,
      ...(images ? { images: images.map((i) => i.url) } : {}),
    },
    ...(seo.googleVerification ? { verification: { google: seo.googleVerification } } : {}),
  };
}

export const viewport = {
  themeColor: "#ff2d2d",
};

export default async function RootLayout({ children }) {
  const { gaMeasurementId } = await loadSeoSettingsSafe();
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          <AuthProvider>
            <ToastProvider>
              <ConfirmProvider>
                {children}
                <AiAssistantWidget />
                <ImpersonationBanner />
              </ConfirmProvider>
            </ToastProvider>
          </AuthProvider>
        </ThemeProvider>
        <PwaRegister />
        {/* Google Analytics 4 — only when an ID is set in Website → SEO. */}
        {gaMeasurementId && (
          <>
            <Script src={`https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}`} strategy="afterInteractive" />
            <Script id="ga4" strategy="afterInteractive">
              {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag("js",new Date());gtag("config","${gaMeasurementId}");`}
            </Script>
          </>
        )}
      </body>
    </html>
  );
}
