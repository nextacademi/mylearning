// Homepage hero "video": a live slideshow (logo intro → photo slides with
// captions → course list → end card) edited in Dashboard → Website → Hero
// video. Shared by the public page, the editor and the API (no imports).
// The defaults reproduce the current intro video, so nothing changes until
// an admin edits it. `enabled: false` shows the fixed video file instead.

export const HERO_VIDEO_LIMITS = {
  maxSlides: 8,
  introText: 60,
  label: 40,
  caption: 70,
  coursesLabel: 30,
  endHeading: 40,
  endButton: 24,
  endWebsite: 40,
  photo: 500,
};

export const HERO_VIDEO_DEFAULTS = {
  enabled: true,
  intro: { show: true, text: "PROFESSIONAL TRAINING  ·  SINGAPORE" },
  slides: [
    { photo: "/tranning1.jpeg", label: "NEXT ACADEMY  ·  SINGAPORE", caption: "Practical skills for a better career" },
    { photo: "/hero/hands-on-trainer.jpeg", label: "HANDS-ON TRAINING", caption: "Learn with real trainers" },
    { photo: "/tranning145.jpeg", label: "PRACTICAL CLASSES", caption: "Learn by doing, step by step" },
  ],
  courses: { show: true, label: "OUR COURSES", photo: "/tranning3.jpeg" },
  end: { show: true, heading: "Join our next batch", button: "Register now", website: "nextacademy.sg", photo: "/tranning4.jpeg" },
};

// Seconds each scene stays on screen (the cross-fade overlaps the next one).
export const HERO_VIDEO_TIMING = { intro: 2.6, slide: 3.6, courses: 4.4, end: 4.8, fade: 0.8 };
