"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { useAuth } from "../../lib/auth-context";
import { loadFormToFill, submitForm } from "../../lib/services/forms-service";
import { OTHER_PREFIX } from "../../lib/forms-shared";

const FIELD = "w-full rounded-xl border border-border-subtle bg-card px-3 py-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-primary";
const isOther = (value) => typeof value === "string" && value.startsWith(OTHER_PREFIX);
const otherText = (value) => (isOther(value) ? value.slice(OTHER_PREFIX.length) : "");

function Shell({ children }) {
  return (
    <main className="min-h-screen bg-page px-4 py-10">
      <div className="mx-auto w-full max-w-xl">{children}</div>
    </main>
  );
}

// The page behind a shared form link (/forms/<id>). The link is public: anyone
// can fill it; signed-out visitors just give a name and email.
export default function FormFillPage({ formId }) {
  const { user, loading } = useAuth();
  const [guest, setGuest] = useState({ name: "", email: "" });
  const [form, setForm] = useState(null);
  const [answers, setAnswers] = useState({});
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (loading) return undefined;
    let cancelled = false;
    loadFormToFill(formId)
      .then((data) => { if (!cancelled) setForm(data.form); })
      .catch((err) => { if (!cancelled) setError(err.message || "Unable to open this form."); });
    return () => { cancelled = true; };
  }, [loading, user, formId]);

  const setAnswer = (id, value) => setAnswers((current) => ({ ...current, [id]: value }));
  function toggleCheckbox(id, option) {
    const current = answers[id] || [];
    setAnswer(id, current.includes(option) ? current.filter((o) => o !== option) : [...current, option]);
  }

  async function submit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await submitForm(formId, answers, user ? {} : guest);
      setDone(true);
    } catch (err) {
      setError(err.message || "Unable to submit this form.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <Shell><p className="text-center text-sm text-muted">Loading…</p></Shell>;
  if (error && !form) return <Shell><p className="rounded-2xl bg-active p-6 text-center text-sm font-semibold text-primary">{error}</p></Shell>;
  if (!form) return <Shell><p className="text-center text-sm text-muted">Loading form…</p></Shell>;

  if (done || form.alreadySubmitted) {
    return (
      <Shell>
        <div className="rounded-3xl bg-card p-8 text-center shadow-sm">
          <CheckCircle2 className="mx-auto h-10 w-10 text-success" aria-hidden="true" />
          <h1 className="mt-3 text-xl font-black text-ink">{form.title}</h1>
          <p className="mt-2 text-sm text-ink/70">{done ? form.confirmation || "Your response has been recorded. Thank you!" : "You have already filled in this form."}</p>
          <Link href="/" className="mt-5 inline-block text-xs font-bold text-primary hover:underline">Back to home</Link>
        </div>
      </Shell>
    );
  }
  if (!form.open) {
    return (
      <Shell>
        <div className="rounded-3xl bg-card p-8 text-center shadow-sm">
          <h1 className="text-xl font-black text-ink">{form.title}</h1>
          <p className="mt-2 text-sm text-ink/70">This form is closed and is no longer accepting responses.</p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <form onSubmit={submit} className="space-y-4">
        <div className="rounded-3xl border-t-8 border-primary bg-card p-6 shadow-sm">
          <h1 className="text-2xl font-black text-ink">{form.title}</h1>
          {form.description && <p className="mt-2 whitespace-pre-wrap text-sm text-ink/70">{form.description}</p>}
          {user ? (
            <p className="mt-3 text-xs text-muted">Responding as {user.email}. <span className="text-primary">* Required</span></p>
          ) : (
            <p className="mt-3 text-xs text-muted"><span className="text-primary">* Required</span></p>
          )}
        </div>

        {!user && (
          <fieldset className="rounded-2xl bg-card p-5 shadow-sm">
            <legend className="px-0 text-sm font-bold text-ink">Your details <span className="text-primary">*</span></legend>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <input required value={guest.name} onChange={(e) => setGuest({ ...guest, name: e.target.value })} placeholder="Full name" aria-label="Full name" autoComplete="name" className={FIELD} />
              <input required type="email" value={guest.email} onChange={(e) => setGuest({ ...guest, email: e.target.value })} placeholder="Email" aria-label="Email" autoComplete="email" className={FIELD} />
            </div>
          </fieldset>
        )}

        {form.questions.map((q) => (
          <fieldset key={q.id} className="rounded-2xl bg-card p-5 shadow-sm">
            <legend className="px-0 text-sm font-bold text-ink">{q.label}{q.required && <span className="text-primary"> *</span>}</legend>
            {q.help && <p className="mt-1 whitespace-pre-wrap text-xs text-muted">{q.help}</p>}
            <div className="mt-3">
              {q.type === "short" && <input required={q.required} value={answers[q.id] || ""} onChange={(e) => setAnswer(q.id, e.target.value)} className={FIELD} />}
              {q.type === "paragraph" && <textarea required={q.required} rows={4} value={answers[q.id] || ""} onChange={(e) => setAnswer(q.id, e.target.value)} className={FIELD} />}
              {q.type === "dropdown" && (
                <select required={q.required} value={answers[q.id] || ""} onChange={(e) => setAnswer(q.id, e.target.value)} className={FIELD}>
                  <option value="">Choose</option>
                  {q.options.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              )}
              {q.type === "choice" && (
                <div className="space-y-2">
                  {q.options.map((o) => (
                    <label key={o} className="flex items-center gap-2 text-sm text-ink">
                      <input type="radio" name={q.id} required={q.required} checked={answers[q.id] === o} onChange={() => setAnswer(q.id, o)} className="h-4 w-4" /> {o}
                    </label>
                  ))}
                  {q.other && (
                    <div className="flex items-center gap-2 text-sm text-ink">
                      <label className="flex shrink-0 items-center gap-2">
                        <input type="radio" name={q.id} required={q.required} checked={isOther(answers[q.id])} onChange={() => setAnswer(q.id, OTHER_PREFIX)} className="h-4 w-4" /> Other:
                      </label>
                      <input value={otherText(answers[q.id])} disabled={!isOther(answers[q.id])} required={isOther(answers[q.id])} onChange={(e) => setAnswer(q.id, OTHER_PREFIX + e.target.value)} aria-label="Other" className={`${FIELD} py-1.5`} />
                    </div>
                  )}
                </div>
              )}
              {q.type === "checkbox" && (
                <div className="space-y-2">
                  {q.options.map((o) => (
                    <label key={o} className="flex items-center gap-2 text-sm text-ink">
                      <input type="checkbox" checked={(answers[q.id] || []).includes(o)} onChange={() => toggleCheckbox(q.id, o)} className="h-4 w-4 rounded" /> {o}
                    </label>
                  ))}
                  {q.other && (
                    <div className="flex items-center gap-2 text-sm text-ink">
                      <label className="flex shrink-0 items-center gap-2">
                        <input type="checkbox" checked={(answers[q.id] || []).some(isOther)} onChange={(e) => setAnswer(q.id, e.target.checked ? [...(answers[q.id] || []), OTHER_PREFIX] : (answers[q.id] || []).filter((v) => !isOther(v)))} className="h-4 w-4 rounded" /> Other:
                      </label>
                      <input
                        value={otherText((answers[q.id] || []).find(isOther))}
                        disabled={!(answers[q.id] || []).some(isOther)}
                        required={(answers[q.id] || []).some(isOther)}
                        onChange={(e) => setAnswer(q.id, [...(answers[q.id] || []).filter((v) => !isOther(v)), OTHER_PREFIX + e.target.value])}
                        aria-label="Other"
                        className={`${FIELD} py-1.5`}
                      />
                    </div>
                  )}
                </div>
              )}
              {q.type === "scale" && (
                <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
                  {q.scale?.lowLabel && <span className="text-xs text-muted">{q.scale.lowLabel}</span>}
                  {Array.from({ length: (q.scale?.max ?? 5) - (q.scale?.min ?? 1) + 1 }, (_, i) => (q.scale?.min ?? 1) + i).map((n) => (
                    <label key={n} className="flex flex-col items-center gap-1 text-xs font-semibold text-ink">
                      {n}
                      <input type="radio" name={q.id} required={q.required} checked={answers[q.id] === n} onChange={() => setAnswer(q.id, n)} className="h-4 w-4" />
                    </label>
                  ))}
                  {q.scale?.highLabel && <span className="text-xs text-muted">{q.scale.highLabel}</span>}
                </div>
              )}
              {q.type === "date" && <input type="date" required={q.required} value={answers[q.id] || ""} onChange={(e) => setAnswer(q.id, e.target.value)} className={`${FIELD} sm:w-auto`} />}
              {q.type === "time" && <input type="time" required={q.required} value={answers[q.id] || ""} onChange={(e) => setAnswer(q.id, e.target.value)} className={`${FIELD} sm:w-auto`} />}
            </div>
          </fieldset>
        ))}

        {error && <p className="rounded-xl bg-active p-3 text-xs text-primary">{error}</p>}
        <button type="submit" disabled={submitting} className="rounded-xl bg-primary px-6 py-3 text-sm font-bold text-white shadow-md disabled:opacity-60">{submitting ? "Submitting…" : "Submit"}</button>
      </form>
    </Shell>
  );
}
