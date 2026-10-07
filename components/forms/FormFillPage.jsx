"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Star } from "lucide-react";
import { useAuth } from "../../lib/auth-context";
import { loadFormToFill, submitForm } from "../../lib/services/forms-service";
import { GRID_TYPES, OTHER_PREFIX, validateShortAnswer } from "../../lib/forms-shared";

const FIELD = "w-full rounded-xl border border-border-subtle bg-card px-3 py-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-primary";
const isOther = (value) => typeof value === "string" && value.startsWith(OTHER_PREFIX);
const INPUT_TYPE = { email: "email", number: "text", url: "url", phone: "tel" };

// Fisher–Yates, run once when the form loads (never during render) for
// questions with "Shuffle option order" on.
function shuffled(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
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
  const [optionOrder, setOptionOrder] = useState({});

  useEffect(() => {
    if (loading) return undefined;
    let cancelled = false;
    loadFormToFill(formId)
      .then((data) => {
        if (cancelled) return;
        setForm(data.form);
        setOptionOrder(Object.fromEntries((data.form?.questions || []).filter((q) => q.shuffle).map((q) => [q.id, shuffled(q.options)])));
      })
      .catch((err) => { if (!cancelled) setError(err.message || "Unable to open this form."); });
    return () => { cancelled = true; };
  }, [loading, user, formId]);

  const setAnswer = (id, value) => setAnswers((current) => ({ ...current, [id]: value }));
  function toggleCheckbox(id, option) {
    const current = answers[id] || [];
    setAnswer(id, current.includes(option) ? current.filter((o) => o !== option) : [...current, option]);
  }
  const optionsOf = (q) => optionOrder[q.id] || q.options;
  // Grid answers: { [rowIndex]: column } (grid) or { [rowIndex]: [columns] } (checkgrid).
  function setGridCell(q, rowIndex, column) {
    const current = answers[q.id] || {};
    const key = String(rowIndex);
    if (q.type === "grid") {
      setAnswer(q.id, { ...current, [key]: column });
    } else {
      const picked = current[key] || [];
      setAnswer(q.id, { ...current, [key]: picked.includes(column) ? picked.filter((c) => c !== column) : [...picked, column] });
    }
  }

  async function submit(event) {
    event.preventDefault();
    // Same checks the server runs, so the visitor sees them before sending.
    for (const q of form.questions) {
      const invalid = q.type === "short" ? validateShortAnswer(q.validation, answers[q.id]) : "";
      if (invalid) return setError(`"${q.label}": ${invalid}`);
      if (q.required && GRID_TYPES.includes(q.type)) {
        const value = answers[q.id] || {};
        const answered = q.rows.filter((_, i) => (q.type === "grid" ? value[String(i)] : (value[String(i)] || []).length)).length;
        if (answered < q.rows.length) return setError(`Answer every row of "${q.label}".`);
      }
      if (q.required && q.type === "rating" && !answers[q.id]) return setError(`"${q.label}" is required.`);
    }
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
          {form.closesAt && <p className="mt-1 text-xs text-muted">Open until {form.closesAt}.</p>}
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

        {form.questions.map((q) => q.type === "section" ? (
          <div key={q.id} className="rounded-2xl border-l-4 border-primary bg-card p-5 shadow-sm">
            <h2 className="text-lg font-black text-ink">{q.label}</h2>
            {q.help && <p className="mt-1 whitespace-pre-wrap text-sm text-ink/70">{q.help}</p>}
          </div>
        ) : (
          <fieldset key={q.id} className="rounded-2xl bg-card p-5 shadow-sm">
            <legend className="px-0 text-sm font-bold text-ink">{q.label}{q.required && <span className="text-primary"> *</span>}</legend>
            {q.help && <p className="mt-1 whitespace-pre-wrap text-xs text-muted">{q.help}</p>}
            <div className="mt-3">
              {q.type === "short" && (
                <>
                  <input
                    type={INPUT_TYPE[q.validation] || "text"}
                    inputMode={q.validation === "number" ? "decimal" : undefined}
                    required={q.required}
                    value={answers[q.id] || ""}
                    onChange={(e) => setAnswer(q.id, e.target.value)}
                    className={FIELD}
                  />
                  {validateShortAnswer(q.validation, answers[q.id]) && (
                    <p className="mt-1 text-xs font-semibold text-primary">{validateShortAnswer(q.validation, answers[q.id])}</p>
                  )}
                </>
              )}
              {q.type === "paragraph" && <textarea required={q.required} rows={4} value={answers[q.id] || ""} onChange={(e) => setAnswer(q.id, e.target.value)} className={FIELD} />}
              {q.type === "dropdown" && (
                <select required={q.required} value={answers[q.id] || ""} onChange={(e) => setAnswer(q.id, e.target.value)} className={FIELD}>
                  <option value="">Choose</option>
                  {optionsOf(q).map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              )}
              {q.type === "choice" && (
                <div className="space-y-2">
                  {optionsOf(q).map((o) => (
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
                  {optionsOf(q).map((o) => (
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
              {q.type === "rating" && (
                <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={q.label}>
                  {Array.from({ length: q.scale?.max || 5 }, (_, i) => i + 1).map((n) => (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={answers[q.id] === n}
                      aria-label={`${n} star${n === 1 ? "" : "s"}`}
                      onClick={() => setAnswer(q.id, answers[q.id] === n && !q.required ? undefined : n)}
                      className="rounded-lg p-1 transition hover:scale-110"
                    >
                      <Star className={`h-7 w-7 ${(answers[q.id] || 0) >= n ? "fill-warning text-warning" : "text-subtle"}`} aria-hidden="true" />
                    </button>
                  ))}
                </div>
              )}
              {GRID_TYPES.includes(q.type) && (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[360px] text-center text-xs">
                    <thead>
                      <tr>
                        <th className="p-2" />
                        {q.columns.map((column) => <th key={column} className="p-2 font-semibold text-muted">{column}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {q.rows.map((row, rowIndex) => {
                        const value = (answers[q.id] || {})[String(rowIndex)];
                        return (
                          <tr key={row} className="border-t border-border-subtle">
                            <th scope="row" className="p-2 text-left font-semibold text-ink">{row}</th>
                            {q.columns.map((column) => (
                              <td key={column} className="p-2">
                                <input
                                  type={q.type === "grid" ? "radio" : "checkbox"}
                                  name={`${q.id}_${rowIndex}`}
                                  aria-label={`${row}: ${column}`}
                                  checked={q.type === "grid" ? value === column : (value || []).includes(column)}
                                  onChange={() => setGridCell(q, rowIndex, column)}
                                  className="h-4 w-4"
                                />
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
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
