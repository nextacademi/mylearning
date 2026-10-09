// Roles that LEARN: can be enrolled in trainings, check in to classes, take
// Model Tests, see their course materials, etc. A Volunteer has exactly the
// same learner access as a Student (plus their Volunteer panel) — so every
// "is this person a student?" check uses this instead of role === "Student".
// Shared by server and client code; no imports.
export const LEARNER_ROLES = ["Student", "Volunteer"];
export const isLearnerRole = (role) => LEARNER_ROLES.includes(role);
