// Shared, client-safe constants for the Achievement module — imported by
// both the admin API route (server) and the UI components (client) so the
// two never drift apart. Deliberately plain arrays, not an enum library:
// per the task's own "do not over-engineer," adding a new type later is
// just adding a string here.
export const CERTIFICATE_TYPES = [
  "Course Completion",
  "Achievement",
  "Best Performer",
  "Project Completion",
  "Workshop",
  "Special Recognition",
];

export const ACHIEVEMENT_TYPES = [
  "Course Completion",
  "Best Performer",
  "Highest Score",
  "Most Improved Student",
  "Best Project",
  "Outstanding Student",
  "Learning Milestone",
  "Special Academic Recognition",
];

// Awards are a deliberately separate concept from Achievements above (see
// award-core.js's header) — a manually-issued honor an Admin/Director
// grants, with its own type list per the spec.
export const AWARD_TYPES = [
  "Best Student",
  "Student of the Month",
  "Best Project",
  "Excellence Award",
  "Leadership Award",
  "Outstanding Achievement",
  "Custom",
];
