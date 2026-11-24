"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/auth-context";
import { ASSIGNMENT_PORTAL_PATH } from "../../lib/assignment-shared";

// Behind /assignment — where the Assignment QR (tinyurl.com/NextAssignment)
// should point. Signed out → log in first (AuthPage returns here via
// ?next=); signed in → that person's own Assignment page: students and
// volunteers get the Submit Assignment portal, staff the Assignment Portal.
function destination(role) {
  if (role === "Teacher") return "/teacher/assignments";
  if (role === "Guest") return "/dashboard/guest";
  return `/dashboard/${role.toLowerCase()}?tab=Assignment`;
}

export default function AssignmentLink() {
  const router = useRouter();
  const { user, profile, loading } = useAuth();
  const role = profile?.role;

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace(`/login?next=${encodeURIComponent(ASSIGNMENT_PORTAL_PATH)}`);
    else if (role) router.replace(destination(role));
  }, [loading, role, router, user]);

  return (
    <main className="grid min-h-screen place-items-center bg-page p-6 text-center text-sm text-muted">
      Opening the assignment portal…
    </main>
  );
}
