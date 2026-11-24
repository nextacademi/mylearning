"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/auth-context";
import { isLearnerRole } from "../../lib/learner-roles";
import { EXAM_LINK_PARAM, examPath } from "../../lib/exam-shared";

// Behind /exam/<quizId>, the short link in an exam's QR code. Signed out →
// log in first (AuthPage returns here via ?next=); signed in → the person's
// own Model Test tab. Students and volunteers get that exam opened for them
// (StudentExams reads ?exam=); staff land on their Model Test manager.
function destination(role, quizId) {
  if (role === "Teacher") return "/teacher/exams";
  if (role === "Guest") return "/dashboard/guest";
  const params = new URLSearchParams({ tab: "Model Test" });
  if (isLearnerRole(role)) params.set(EXAM_LINK_PARAM, quizId);
  return `/dashboard/${role.toLowerCase()}?${params.toString()}`;
}

export default function ExamLink({ quizId }) {
  const router = useRouter();
  const { user, profile, loading } = useAuth();
  const role = profile?.role;

  useEffect(() => {
    if (loading || !quizId) return;
    if (!user) router.replace(`/login?next=${encodeURIComponent(examPath(quizId))}`);
    else if (role) router.replace(destination(role, quizId));
  }, [loading, quizId, role, router, user]);

  return (
    <main className="grid min-h-screen place-items-center bg-page p-6 text-center text-sm text-muted">
      Opening the exam…
    </main>
  );
}
