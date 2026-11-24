"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ClipboardList, X } from "lucide-react";
import { subscribeMyEnrollments } from "../../lib/student-data";
import { subscribeMyAttempts, subscribeStudentQuizzes } from "../../lib/exam-data";
import { compareQuizTitles, EXAM_LINK_PARAM } from "../../lib/exam-shared";
import { useSessionTab } from "../../lib/page-refresh";
import { useConfirm } from "../ui/ConfirmDialog";
import { LayoutToggle, StudentAssignments } from "./AssignmentsPanel";
import { ResultView, TakeExam } from "./ExamScreens";

const MODEL_TEST_TABS = ["Model Test", "Assignment"];

// ?exam=<quizId> comes from an exam's QR / short link (/exam/<quizId>).
function readLinkedExamId() {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(EXAM_LINK_PARAM);
}
function clearLinkedExamParam() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(EXAM_LINK_PARAM)) return;
  url.searchParams.delete(EXAM_LINK_PARAM);
  window.history.replaceState(null, "", url);
}

export default function StudentExams({ uid }) {
  const confirm = useConfirm();
  const [enrollments, setEnrollments] = useState([]);
  const [enrollmentsLoaded, setEnrollmentsLoaded] = useState(false);
  const [quizzes, setQuizzes] = useState([]);
  const [quizzesKey, setQuizzesKey] = useState(null);
  const [attempts, setAttempts] = useState([]);
  const [attemptsLoaded, setAttemptsLoaded] = useState(false);
  const [taking, setTaking] = useState(null);
  const [result, setResult] = useState(null);
  const [linkedExamId, setLinkedExamId] = useState(readLinkedExamId);
  const linkHandled = useRef(false);
  const [tab, setTab] = useSessionTab("student-model-test", "Model Test", MODEL_TEST_TABS);
  const [layout, setLayout] = useSessionTab("student-model-test-layout", "grid", ["grid", "list"]);

  useEffect(() => subscribeMyEnrollments(
    uid,
    (rows) => { setEnrollments(rows); setEnrollmentsLoaded(true); },
    () => setEnrollmentsLoaded(true),
  ), [uid]);
  const courseIds = useMemo(() => [...new Set(enrollments.map((e) => e.courseId))], [enrollments]);
  const courseKey = courseIds.join(",");
  const courseTitle = useMemo(() => new Map(enrollments.map((e) => [e.courseId, e.courseTitle])), [enrollments]);

  useEffect(() => subscribeStudentQuizzes(
    courseIds,
    (rows) => { setQuizzes([...rows].sort(compareQuizTitles)); setQuizzesKey(courseKey); },
    () => setQuizzesKey(courseKey),
  ), [courseKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => subscribeMyAttempts(
    uid,
    (rows) => { setAttempts(rows); setAttemptsLoaded(true); },
    () => setAttemptsLoaded(true),
  ), [uid]);

  const attemptsByQuiz = useMemo(() => {
    const map = new Map();
    attempts.forEach((a) => {
      if (!map.has(a.quizId)) map.set(a.quizId, []);
      map.get(a.quizId).push(a);
    });
    return map;
  }, [attempts]);

  // Opened from an exam's QR / short link: once the exam and the student's
  // attempts are known, offer to start it (one prompt per visit).
  const linkedQuiz = linkedExamId ? quizzes.find((q) => q.id === linkedExamId) || null : null;
  const linkedAttemptsUsed = linkedQuiz ? (attemptsByQuiz.get(linkedQuiz.id) || []).length : 0;
  const linkedAttemptsMax = linkedQuiz?.maxAttempts || 1;
  useEffect(() => {
    if (!linkedQuiz || !attemptsLoaded || linkHandled.current) return;
    linkHandled.current = true;
    clearLinkedExamParam();
    if (linkedAttemptsUsed >= linkedAttemptsMax) return;
    const minutes = linkedQuiz.timeLimitMinutes;
    confirm({
      title: `Start "${linkedQuiz.title}"?`,
      message: `${linkedQuiz.questions?.length || 0} questions${minutes ? ` · ${minutes} minutes` : ""} · attempt ${linkedAttemptsUsed + 1} of ${linkedAttemptsMax}.${minutes ? " The timer starts when you press Start." : ""}`,
      tone: "neutral",
      confirmLabel: "Start exam",
    }).then((ok) => {
      setTab("Model Test");
      setLinkedExamId(null);
      if (ok) setTaking(linkedQuiz);
    });
  }, [attemptsLoaded, confirm, linkedAttemptsMax, linkedAttemptsUsed, linkedQuiz, setTab]);

  const linkReady = enrollmentsLoaded && quizzesKey === courseKey;
  const linkNotice = !linkedExamId
    ? ""
    : linkedQuiz
      ? (attemptsLoaded && linkedAttemptsUsed >= linkedAttemptsMax ? `You have used all ${linkedAttemptsMax} attempt${linkedAttemptsMax === 1 ? "" : "s"} for "${linkedQuiz.title}".` : "")
      : (linkReady ? "This exam isn't open for you. It may not be published yet, or you aren't enrolled in its course." : "");

  return (
    <div className="space-y-6">
      <section className="flex items-center gap-3 rounded-2xl border border-[#f3aaaa] bg-[linear-gradient(120deg,#fff0f0_0%,#fff7f7_45%,#ffffff_100%)] p-4 text-ink shadow-sm md:p-5">
        <div className="rounded-2xl bg-active p-2"><ClipboardList className="h-5 w-5 text-primary" aria-hidden="true" /></div>
        <div>
          <h2 className="text-lg font-black sm:text-xl">Model Test</h2>
          <p className="mt-1 text-xs text-muted">
            {tab === "Assignment"
              ? "Assignments from your teachers — submit your work online and see your grade and feedback."
              : "Take exams published for the courses you're enrolled in."}
          </p>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex gap-1 rounded-2xl border border-border-subtle bg-card p-1 shadow-sm">
          {MODEL_TEST_TABS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setTab(item)}
              className={`rounded-xl px-4 py-2 text-xs font-bold ${tab === item ? "bg-primary text-white" : "text-muted hover:bg-active"}`}
            >
              {item}
            </button>
          ))}
        </nav>
        <LayoutToggle value={layout} onChange={setLayout} />
      </div>

      {linkNotice && (
        <div className="flex items-start gap-3 rounded-2xl bg-warning-soft px-4 py-3 text-sm font-medium text-ink ring-1 ring-warning/30" role="status">
          <p className="min-w-0 flex-1">{linkNotice}</p>
          <button
            type="button"
            onClick={() => { clearLinkedExamParam(); setLinkedExamId(null); }}
            aria-label="Dismiss"
            className="shrink-0 rounded-lg p-1 text-muted transition-colors hover:bg-card hover:text-ink"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {tab === "Assignment" ? (
        <StudentAssignments uid={uid} enrollments={enrollments} layout={layout} />
      ) : !quizzes.length ? (
        <div className="rounded-3xl border border-dashed border-border-subtle bg-card py-16 text-center">
          <p className="font-bold text-ink">No exams available yet.</p>
          <p className="mt-1 text-sm text-muted">Your teacher hasn&apos;t published an exam for your courses yet.</p>
        </div>
      ) : layout === "list" ? (
        <div className="overflow-x-auto rounded-2xl border border-border-subtle bg-card shadow-sm">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-page text-[10px] font-black uppercase tracking-wider text-muted">
              <tr>{["Exam", "Training", "Questions", "Best score", ""].map((h, i) => <th key={i} className="px-4 py-3">{h}</th>)}</tr>
            </thead>
            <tbody>
              {quizzes.map((quiz) => {
                const mine = attemptsByQuiz.get(quiz.id) || [];
                const attemptsLeft = (quiz.maxAttempts || 1) - mine.length;
                const best = mine.reduce((max, a) => (a.percentage > (max?.percentage ?? -1) ? a : max), null);
                return (
                  <tr key={quiz.id} className="border-t border-border-subtle">
                    <td className="px-4 py-3 font-bold text-ink">{quiz.title}</td>
                    <td className="px-4 py-3 text-xs text-muted">{courseTitle.get(quiz.courseId) || "Course"}</td>
                    <td className="px-4 py-3 text-xs text-muted">{quiz.questions?.length || 0}{quiz.timeLimitMinutes ? ` · ${quiz.timeLimitMinutes} min` : ""}</td>
                    <td className="px-4 py-3 text-xs font-bold text-success">{best ? `${best.score}/${best.maxScore} (${best.percentage}%)` : "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap justify-end gap-2">
                        {attemptsLeft > 0 ? (
                          <button type="button" onClick={() => setTaking(quiz)} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white">{mine.length ? "Retake" : "Start"}</button>
                        ) : (
                          <span className="text-xs font-bold text-subtle">No attempts left</span>
                        )}
                        {best && <button type="button" onClick={() => setResult({ quiz, result: best })} className="rounded-lg border border-border-subtle px-3 py-1.5 text-xs font-bold text-ink hover:bg-page">Result</button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {quizzes.map((quiz) => {
            const mine = attemptsByQuiz.get(quiz.id) || [];
            const attemptsLeft = (quiz.maxAttempts || 1) - mine.length;
            const best = mine.reduce((max, a) => (a.percentage > (max?.percentage ?? -1) ? a : max), null);
            return (
              <article key={quiz.id} className="flex flex-col gap-3 rounded-2xl border border-border-subtle bg-card p-4 shadow-sm">
                <div>
                  <b className="block text-ink">{quiz.title}</b>
                  <span className="text-xs text-muted">{courseTitle.get(quiz.courseId) || "Course"}</span>
                </div>
                <div className="flex flex-wrap gap-3 text-[11px] font-semibold text-subtle">
                  <span>{quiz.questions?.length || 0} questions</span>
                  <span>{quiz.totalPoints || 0} points</span>
                  {quiz.timeLimitMinutes && <span>{quiz.timeLimitMinutes} min</span>}
                </div>
                {best && <p className="text-xs font-bold text-success">Best score: {best.score}/{best.maxScore} ({best.percentage}%)</p>}
                <div className="mt-auto flex flex-wrap gap-2 border-t border-border-subtle pt-3">
                  {attemptsLeft > 0 ? (
                    <button type="button" onClick={() => setTaking(quiz)} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white">
                      {mine.length ? "Retake exam" : "Start exam"} {quiz.maxAttempts > 1 ? `(${attemptsLeft} left)` : ""}
                    </button>
                  ) : (
                    <span className="text-xs font-bold text-subtle">No attempts left</span>
                  )}
                  {best && <button type="button" onClick={() => setResult({ quiz, result: best })} className="rounded-lg border border-border-subtle px-3 py-1.5 text-xs font-bold text-ink hover:bg-page">View result</button>}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {taking && (
        <TakeExam
          quiz={taking}
          onClose={() => setTaking(null)}
          onSubmitted={(res) => { setTaking(null); setResult({ quiz: taking, result: res }); }}
        />
      )}
      {result && <ResultView quiz={result.quiz} result={result.result} onClose={() => setResult(null)} />}
    </div>
  );
}
