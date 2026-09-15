import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "../lib/auth-context";
import { ThemeProvider } from "../lib/theme-context";
import { ToastProvider } from "../components/ui/Toast";
import { ConfirmProvider } from "../components/ui/ConfirmDialog";
import PwaRegister from "../components/PwaRegister";
import AiAssistantWidget from "../components/ai-assistant/AiAssistantWidget";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE, SITE_URL } from "../lib/seo";

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
export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE_NAME} | ${SITE_TAGLINE}`, template: `%s | ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  manifest: "/manifest.json",
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: `${SITE_NAME} | ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} | ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
  },
};

export const viewport = {
  themeColor: "#ff2d2d",
};

export default function RootLayout({ children }) {
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
              </ConfirmProvider>
            </ToastProvider>
          </AuthProvider>
        </ThemeProvider>
        <PwaRegister />
      </body>
    </html>
  );
}
