// Who may "Log in as" whom — shared by the Users screen (to show the menu
// item) and /api/admin/impersonate (which enforces it). Never sideways or
// upwards: a Director can enter any account except another Director's, an
// Admin any account except an Admin's or Director's. No imports.
export function canImpersonate(staffRole, targetRole) {
  if (staffRole === "Director") return targetRole !== "Director";
  if (staffRole === "Admin") return targetRole !== "Admin" && targetRole !== "Director";
  return false;
}

// Where a role lands after signing in (mirrors the dashboard routing).
export function homeFor(role) {
  if (role === "Teacher") return "/teacher/dashboard";
  return `/dashboard/${String(role || "student").toLowerCase()}`;
}
