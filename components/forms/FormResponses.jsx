"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, Download, Link2 } from "lucide-react";
import { loadFormResponses } from "../../lib/services/forms-service";
import { OPTION_TYPES, OTHER_PREFIX, formLink } from "../../lib/forms-shared";

const formatAnswer = (value) => (Array.isArray(value) ? value.join(", ") : value ?? "");
const formatWhen = (iso) => (iso ? new Date(iso).toLocaleString() : "");
const NEWLINE = String.fromCharCode(10);

function toCsv(form, responses) {
  const cell = (value) => `"${String(value ?? "").split('"').join('""')}"`;
  const header = ["Submitted", "Name", "Email", ...form.questions.map((q) => q.label)];
  const rows = responses.map((r) => [formatWhen(r.submittedAt), r.name, r.email, ...form.questions.map((q) => formatAnswer(r.answers?.[q.id]))]);
  return [header, ...rows].map((row) => row.map(cell).join(",")).join(NEWLINE);
}

// One question's results: bars for choice-like questions, a plain list for text.
function QuestionSummary({ question, responses }) {
  const values = responses.map((r) => r.answers?.[question.id]).filter((v) => v != null && v !== "" && !(Array.isArray(v) && !v.length));
  const choiceLike = OPTION_TYPES.includes(question.type) || question.type === "scale";
  let body;

  if (choiceLike) {
    const scaleOptions = question.type === "scale"
      ? Array.from({ length: (question.scale?.max ?? 5) - (question.scale?.min ?? 1) + 1 }, (_, i) => String((question.scale?.min ?? 1) + i))
      : [];
    const labels = question.type === "scale" ? scaleOptions : [...question.options];
    const counts = Object.fromEntries(labels.map((label) => [label, 0]));
    let otherCount = 0;
    values.flat().forEach((value) => {
      const key = String(value);
      if (key in counts) counts[key] += 1;
      else if (key.startsWith(OTHER_PREFIX)) otherCount += 1;
    });
    const rows = [...labels.map((label) => [label, counts[label]]), ...(otherCount ? [["Other", otherCount]] : [])];
    const max = Math.max(1, ...rows.map(([, n]) => n));
    body = (
      <div className="mt-3 space-y-2">
        {rows.map(([label, n]) => (
          <div key={label} className="flex items-center gap-3 text-xs">
            <span className="w-32 shrink-0 truncate text-ink sm:w-44" title={label}>{label}</span>
            <div className="h-5 flex-1 overflow-hidden rounded-full bg-page">
              <div className="h-full rounded-full bg-primary" style={{ width: `${(n / max) * 100}%` }} />
            </div>
            <span className="w-16 shrink-0 text-right font-semibold text-muted">{n} ({values.length ? Math.round((n / values.length) * 100) : 0}%)</span>
          </div>
        ))}
        {question.type === "scale" && values.length > 0 && (
          <p className="pt-1 text-xs text-muted">Average: <b className="text-ink">{(values.reduce((sum, v) => sum + Number(v), 0) / values.length).toFixed(2)}</b></p>
        )}
      </div>
    );
  } else {
    body = values.length ? (
      <ul className="mt-3 max-h-56 space-y-1.5 overflow-y-auto">
        {values.map((value, i) => <li key={i} className="whitespace-pre-wrap rounded-lg bg-page px-3 py-2 text-sm text-ink/80">{value}</li>)}
      </ul>
    ) : null;
  }

  return (
    <div className="rounded-2xl border border-border-subtle bg-card p-5">
      <h4 className="text-sm font-bold text-ink">{question.label}</h4>
      <p className="text-[11px] text-muted">{values.length} {values.length === 1 ? "response" : "responses"}</p>
      {body || <p className="mt-3 text-xs text-subtle">— no answers —</p>}
    </div>
  );
}

// Opened from a form's card: the share link, a Summary of the answers, and
// each person's individual response.
export default function FormResponses({ form, onBack }) {
  const [responses, setResponses] = useState(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [openId, setOpenId] = useState("");
  const [view, setView] = useState("summary");

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

  function downloadCsv() {
    const blob = new Blob(["﻿" + toCsv(form, responses)], { type: "text/csv;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `${(form.title || "form").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-responses.csv`;
    anchor.click();
    URL.revokeObjectURL(href);
  }

  const link = typeof window === "undefined" ? "" : formLink(window.location.origin, form.id);
  const hasResponses = useMemo(() => Boolean(responses?.length), [responses]);

  return (
    <div className="space-y-5">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All forms
      </button>
      <div className="rounded-2xl border border-border-subtle bg-card p-5">
        <h2 className="text-xl font-black text-ink">{form.title}</h2>
        {form.description && <p className="mt-1 text-sm text-ink/70">{form.description}</p>}
        <p className="mt-3 text-xs text-muted">Public link — anyone who has it can fill this form, no account needed.</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <code className="min-w-0 flex-1 truncate rounded-lg bg-page px-3 py-2 text-xs text-ink">{link}</code>
          <button type="button" onClick={copyLink} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white">
            <Link2 className="h-4 w-4" aria-hidden="true" /> {copied ? "Copied" : "Copy link"}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-bold text-ink">
          Responses {responses && <span className="text-sm font-semibold text-muted">({responses.length})</span>}
        </h3>
        <div className="flex items-center gap-2">
          <nav className="flex gap-1 rounded-xl border border-border-subtle bg-card p-1">
            {[["summary", "Summary"], ["individual", "Individual"]].map(([key, label]) => (
              <button key={key} type="button" onClick={() => setView(key)} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${view === key ? "bg-primary text-white" : "text-muted hover:bg-active"}`}>{label}</button>
            ))}
          </nav>
          <button type="button" onClick={downloadCsv} disabled={!hasResponses} className="inline-flex items-center gap-1.5 rounded-xl border border-border-subtle bg-card px-3 py-2 text-xs font-bold text-ink disabled:opacity-40">
            <Download className="h-4 w-4" aria-hidden="true" /> CSV
          </button>
        </div>
      </div>

      {error && <p className="rounded-xl bg-active p-4 text-sm text-primary">{error}</p>}
      {!responses && !error && <p className="text-sm text-muted">Loading responses…</p>}
      {responses && !responses.length && (
        <p className="rounded-2xl border border-dashed border-border-subtle bg-card p-8 text-center text-sm font-semibold text-ink/70">Nobody has filled in this form yet.</p>
      )}

      {hasResponses && view === "summary" && (
        <div className="space-y-4">
          {form.questions.map((q) => <QuestionSummary key={q.id} question={q} responses={responses} />)}
        </div>
      )}

      {hasResponses && view === "individual" && (
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
