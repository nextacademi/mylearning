"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Eye, Plus, Trash2 } from "lucide-react";
import { loadAgreement, saveAgreement } from "../../lib/services/agreement-service";
import { AgreementText } from "../onboarding/OnboardingGate";
import { useToast } from "../ui/Toast";
import { SkeletonList } from "../ui/Skeleton";

// Website → Agreement: edit the member agreement shown once after sign-in
// (components/onboarding/OnboardingGate.jsx). Raising the version makes
// everyone it applies to accept again.

const ROLES = ["Guest", "Student", "Volunteer", "Teacher", "Facilitator", "Admin", "Director"];
const input = "mt-1 w-full rounded-xl border border-border-subtle bg-card px-3 py-2.5 text-sm font-normal text-ink outline-none focus:ring-2 focus:ring-primary";

// "v1.01" → "v1.02"; anything without a trailing number gets ".1".
function bumpVersion(version) {
  const match = /^(.*?)(\d+)$/.exec(version || "");
  if (!match) return `${version || "v1"}.1`;
  return `${match[1]}${String(Number(match[2]) + 1).padStart(match[2].length, "0")}`;
}

export default function AgreementManager() {
  const toast = useToast();
  const [form, setForm] = useState(null);
  const [savedVersion, setSavedVersion] = useState("");
  const [stats, setStats] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    loadAgreement({ stats: true })
      .then((data) => { setForm(data.agreement); setSavedVersion(data.agreement.version); setStats(data.stats || null); })
      .catch((err) => setError(err.message || "Unable to load the agreement."));
  }, []);

  if (!form) return error ? <p className="rounded-xl bg-active p-4 text-sm text-primary">{error}</p> : <SkeletonList count={5} />;

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const setSection = (i, key, value) => setForm((f) => ({ ...f, sections: f.sections.map((s, j) => (j === i ? { ...s, [key]: value } : s)) }));
  const move = (i, d) => setForm((f) => {
    const sections = [...f.sections];
    const t = i + d;
    if (t < 0 || t >= sections.length) return f;
    [sections[i], sections[t]] = [sections[t], sections[i]];
    return { ...f, sections };
  });
  const toggleRole = (role) => setForm((f) => ({ ...f, roles: f.roles.includes(role) ? f.roles.filter((r) => r !== role) : [...f.roles, role] }));

  async function save() {
    setSaving(true);
    setError("");
    try {
      const data = await saveAgreement(form);
      setForm(data.agreement);
      const reaccept = data.agreement.version !== savedVersion;
      setSavedVersion(data.agreement.version);
      toast.success(reaccept ? `Saved as ${data.agreement.version} — members will be asked to accept it again.` : "Agreement saved.");
      loadAgreement({ stats: true }).then((d) => setStats(d.stats || null)).catch(() => {});
    } catch (err) {
      setError(err.message || "Unable to save the agreement.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-border-subtle bg-card p-5 shadow-sm md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-bold text-ink">Member Agreement</h3>
            <p className="mt-1 max-w-2xl text-xs text-muted">Shown once after sign-in, before the dashboard. Members must tick the box and press “I Agree &amp; Continue”. Change the version to make everyone accept again.</p>
          </div>
          {stats && (
            <span className="rounded-full bg-success-soft px-3 py-1 text-xs font-bold text-success">{stats.accepted} of {stats.members} accepted {savedVersion}</span>
          )}
        </div>

        <label className="mt-4 flex items-center gap-2 text-sm font-semibold text-ink">
          <input type="checkbox" checked={form.enabled} onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))} className="h-4 w-4" />
          Ask members to accept this agreement
        </label>

        <div className="mt-4 grid gap-3 md:grid-cols-[2fr_1fr_1fr]">
          <label className="text-xs font-bold text-muted">Title<input value={form.title} onChange={set("title")} className={input} /></label>
          <label className="text-xs font-bold text-muted">
            Version
            <span className="mt-1 flex gap-1">
              <input value={form.version} onChange={set("version")} className={`${input} mt-0`} />
              <button type="button" onClick={() => setForm((f) => ({ ...f, version: bumpVersion(f.version) }))} className="shrink-0 rounded-xl border border-border-subtle px-2 text-[11px] font-bold text-ink hover:bg-page" title="Raise the version so everyone accepts again">+1</button>
            </span>
          </label>
          <label className="text-xs font-bold text-muted">Effective date<input type="date" value={form.effectiveDate || ""} onChange={set("effectiveDate")} className={input} /></label>
        </div>
        <label className="mt-3 block text-xs font-bold text-muted">Subtitle<input value={form.subtitle || ""} onChange={set("subtitle")} className={input} /></label>

        <fieldset className="mt-4">
          <legend className="text-xs font-bold text-muted">Show to</legend>
          <div className="mt-1 flex flex-wrap gap-2">
            {ROLES.map((role) => (
              <label key={role} className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${form.roles.includes(role) ? "border-primary bg-active text-ink" : "border-border-subtle text-muted"}`}>
                <input type="checkbox" checked={form.roles.includes(role)} onChange={() => toggleRole(role)} className="h-3.5 w-3.5" /> {role}
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      <section className="rounded-3xl border border-border-subtle bg-card p-5 shadow-sm md:p-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-bold text-ink">Sections ({form.sections.length})</h3>
            <p className="text-xs text-muted">A blank line starts a new paragraph. Lines starting with “- ” become bullet points.</p>
          </div>
          <button type="button" onClick={() => setPreview(true)} className="inline-flex items-center gap-1.5 rounded-xl border border-border-subtle px-3 py-2 text-xs font-bold text-ink hover:bg-page"><Eye className="h-4 w-4" /> Preview</button>
        </div>
        <div className="space-y-3">
          {form.sections.map((section, i) => (
            <div key={i} className="rounded-2xl border border-border-subtle bg-page p-4">
              <div className="flex items-center gap-2">
                <input value={section.heading} onChange={(e) => setSection(i, "heading", e.target.value)} placeholder={`${i + 1}. Section heading`} className={`${input} mt-0 font-bold`} />
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" className="rounded-lg p-2 text-muted hover:bg-card disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === form.sections.length - 1} aria-label="Move down" className="rounded-lg p-2 text-muted hover:bg-card disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
                <button type="button" onClick={() => setForm((f) => ({ ...f, sections: f.sections.filter((_, j) => j !== i) }))} disabled={form.sections.length <= 1} aria-label="Delete section" className="rounded-lg p-2 text-primary hover:bg-active disabled:opacity-30"><Trash2 className="h-4 w-4" /></button>
              </div>
              <textarea value={section.body} onChange={(e) => setSection(i, "body", e.target.value)} rows={6} placeholder="Section text…" className={input} />
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setForm((f) => ({ ...f, sections: [...f.sections, { heading: `${f.sections.length + 1}. `, body: "" }] }))} className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-dashed border-primary px-4 py-2.5 text-xs font-bold text-primary">
          <Plus className="h-4 w-4" /> Add section
        </button>

        <label className="mt-5 block text-xs font-bold text-muted">Checkbox text (what members agree to)<textarea value={form.checkboxLabel} onChange={set("checkboxLabel")} rows={2} className={input} /></label>

        {error && <p className="mt-3 rounded-xl bg-active p-3 text-xs text-primary">{error}</p>}
        <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
          {form.version !== savedVersion && <span className="text-xs font-semibold text-warning">New version — everyone it applies to will accept again.</span>}
          <button type="button" onClick={save} disabled={saving} className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60">{saving ? "Saving…" : "Save Agreement"}</button>
        </div>
      </section>

      {preview && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4" role="dialog" aria-modal="true" onClick={() => setPreview(false)}>
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <header className="border-b border-border-subtle bg-[linear-gradient(135deg,#fff0f0_0%,#ffffff_70%)] px-6 py-4 text-center">
              <p className="text-[10px] font-bold uppercase tracking-widest text-subtle">Preview</p>
              <h2 className="text-2xl font-black text-ink">{form.title}</h2>
              <p className="text-sm font-bold text-primary">{[form.effectiveDate && `Effective ${form.effectiveDate}`, form.version].filter(Boolean).join(" · ")}</p>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-2">
              {form.sections.map((s, i) => (
                <section key={i} className="border-b border-border-subtle py-4 last:border-0">
                  {s.heading && <h3 className="border-b border-border-subtle pb-2 text-lg font-bold text-ink">{s.heading}</h3>}
                  <AgreementText body={s.body} />
                </section>
              ))}
            </div>
            <footer className="border-t border-border-subtle px-6 py-3 text-right">
              <button type="button" onClick={() => setPreview(false)} className="rounded-xl border border-border-subtle px-4 py-2 text-sm font-bold text-ink">Close preview</button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
