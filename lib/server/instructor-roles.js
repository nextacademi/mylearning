// Roles that may be assigned as a course/class instructor (primary or
// assistant teacher). Directors and Volunteers also conduct trainings, so
// they're assignable alongside Teachers. Used by both the training API and
// the teacher-assignment API so the two can never disagree.
export const INSTRUCTOR_ROLES = ["Teacher", "Director", "Volunteer"];
export const isInstructorRole = (role) => INSTRUCTOR_ROLES.includes(role);
