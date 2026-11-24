"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, CheckCircle2, Clock, MinusCircle, X, XCircle } from "lucide-react";
import { submitQuizAttempt } from "../../lib/exam-data";
import { groupQuestionsByPassage } from "../../lib/exam-shared";
import { useConfirm } from "../ui/ConfirmDialog";
import PassageBlock from "./PassageBlock";

// Full-screen student exam + result screens for Model Test. Long reading
// tests (passages + many questions) need a real workspace, not a small modal:
// sticky top bar (progress, part jump, timer), one reading column, and a
// sticky action bar.

const LETTERS = "ABCDEFGH";
const CARD = "rounded-2xl bg-card ring-1 ring-border-subtle shadow-[0_1px_2px_rgb(31_35_40/0.04),0_12px_32px_-18px_rgb(31_35_40/0.18)]";
const PASS_PERCENT = 60; // same pass mark the submit route records

// "A. sentence" options already carry their letter: show it once, in the badge.
function splitOption(option, index) {
  const letter = LETTERS[index] || String(index + 1);
  const match = /^([A-H])\.\s+([\s\S]*)$/.exec(option);
  return { letter, label: match && match[1] === letter ? match[2] : option };
}

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

function scrollToId(id) {
  const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  document.getElementById(id)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
}

function TopBar({ title, subtitle, onClose, closeLabel, right, children }) {
  const titleRef = useRef(null);
  useEffect(() => { titleRef.current?.focus(); }, []);
  return (
    <header className="shrink-0 border-b border-border-subtle bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85">
      <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3 sm:px-6">
        <button
          type="button"
          onClick={onClose}
          aria-label={closeLabel}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-muted transition-colors duration-200 hover:bg-page hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 active:scale-95"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
        <div className="min-w-0 flex-1">
          <h2 ref={titleRef} tabIndex={-1} id="exam-screen-title" className="truncate text-[15px] font-semibold tracking-tight text-ink outline-none">{title}</h2>
          {subtitle && <p className="truncate text-xs tabular-nums text-muted">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </header>
  );
}

// `submitAttempt` is injectable only so the screen can be exercised with
// mocked grading; the dashboard always uses the real server-graded submit.
export function TakeExam({ quiz, onClose, onSubmitted, submitAttempt = submitQuizAttempt }) {
  const confirm = useConfirm();
  const [answers, setAnswers] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const groups = useMemo(() => groupQuestionsByPassage(quiz.questions, quiz.passages), [quiz.questions, quiz.passages]);
  const total = quiz.questions.length;
  const answeredCount = quiz.questions.filter((q) => answers[q.id] !== undefined).length;
  const unanswered = total - answeredCount;
  const parts = groups.filter((g) => g.passage);

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const result = await submitAttempt(quiz.id, answers);
      onSubmitted(result);
    } catch (e) {
      setError(e.message || "Unable to submit this exam.");
      setSubmitting(false);
    }
  }

  async function requestSubmit() {
    if (submitting) return;
    if (unanswered > 0) {
      const ok = await confirm({
        title: "Submit the exam?",
        message: `${unanswered} question${unanswered === 1 ? " is" : "s are"} still unanswered. An empty answer scores zero.`,
        tone: "neutral",
        confirmLabel: "Submit anyway",
      });
      if (!ok) return;
    }
    submit();
  }

  async function requestClose() {
    if (submitting) return;
    if (answeredCount > 0) {
      const ok = await confirm({
        title: "Leave this exam?",
        message: "Your answers are not submitted yet and will be lost. Leaving does not use an attempt.",
        tone: "danger",
        confirmLabel: "Leave",
      });
      if (!ok) return;
    }
    onClose();
  }

  const secondsLeft = useCountdown(quiz.timeLimitMinutes, () => submit());
  const low = secondsLeft != null && secondsLeft < 300;
  const critical = secondsLeft != null && secondsLeft < 60;
  const progress = total ? Math.round((answeredCount / total) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-page font-sans" role="dialog" aria-modal="true" aria-labelledby="exam-screen-title">
      <TopBar
        title={quiz.title}
        subtitle={`${answeredCount} of ${total} answered · ${quiz.totalPoints} points`}
        onClose={requestClose}
        closeLabel="Leave exam"
        right={quiz.timeLimitMinutes ? (
          <span
            role="timer"
            aria-label={`Time left ${formatClock(secondsLeft)}`}
            className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold tabular-nums ring-1 transition-colors duration-300 ${low ? "bg-active text-primary ring-red-line" : "bg-page text-ink ring-border-subtle"}`}
          >
            <Clock className={`h-4 w-4 ${critical ? "motion-safe:animate-pulse" : ""}`} aria-hidden="true" />
            {formatClock(secondsLeft)}
          </span>
        ) : null}
      >
        <div className="h-1 bg-border-subtle/60" aria-hidden="true">
          <div className="h-full origin-left bg-primary transition-transform duration-300 ease-out" style={{ transform: `scaleX(${progress / 100})` }} />
        </div>
        {parts.length > 1 && (
          <nav aria-label="Parts" className="mx-auto flex max-w-3xl gap-2 overflow-x-auto px-4 py-2 [scrollbar-width:none] sm:px-6">
            {parts.map((group) => {
              const done = group.items.filter(({ question }) => answers[question.id] !== undefined).length;
              const complete = done === group.items.length;
              return (
                <button
                  key={group.passage.id}
                  type="button"
                  onClick={() => scrollToId(`exam-part-${group.part}`)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 active:scale-[0.97] ${complete ? "bg-success-soft text-success" : "bg-page text-muted hover:text-ink"}`}
                >
                  {complete && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                  Part {group.part}
                  <span className="tabular-nums opacity-70">{done}/{group.items.length}</span>
                </button>
              );
            })}
          </nav>
        )}
      </TopBar>

      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto max-w-3xl space-y-8 px-4 pb-10 pt-6 sm:px-6 sm:pt-8">
          {quiz.description && <p className="max-w-[65ch] text-pretty text-sm leading-relaxed text-muted">{quiz.description}</p>}
          {groups.map((group, groupIndex) => (
            <section key={group.passage?.id || `group-${groupIndex}`} id={group.part ? `exam-part-${group.part}` : undefined} className="scroll-mt-4 space-y-4">
              <PassageBlock passage={group.passage} part={group.part} partCount={group.partCount} />
              {group.items.map(({ question, number }) => {
                const chosen = answers[question.id];
                return (
                  <fieldset key={question.id} className={`${CARD} p-4 sm:p-5`}>
                    <legend className="sr-only">Question {number}</legend>
                    <div className="mb-3.5 flex items-start gap-3">
                      <span className={`grid h-7 min-w-7 shrink-0 place-items-center rounded-lg px-1.5 text-xs font-semibold tabular-nums transition-colors duration-200 ${chosen !== undefined ? "bg-primary text-white" : "bg-page text-muted ring-1 ring-border-subtle"}`}>
                        {number}
                      </span>
                      <p className="whitespace-pre-line text-pretty break-words pt-0.5 text-[15px] font-medium leading-snug text-ink">{question.text}</p>
                    </div>
                    <div className="grid gap-2 sm:pl-10">
                      {question.options.map((option, optIndex) => {
                        const checked = chosen === optIndex;
                        const { letter, label } = splitOption(option, optIndex);
                        return (
                          <label
                            key={optIndex}
                            className={`group flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 text-sm transition-[background-color,border-color,box-shadow,transform] duration-200 active:scale-[0.995] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/40 ${checked ? "border-primary bg-active text-ink shadow-[0_6px_18px_-12px_rgb(255_45_45/0.55)]" : "border-border-subtle text-ink hover:border-red-line hover:bg-page"}`}
                          >
                            <input
                              type="radio"
                              name={question.id}
                              className="sr-only"
                              checked={checked}
                              onChange={() => setAnswers((current) => ({ ...current, [question.id]: optIndex }))}
                            />
                            <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-md text-[11px] font-semibold transition-colors duration-200 ${checked ? "bg-primary text-white" : "bg-page text-muted ring-1 ring-border-subtle group-hover:text-ink"}`} aria-hidden="true">
                              {letter}
                            </span>
                            <span className="min-w-0 break-words pt-0.5 leading-snug">{label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                );
              })}
            </section>
          ))}
        </div>
      </main>

      <footer className="shrink-0 border-t border-border-subtle bg-card">
        {error && <p className="mx-auto max-w-3xl px-4 pt-3 text-sm font-medium text-primary sm:px-6" role="alert">{error}</p>}
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3 sm:px-6">
          <p className="min-w-0 flex-1 text-xs text-muted" aria-live="polite">
            {unanswered ? <><b className="font-semibold tabular-nums text-ink">{unanswered}</b> unanswered</> : <span className="font-semibold text-success">All questions answered</span>}
          </p>
          <button type="button" onClick={requestClose} disabled={submitting} className="hidden rounded-xl px-4 py-2.5 text-sm font-semibold text-muted transition-colors hover:text-ink sm:block">
            Leave
          </button>
          <button
            type="button"
            onClick={requestSubmit}
            disabled={submitting}
            className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-[0_8px_20px_-10px_rgb(255_45_45/0.7)] transition-[background-color,transform] duration-200 hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 active:scale-[0.98] disabled:opacity-50"
          >
            {submitting ? "Submitting…" : "Submit exam"}
          </button>
        </div>
      </footer>
    </div>
  );
}

function ScoreRing({ percentage, passed }) {
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const value = Math.max(0, Math.min(100, percentage || 0));
  return (
    <div className="relative h-28 w-28 shrink-0">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="50" cy="50" r={radius} fill="none" strokeWidth="8" className="stroke-border-subtle" />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - value / 100)}
          className={`${passed ? "stroke-success" : "stroke-primary"} transition-[stroke-dashoffset] duration-700 ease-out`}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-xl font-semibold tabular-nums tracking-tight text-ink">{value}%</span>
    </div>
  );
}

export function ResultView({ quiz, result, onClose }) {
  const [mistakesOnly, setMistakesOnly] = useState(false);
  const groups = useMemo(() => groupQuestionsByPassage(quiz.questions, quiz.passages), [quiz.questions, quiz.passages]);
  const details = useMemo(() => new Map((result.perQuestion || []).map((p) => [p.questionId, p])), [result.perQuestion]);
  const total = quiz.questions.length;
  const correctCount = quiz.questions.filter((q) => details.get(q.id)?.correct).length;
  const blankCount = quiz.questions.filter((q) => !details.get(q.id)?.correct && details.get(q.id)?.selectedOptionIndex == null).length;
  const wrongCount = total - correctCount - blankCount;
  const passed = (result.percentage || 0) >= PASS_PERCENT;
  const parts = groups.filter((g) => g.passage);
  const shown = groups
    .map((g) => ({ ...g, items: mistakesOnly ? g.items.filter(({ question }) => !details.get(question.id)?.correct) : g.items }))
    .filter((g) => g.items.length);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-page font-sans" role="dialog" aria-modal="true" aria-labelledby="exam-screen-title">
      <TopBar title={quiz.title} subtitle="Result" onClose={onClose} closeLabel="Close result" />

      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto max-w-3xl space-y-8 px-4 pb-10 pt-6 sm:px-6 sm:pt-8">
          <section className={`${CARD} p-5 sm:p-7`} aria-label="Score">
            <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:text-left">
              <ScoreRing percentage={result.percentage} passed={passed} />
              <div className="min-w-0 space-y-1.5">
                <p className="text-xs font-medium text-muted">Your score</p>
                <p className="text-4xl font-semibold tabular-nums tracking-tight text-ink">
                  {result.score}<span className="text-xl font-medium text-subtle"> / {result.maxScore}</span>
                </p>
                <p className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs font-medium text-muted sm:justify-start">
                  <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden="true" />{correctCount} correct</span>
                  <span className="inline-flex items-center gap-1"><XCircle className="h-3.5 w-3.5 text-primary" aria-hidden="true" />{wrongCount} wrong</span>
                  {blankCount > 0 && <span className="inline-flex items-center gap-1"><MinusCircle className="h-3.5 w-3.5 text-subtle" aria-hidden="true" />{blankCount} not answered</span>}
                </p>
                <p className={`text-xs font-semibold ${passed ? "text-success" : "text-primary"}`}>
                  {passed ? `Above the ${PASS_PERCENT}% pass mark` : `Below the ${PASS_PERCENT}% pass mark`}
                </p>
              </div>
            </div>

            {parts.length > 1 && (
              <div className="mt-6 grid grid-cols-2 gap-2 border-t border-border-subtle pt-5 sm:grid-cols-3 md:grid-cols-5">
                {parts.map((group) => {
                  const right = group.items.filter(({ question }) => details.get(question.id)?.correct).length;
                  return (
                    <button
                      key={group.passage.id}
                      type="button"
                      onClick={() => { setMistakesOnly(false); requestAnimationFrame(() => scrollToId(`result-part-${group.part}`)); }}
                      className="rounded-xl bg-page px-3 py-2.5 text-left transition-colors duration-200 hover:bg-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                    >
                      <span className="block text-[11px] font-medium text-muted">Part {group.part}</span>
                      <span className="block text-base font-semibold tabular-nums text-ink">{right}/{group.items.length}</span>
                      <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-border-subtle" aria-hidden="true">
                        <span className={`block h-full origin-left rounded-full ${right === group.items.length ? "bg-success" : "bg-primary"}`} style={{ transform: `scaleX(${group.items.length ? right / group.items.length : 0})` }} />
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-base font-semibold tracking-tight text-ink">Answers</h3>
            <div className="flex rounded-xl bg-card p-1 ring-1 ring-border-subtle" role="group" aria-label="Show">
              {[[false, "All questions"], [true, `Mistakes only (${total - correctCount})`]].map(([value, text]) => (
                <button
                  key={String(value)}
                  type="button"
                  aria-pressed={mistakesOnly === value}
                  onClick={() => setMistakesOnly(value)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors duration-200 ${mistakesOnly === value ? "bg-ink text-card" : "text-muted hover:text-ink"}`}
                >
                  {text}
                </button>
              ))}
            </div>
          </div>

          {!shown.length && (
            <p className={`${CARD} px-5 py-10 text-center text-sm font-medium text-success`}>No mistakes. Every answer is correct.</p>
          )}

          {shown.map((group, groupIndex) => (
            <section key={group.passage?.id || `group-${groupIndex}`} id={group.part ? `result-part-${group.part}` : undefined} className="scroll-mt-4 space-y-4">
              <PassageBlock passage={group.passage} part={group.part} partCount={group.partCount} collapsible />
              {group.items.map(({ question, number }) => {
                const detail = details.get(question.id);
                const state = detail?.correct ? "correct" : detail?.selectedOptionIndex == null ? "blank" : "wrong";
                return (
                  <article key={question.id} className={`${CARD} p-4 sm:p-5`}>
                    <div className="mb-3.5 flex items-start gap-3">
                      <span className={`grid h-7 min-w-7 shrink-0 place-items-center rounded-lg px-1.5 text-xs font-semibold tabular-nums ${state === "correct" ? "bg-success-soft text-success" : state === "wrong" ? "bg-active text-primary" : "bg-page text-muted ring-1 ring-border-subtle"}`}>
                        {number}
                      </span>
                      <p className="min-w-0 flex-1 whitespace-pre-line text-pretty break-words pt-0.5 text-[15px] font-medium leading-snug text-ink">{question.text}</p>
                      <span className={`shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold ${state === "correct" ? "bg-success-soft text-success" : state === "wrong" ? "bg-active text-primary" : "bg-page text-muted"}`}>
                        {state === "correct" ? "Correct" : state === "wrong" ? "Wrong" : "Not answered"}
                      </span>
                    </div>
                    <div className="grid gap-1.5 sm:pl-10">
                      {question.options.map((option, optIndex) => {
                        const isCorrect = optIndex === detail?.correctOptionIndex;
                        const isSelected = optIndex === detail?.selectedOptionIndex;
                        const { letter, label } = splitOption(option, optIndex);
                        return (
                          <div
                            key={optIndex}
                            className={`flex items-start gap-3 rounded-xl px-3 py-2 text-sm ${isCorrect ? "bg-success-soft text-ink ring-1 ring-success/40" : isSelected ? "bg-active text-ink ring-1 ring-red-line" : "text-muted"}`}
                          >
                            <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-md text-[11px] font-semibold ${isCorrect ? "bg-success text-white" : isSelected ? "bg-primary text-white" : "bg-page ring-1 ring-border-subtle"}`} aria-hidden="true">
                              {letter}
                            </span>
                            <span className="min-w-0 flex-1 break-words pt-0.5 leading-snug">{label}</span>
                            {(isCorrect || isSelected) && (
                              <span className={`shrink-0 pt-0.5 text-[11px] font-semibold ${isCorrect ? "text-success" : "text-primary"}`}>
                                {isCorrect && isSelected ? "Your answer ✓" : isCorrect ? "Correct answer" : "Your answer"}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </article>
                );
              })}
            </section>
          ))}
        </div>
      </main>

      <footer className="shrink-0 border-t border-border-subtle bg-card">
        <div className="mx-auto flex max-w-3xl justify-end px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-ink px-5 py-2.5 text-sm font-semibold text-card transition-[opacity,transform] duration-200 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 active:scale-[0.98]"
          >
            Done
          </button>
        </div>
      </footer>
    </div>
  );
}
