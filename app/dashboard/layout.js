// Every /dashboard/* route (Student/Volunteer/Facilitator/Director/Admin
// workspaces — app/dashboard/[role]/page.jsx and its "use client" tree)
// is login-gated real-time app UI, never content meant for search results.
// A page.jsx can't export `metadata` once it's a Client Component, so this
// thin Server Component layout is the one place to set it for the whole
// subtree — see app/robots.ts for the matching Disallow.
export const metadata = {
  robots: { index: false, follow: false },
};

export default function DashboardLayout({ children }) {
  return children;
}
