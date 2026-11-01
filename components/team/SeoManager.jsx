"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Circle, ExternalLink, Plus, Search, Trash2 } from "lucide-react";
import { auth } from "../../lib/firebase";
import { useToast } from "../ui/Toast";
import { SkeletonList } from "../ui/Skeleton";

// Website → SEO: what Google shows for nextacademy.sg, plus Google Search
// Console verification and Google Analytics. Saved via /api/admin/seo
// (lib/server/seo-settings.js) and applied to every page's <head>.

const SITE = "https://nextacademy.sg";
const input = "mt-1 w-full rounded-xl border border-border-subtle bg-card px-3 py-2.5 text-sm font-normal text-ink outline-none focus:ring-2 focus:ring-primary";

async function request(options = {}) {
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new Error("Your session has expired. Please sign in again.");
  const response = await fetch("/api/admin/seo", { ...options, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Unable to load SEO settings.");
  return data.settings;
}

function Counter({ value, ideal }) {
  const n = (value || "").length;
  const tone = n === 0 ? "text-subtle" : n > ideal ? "text-warning" : "text-success";
  return <span className={`text-[10px] font-bold ${tone}`}>{n}/{ideal}</span>;
}

export default function SeoManager() {
  const toast = useToast();
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    request().then(setForm).catch((err) => setError(err.message));
  }, []);

  if (!form) return error ? <p className="rounded-xl bg-active p-4 text-sm text-primary">{error}</p> : <SkeletonList count={6} />;

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const setLink = (i, value) => setForm((f) => ({ ...f, socialLinks: f.socialLinks.map((l, j) => (j === i ? value : l)) }));

  async function save() {
    setSaving(true);
    setError("");
    try {
      const saved = await request({ method: "PUT", body: JSON.stringify(form) });
      setForm(saved);
      toast.success("SEO settings saved — Google sees them the next time it visits the site.");
    } catch (err) {
      setError(err.message || "Unable to save.");
    } finally {
      setSaving(false);
    }
  }

  const checklist = [
    [Boolean(form.siteTitle && form.siteTitle.length <= 60), "Title under 60 characters"],
    [Boolean(form.description && form.description.length >= 70 && form.description.length <= 160), "Description 70–160 characters"],
    [Boolean(form.googleVerification), "Google Search Console verified"],
    [Boolean(form.gaMeasurementId), "Google Analytics connected"],
    [Boolean(form.shareImage), "Share image for WhatsApp / Facebook previews"],
    [Boolean(form.phone || form.email || form.address), "Contact details for Google's business info"],
    [form.socialLinks.length > 0, "Social media profiles linked"],
  ];

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
      <div className="space-y-5">
        <section className="rounded-3xl border border-border-subtle bg-card p-5 shadow-sm md:p-6">
          <h3 className="font-bold text-ink">Google search result</h3>
          <p className="mt-1 text-xs text-muted">What people see when nextacademy.sg appears in Google.</p>
          <div className="mt-4 rounded-2xl border border-border-subtle bg-white p-4">
            <p className="flex items-center gap-1.5 text-xs text-[#4d5156]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.jpeg" alt="" className="h-5 w-5 rounded-full object-contain" /> nextacademy.sg
            </p>
            <p className="mt-1 truncate text-lg text-[#1a0dab]">{form.siteTitle || "Page title"}</p>
            <p className="line-clamp-2 text-sm text-[#4d5156]">{form.description || "Page description"}</p>
          </div>

          <label className="mt-4 flex items-end justify-between text-xs font-bold text-muted">Title <Counter value={form.siteTitle} ideal={60} /></label>
          <input value={form.siteTitle} onChange={set("siteTitle")} maxLength={70} className={input} />
          <label className="mt-3 flex items-end justify-between text-xs font-bold text-muted">Description <Counter value={form.description} ideal={160} /></label>
          <textarea value={form.description} onChange={set("description")} maxLength={300} rows={3} className={input} />
          <label className="mt-3 block text-xs font-bold text-muted">Keywords <span className="font-normal text-subtle">(comma separated)</span>
            <input value={form.keywords} onChange={set("keywords")} className={input} />
          </label>
          <label className="mt-3 block text-xs font-bold text-muted">Share image <span className="font-normal text-subtle">(shown when the link is shared on WhatsApp / Facebook — 1200×630 works best)</span>
            <input value={form.shareImage} onChange={set("shareImage")} placeholder="https://… or /tranning2.jpeg" className={input} />
          </label>
        </section>

        <section className="rounded-3xl border border-border-subtle bg-card p-5 shadow-sm md:p-6">
          <h3 className="font-bold text-ink">Google tools</h3>
          <label className="mt-3 block text-xs font-bold text-muted">Google Search Console verification
            <input value={form.googleVerification} onChange={set("googleVerification")} placeholder='Paste the code, or the whole <meta name="google-site-verification" …> tag' className={input} />
          </label>
          <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-[11px] text-muted">
            <li>Open <a href="https://search.google.com/search-console" target="_blank" rel="noopener noreferrer" className="font-bold text-info hover:underline">Google Search Console <ExternalLink className="inline h-3 w-3" /></a> → Add property → URL prefix → <b>{SITE}</b>.</li>
            <li>Choose <b>HTML tag</b>, copy it, paste it above and Save here.</li>
            <li>Back in Search Console press <b>Verify</b>, then Sitemaps → submit <b>{SITE}/sitemap.xml</b>.</li>
          </ol>
          <label className="mt-4 block text-xs font-bold text-muted">Google Analytics 4 Measurement ID
            <input value={form.gaMeasurementId} onChange={set("gaMeasurementId")} placeholder="G-XXXXXXXXXX" className={input} />
          </label>
        </section>

        <section className="rounded-3xl border border-border-subtle bg-card p-5 shadow-sm md:p-6">
          <h3 className="font-bold text-ink">Business info for Google</h3>
          <p className="mt-1 text-xs text-muted">Added to the homepage as structured data so Google can show Next Academy&apos;s details.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold text-muted">Phone<input value={form.phone} onChange={set("phone")} placeholder="+65 …" className={input} /></label>
            <label className="text-xs font-bold text-muted">Email<input type="email" value={form.email} onChange={set("email")} className={input} /></label>
          </div>
          <label className="mt-3 block text-xs font-bold text-muted">Address<input value={form.address} onChange={set("address")} placeholder="Street, building, Singapore postal code" className={input} /></label>
          <p className="mt-4 text-xs font-bold text-muted">Social media profiles</p>
          <div className="mt-1 space-y-2">
            {form.socialLinks.map((link, i) => (
              <div key={i} className="flex gap-2">
                <input value={link} onChange={(e) => setLink(i, e.target.value)} placeholder="https://facebook.com/…" className={`${input} mt-0`} />
                <button type="button" onClick={() => setForm((f) => ({ ...f, socialLinks: f.socialLinks.filter((_, j) => j !== i) }))} aria-label="Remove link" className="rounded-lg p-2 text-primary hover:bg-active"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
            <button type="button" onClick={() => setForm((f) => ({ ...f, socialLinks: [...f.socialLinks, ""] }))} className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-primary px-3 py-2 text-xs font-bold text-primary"><Plus className="h-4 w-4" /> Add profile link</button>
          </div>
        </section>

        {error && <p className="rounded-xl bg-active p-3 text-sm text-primary">{error}</p>}
        <div className="flex justify-end">
          <button type="button" onClick={save} disabled={saving} className="rounded-xl bg-primary px-6 py-3 text-sm font-bold text-white disabled:opacity-60">{saving ? "Saving…" : "Save SEO settings"}</button>
        </div>
      </div>

      <aside className="space-y-4">
        <section className="rounded-3xl border border-border-subtle bg-card p-5 shadow-sm">
          <h3 className="flex items-center gap-1.5 font-bold text-ink"><Search className="h-4 w-4 text-primary" /> SEO checklist</h3>
          <ul className="mt-3 space-y-2 text-xs">
            {checklist.map(([done, label]) => (
              <li key={label} className="flex items-start gap-2">
                {done ? <CheckCircle2 className="h-4 w-4 shrink-0 text-success" /> : <Circle className="h-4 w-4 shrink-0 text-subtle" />}
                <span className={done ? "text-ink" : "text-muted"}>{label}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-subtle">{checklist.filter(([d]) => d).length} of {checklist.length} done</p>
        </section>
        <section className="rounded-3xl border border-border-subtle bg-card p-5 text-xs text-muted shadow-sm">
          <h3 className="font-bold text-ink">Already handled</h3>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            <li>Sitemap: <a href={`${SITE}/sitemap.xml`} target="_blank" rel="noopener noreferrer" className="text-info hover:underline">/sitemap.xml</a></li>
            <li>robots.txt keeps private dashboards out of Google</li>
            <li>Canonical address is {SITE}</li>
            <li>Mobile-friendly pages and fast server rendering</li>
          </ul>
        </section>
      </aside>
    </div>
  );
}
