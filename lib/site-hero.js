// Homepage hero ("Header" tab in Website content): headline, description
// and the stat row. Shared by the server (lib/server/site-content-core.js)
// and the public page, which falls back to these until a Director/Admin
// saves their own. Matches the original hard-coded hero exactly.
export const HERO_DEFAULTS = {
  tagline: "Learning Platform",
  line1: "Learn today.",
  line2: "Grow your career.",
  line3: "Lead tomorrow.",
  description:
    "Next Academy trains real students with real teachers, across real courses and batches — practical skills that turn straight into better jobs and stronger careers.",
  stats: [
    { label: "Students Trained", value: 450, suffix: "+" },
    { label: "Expert Teachers", value: 10, suffix: "+" },
    { label: "Courses Offered", value: 5, suffix: "+" },
    { label: "Total Enrollments", value: 440, suffix: "+" },
  ],
};

export const HERO_TEXT_LIMITS = { tagline: 60, line1: 60, line2: 60, line3: 60, description: 400 };
export const HERO_MAX_STATS = 4;
