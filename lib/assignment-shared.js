// Shared by the Assignment Portal (server, lib/server/assignment-portal.js)
// and the student Submit Assignment portal (client), so both number a
// training's assignments the same way. No imports.

// The short link printed in the Assignment tab's QR code. It is a TinyURL
// the academy manages itself: point it at `${SITE_URL}${ASSIGNMENT_PORTAL_PATH}`.
export const ASSIGNMENT_QR_URL = "https://tinyurl.com/NextAssignment";
// Signs the visitor in if needed, then opens their own Assignment page
// (app/assignment/page.js).
export const ASSIGNMENT_PORTAL_PATH = "/assignment";

const millis = (value) => (value?.toMillis ? value.toMillis() : typeof value === "string" ? Date.parse(value) || 0 : 0);

// A training's assignments in order: due date, then when they were created,
// then title ("Assignment 2" before "Assignment 10").
export function compareAssignments(a, b) {
  return (a.dueDate || "9999").localeCompare(b.dueDate || "9999") ||
    millis(a.createdAt) - millis(b.createdAt) ||
    String(a.title || "").localeCompare(String(b.title || ""), undefined, { numeric: true });
}

// "Assignment 01", "Assignment 02", …
export const assignmentNumberLabel = (number) => `Assignment ${String(number).padStart(2, "0")}`;
