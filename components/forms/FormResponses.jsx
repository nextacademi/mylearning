"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Link2 } from "lucide-react";
import { loadFormResponses } from "../../lib/services/forms-service";
import { formLink } from "../../lib/forms-shared";

const formatAnswer = (value) => (Array.isArray(value) ? value.join(", ") : value ?? "");
const formatWhen = (iso) => (iso ? new Date(iso).toLocaleString() : "");

// Opened from a form's card: who filled it in, when, and what they answered.
export default function FormResponses({ form, onBack }) {
  const [responses, setResponses] = useState(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [openId, setOpenId] = useState("");

  useEffect(() => {
    let cancelled = false;
    loadFormResponses(form.id)
      .then((data) => { if (!cancelled) setResponses(data.responses || []); })
      .catch((err) => { if (!cancelled) setError(err.message || "Unable to load responses."); });
    return () => { cancelled = true; };
  }, [form.id]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(formLink(window.location.origin, form.id));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked — the link is also shown on the page.
    }
  }

  const link = typeof window === "undefined" ? "" : formLink(window.location.origin, form.id);

  return (
    <div className="space-y-5">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All forms
      </button>
      <div className="rounded-2xl border border-border-subtle bg-card p-5">
        <h2 className="text-xl font-black text-ink">{form.title}</h2>
        {form.description && <p className="mt-1 text-sm text-ink/70">{form.description}</p>}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <code className="min-w-0 flex-1 truncate rounded-lg bg-page px-3 py-2 text-xs text-ink">{link}</code>
          <button type="button" onClick={copyLink} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white">
            <Link2 className="h-4 w-4" aria-hidden="true" /> {copied ? "Copied" : "Copy link"}
          </button>
        </div>
      </div>

      <h3 className="text-lg font-bold text-ink">
        Responses {responses && <span className="text-sm font-semibold text-muted">({responses.length})</span>}
      </h3>
      {error && <p className="rounded-xl bg-active p-4 text-sm text-primary">{error}</p>}
      {!responses && !error && <p className="text-sm text-muted">Loading responses…</p>}
      {responses && !responses.length && (
        <p className="rounded-2xl border border-dashed border-border-subtle bg-card p-8 text-center text-sm font-semibold text-ink/70">Nobody has filled in this form yet.</p>
      )}
      {responses?.length > 0 && (
        <div className="divide-y divide-border-subtle overflow-hidden rounded-2xl border border-border-subtle bg-card">
          {responses.map((response) => (
            <div key={response.id}>
              <button type="button" onClick={() => setOpenId(openId === response.id ? "" : response.id)} className="flex w-full flex-wrap items-center gap-x-6 gap-y-1 p-4 text-left hover:bg-page">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                <b className="min-w-[140px] text-sm text-ink">{response.name}</b>
                <span className="min-w-[180px] flex-1 text-xs text-muted">{response.email}</span>
                <span className="text-xs font-semibold text-muted">{formatWhen(response.submittedAt)}</span>
              </button>
              {openId === response.id && (
                <dl className="space-y-3 bg-page/60 px-5 py-4">
                  {form.questions.map((q) => (
                    <div key={q.id}>
                      <dt className="text-xs font-bold text-ink">{q.label}</dt>
                      <dd className="mt-0.5 whitespace-pre-wrap text-sm text-ink/80">{formatAnswer(response.answers?.[q.id]) || <span className="text-subtle">— no answer —</span>}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
