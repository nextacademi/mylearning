import { ImageResponse } from "next/og";
import { SITE_TAGLINE } from "../lib/seo";

// Default social-preview card for every page that doesn't define its own
// (Next's file convention — auto-served at /opengraph-image, and reused as
// the Twitter card image via layout.js's `twitter.card: "summary_large_image"`).
// Generated at request time from brand colors already used across the
// public site (components/PublicSite.js), not a static uploaded asset — so
// there's nothing to keep in sync if the wordmark/palette ever changes here.
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#0B0D10",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 88, fontWeight: 800, color: "#ffffff" }}>
          Next<span style={{ color: "#F04438", marginLeft: 20 }}>Academy</span>
        </div>
        <div style={{ display: "flex", marginTop: 24, fontSize: 34, color: "rgba(255,255,255,0.6)" }}>
          {SITE_TAGLINE}
        </div>
      </div>
    ),
    { ...size },
  );
}
