"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ClipboardList, Clock, XCircle } from "lucide-react";
import { subscribeMyEnrollments } from "../../lib/student-data";
import { subscribeMyAttempts, subscribeStudentQuizzes, submitQuizAttempt } from "../../lib/exam-data";

function useCountdown(minutes, onExpire) {
  const [secondsLeft, setSecondsLeft] = useState(minutes ? minutes * 60 : null);
  useEffect(() => {
    if (!minutes) return undefined;
    const timer = setInterval(() => {
      setSecondsLeft((current) => {
        if (current <= 1) {
          clearInterval(timer);
          onExpire();
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minutes]);
  return secondsLeft;
}

function formatClock(seconds) {
  if (seconds == null) return "";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function TakeExam({ quiz, onClose, onSubmitted }) {
  const [answers, setAnswers] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const result = await submitQuizAttempt(quiz.id, answers);
      onSubmitted(result);
    } catch (e) {
      setError(e.message || "Unable to submit this exam.");
      setSubmitting(false);
    }
  }

  const secondsLeft = useCountdown(quiz.timeLimitMinutes, () => submit());

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 p-4">
      <div className="mx-auto max-w-2xl space-y-4 rounded-3xl bg-card p-6 shadow-2xl">
        <div className="flex items-center justify-between gap-4 border-b border-border-subtle pb-4">
          <div>
            <h2 className="text-lg font-bold text-ink">{quiz.title}</h2>
            <p className="text-xs text-muted">{quiz.questions.length} questions · {quiz.totalPoints} points</p>
          </div>
          {quiz.timeLimitMinutes && (
            <span className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${secondsLeft < 60 ? "bg-active text-primary" : "bg-page text-ink"}`}>
              <Clock className="h-3.5 w-3.5" aria-hidden="true" /> {formatClock(secondsLeft)}
            </span>
          )}
        </div>

        <div className="space-y-4">
          {quiz.questions.map((question, index) => (
            <div key={question.id} className="rounded-2xl border border-border-subtle p-4">
              <p className="mb-3 text-sm font-semibold text-ink">{index + 1}. {question.text}</p>
              <div className="space-y-2">
                {question.options.map((option, optIndex) => (
                  <label key={optIndex} className="flex items-center gap-2 rounded-xl border border-border-subtle px-3 py-2 text-sm text-ink hover:bg-page has-[:checked]:border-primary has-[:checked]:bg-active">
                    <input
                      type="radio"
                      name={question.id}
                      checked={answers[question.id] === optIndex}
                      onChange={() => setAnswers((current) => ({ ...current, [question.id]: optIndex }))}
                    />
                    {option}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        {error && <p className="rounded-xl bg-active px-3 py-2 text-sm text-primary">{error}</p>}
        <div className="flex justify-end gap-3 border-t border-border-subtle pt-4">
          <button type="button" onClick={onClose} disabled={submitting} className="rounded-xl px-4 py-2.5 text-sm font-bold text-muted">Cancel</button>
          <button type="button" onClick={submit} disabled={submitting} className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">{submitting ? "Submitting…" : "Submit exam"}</button>
        </div>
      </div>
    </div>
  );
}

function ResultView({ quiz, result, onClose }) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 p-4">
      <div className="mx-auto max-w-2xl space-y-4 rounded-3xl bg-card p-6 shadow-2xl">
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-wider text-subtle">{quiz.title}</p>
          <p className="mt-1 text-4xl font-black text-ink">{result.score}/{result.maxScore}</p>
          <p className="text-sm font-bold text-muted">{result.percentage}%</p>
        </div>
        <div className="space-y-3">
          {quiz.questions.map((question, index) => {
            const detail = result.perQuestion.find((p) => p.questionId === question.id);
            return (
              <div key={question.id} className="rounded-2xl border border-border-subtle p-4">
                <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
                  {detail?.correct ? <CheckCircle2 className="h-4 w-4 shrink-0 text-success" /> : <XCircle className="h-4 w-4 shrink-0 text-primary" />}
                  {index + 1}. {question.text}
                </p>
                <div className="space-y-1.5">
                  {question.options.map((option, optIndex) => {
                    const isCorrect = optIndex === detail?.correctOptionIndex;
                    const isSelected = optIndex === detail?.selectedOptionIndex;
                    return (
                      <p
                        key={optIndex}
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${isCorrect ? "bg-success-soft text-success" : isSelected ? "bg-active text-primary" : "text-muted"}`}
                      >
                        {option}{isCorrect ? " ✓" : isSelected ? " (your answer)" : ""}
                      </p>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex justify-end border-t border-border-subtle pt-4">
          <button type="button" onClick={onClose} className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white">Close</button>
        </div>
      </div>
    </div>
  );
}

export default function StudentExams({ uid }) {
  const [enrollments, setEnrollments] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
  const [attempts, setAttempts] = useState([]);
  const [taking, setTaking] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => subscribeMyEnrollments(uid, setEnrollments, () => {}), [uid]);
  const courseIds = useMemo(() => [...new Set(enrollments.map((e) => e.courseId))], [enrollments]);
  const courseTitle = useMemo(() => new Map(enrollments.map((e) => [e.courseId, e.courseTitle])), [enrollments]);

  useEffect(() => subscribeStudentQuizzes(courseIds, setQuizzes, () => {}), [courseIds.join(",")]);
  useEffect(() => subscribeMyAttempts(uid, setAttempts, () => {}), [uid]);

  const attemptsByQuiz = useMemo(() => {
    const map = new Map();
    attempts.forEach((a) => {
      if (!map.has(a.quizId)) map.set(a.quizId, []);
      map.get(a.quizId).push(a);
    });
    return map;
  }, [attempts]);

  return (
    <div className="space-y-6">
      <section className="flex items-center gap-3 rounded-2xl border border-[#f3aaaa] bg-[linear-gradient(120deg,#fff0f0_0%,#fff7f7_45%,#ffffff_100%)] p-4 text-ink shadow-sm md:p-5">
        <div className="rounded-2xl bg-active p-2"><ClipboardList className="h-5 w-5 text-primary" aria-hidden="true" /></div>
        <div>
          <h2 className="text-lg font-black sm:text-xl">Exams &amp; Quizzes</h2>
          <p className="mt-1 text-xs text-muted">Take exams published for the courses you&apos;re enrolled in.</p>
        </div>
      </section>

      {!quizzes.length ? (
        <div className="rounded-3xl border border-dashed border-border-subtle bg-card py-16 text-center">
          <p className="font-bold text-ink">No exams available yet.</p>
          <p className="mt-1 text-sm text-muted">Your teacher hasn&apos;t published an exam for your courses yet.</p>
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
