"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { deleteContent, loadContent, loadHero, reorderContent, saveContent, saveHero } from "../../lib/services/site-content-service";
import { resolvePhoto } from "../../lib/public-assets";
import { HERO_DEFAULTS, HERO_MAX_STATS, HERO_TEXT_LIMITS } from "../../lib/site-hero";
import { useToast } from "../ui/Toast";
import TeamManagement from "./TeamManagement";
import PhotoField from "./PhotoField";
import { useConfirm } from "../ui/ConfirmDialog";

// Director / Admin "Website" tab — manages the public homepage: the hero
// "Header" (headline + stat numbers), the cards in "What we do",
// "Activities / gallery" and "Our training sessions", and the "Team"
// slider (formerly its own sidebar item).
const HEADER_TAB = { label: "Header" };
const TEAM_TAB = { label: "Team" };
const SECTIONS = {
  program: {
    label: "What we do",
    hint: "Program cards in the “What we do” section.",
    fields: [["category", "Category", "Leadership"], ["title", "Title", ""], ["copy", "Description", ""], ["stat", "Highlight badge", "5+ batches"], ["photo", "Photo URL", "https://… or /tranning1.jpeg"]],
  },
  gallery: {
    label: "Activities / gallery",
    hint: "Photos in the “Activities / gallery” grid.",
    fields: [["category", "Category", "Education"], ["title", "Title", ""], ["photo", "Photo URL", "https://… or /tranning2.jpeg"]],
  },
  session: {
    label: "Our training sessions",
    hint: "Thumbnails in the “Our training sessions” strip.",
    fields: [["title", "Title", ""], ["photo", "Photo URL", "https://… or /tranning2.jpeg"]],
  },
};
const inputClass = "mt-1 w-full rounded-xl border border-border-subtle bg-card px-3 py-2.5 text-sm font-normal text-ink outline-none focus:ring-2 focus:ring-primary";

function ItemForm({ kind, initial, saving, onSave, onCancel }) {
  const fields = SECTIONS[kind].fields;
  const [form, setForm] = useState(() => ({ ...Object.fromEntries(fields.map(([key]) => [key, ""])), ...initial }));

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4" role="dialog" aria-modal="true">
      <form
        onSubmit={(event) => { event.preventDefault(); onSave(form); }}
        className="max-h-[92vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-3xl bg-card p-6 shadow-2xl"
      >
        <h2 className="text-lg font-bold text-ink">{initial?.id ? "Edit" : "Add"} · {SECTIONS[kind].label}</h2>
        {fields.map(([key, label, placeholder]) => key === "photo" ? (
          <PhotoField key={key} value={form.photo} onChange={(photo) => setForm((current) => ({ ...current, photo }))} placeholder={placeholder} inputClassName={inputClass} />
        ) : (
          <label key={key} className="block text-xs font-bold text-muted">{label}
            {key === "copy" ? (
              <textarea rows={3} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className={inputClass} />
            ) : (
              <input required={key === "title"} value={form[key]} placeholder={placeholder} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className={inputClass} />
            )}
          </label>
        ))}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onCancel} disabled={saving} className="rounded-xl px-4 py-2 text-sm font-bold text-muted">Cancel</button>
          <button disabled={saving} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-60">{saving ? "Saving..." : "Save"}</button>
        </div>
      </form>
    </div>
  );
}

function SectionManager({ kind }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null); // null | "new" | item
  const [saving, setSaving] = useState(false);

  const load = () => {
    loadContent(kind)
      .then((data) => { setItems(data.items || []); setError(""); })
      .catch((err) => setError(err.message || "Unable to load."))
      .finally(() => setLoading(false));
  };
  useEffect(() => { void Promise.resolve().then(load); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function save(form) {
    setSaving(true);
    try {
      await saveContent(kind, form);
      toast.success("Saved.");
      setEditing(null);
      load();
    } catch (err) {
      toast.error(err.message || "Unable to save.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(item) {
    if (!(await confirm({ title: "Remove this item?", message: `“${item.title}” will no longer appear on the website.`, confirmLabel: "Remove", tone: "danger" }))) return;
    try {
      await deleteContent(item.id);
      toast.success("Removed.");
      load();
    } catch (err) {
      toast.error(err.message || "Unable to remove.");
    }
  }

  async function move(index, direction) {
    const next = [...items];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setItems(next);
    try {
      await reorderContent(next.map((item) => item.id));
    } catch (err) {
      toast.error(err.message || "Unable to reorder.");
      load();
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted">{SECTIONS[kind].hint} The order here is the order on the site.</p>
        <button type="button" onClick={() => setEditing("new")} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-white hover:opacity-90">
          <Plus className="h-4 w-4" aria-hidden="true" /> Add
        </button>
      </div>
      {error && <p className="rounded-xl bg-active px-4 py-3 text-sm text-primary">{error}</p>}
      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <div className="divide-y divide-border-subtle rounded-3xl border border-border-subtle bg-card shadow-sm">
          {items.map((item, index) => (
            <div key={item.id} className="flex items-center gap-3 p-3 sm:p-4">
              <span className="grid h-14 w-20 shrink-0 place-items-center overflow-hidden rounded-xl bg-page text-xs font-black text-subtle">
                {item.photo ? <img src={resolvePhoto(item.photo)} alt="" className="h-full w-full object-cover" /> : "No photo"}
              </span>
              <div className="min-w-0 flex-1">
                <b className="block truncate text-sm text-ink">{item.title}</b>
                <span className="block truncate text-xs text-muted">{[item.category, item.stat].filter(Boolean).join(" · ") || "—"}</span>
              </div>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label="Move up" className="rounded-lg p-2 text-muted hover:bg-page disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                <button type="button" onClick={() => move(index, 1)} disabled={index === items.length - 1} aria-label="Move down" className="rounded-lg p-2 text-muted hover:bg-page disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
                <button type="button" onClick={() => setEditing(item)} className="inline-flex items-center gap-1 rounded-lg bg-info px-2.5 py-1.5 text-[11px] font-bold text-white hover:opacity-90"><Pencil className="h-3.5 w-3.5" /> Edit</button>
                <button type="button" onClick={() => remove(item)} aria-label={`Remove ${item.title}`} className="rounded-lg p-2 text-primary hover:bg-active"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          ))}
          {!items.length && !error && <p className="p-8 text-center text-sm text-muted">Nothing here yet.</p>}
        </div>
      )}
      {editing && <ItemForm kind={kind} initial={editing === "new" ? null : editing} saving={saving} onSave={save} onCancel={() => !saving && setEditing(null)} />}
    </div>
  );
}

const emptyStat = { label: "", value: "", suffix: "+" };

function HeaderManager() {
  const toast = useToast();
  const [form, setForm] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadHero()
      .then((data) => setForm(data.hero || HERO_DEFAULTS))
      .catch((err) => setError(err.message || "Unable to load."));
  }, []);

  const setField = (key) => (event) => setForm({ ...form, [key]: event.target.value });
  const setStat = (index, key) => (event) =>
    setForm({ ...form, stats: form.stats.map((stat, i) => (i === index ? { ...stat, [key]: event.target.value } : stat)) });
  const removeStat = (index) => setForm({ ...form, stats: form.stats.filter((_, i) => i !== index) });
  const addStat = () => setForm({ ...form, stats: [...form.stats, { ...emptyStat }] });

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const data = await saveHero(form);
      setForm(data.hero);
      toast.success("Header saved. The homepage is updated.");
    } catch (err) {
      toast.error(err.message || "Unable to save.");
    } finally {
      setSaving(false);
    }
  }

  if (error) return <p className="rounded-xl bg-active px-4 py-3 text-sm text-primary">{error}</p>;
  if (!form) return <p className="text-sm text-muted">Loading…</p>;

  const text = (key, label, placeholder) => (
    <label className="block text-xs font-bold text-muted">{label}
      <input value={form[key]} onChange={setField(key)} maxLength={HERO_TEXT_LIMITS[key]} placeholder={placeholder} className={inputClass} />
    </label>
  );

  return (
    <form onSubmit={save} className="space-y-5">
      <p className="text-xs text-muted">The big headline and number row at the top of the homepage.</p>
      <div className="space-y-4 rounded-3xl border border-border-subtle bg-card p-5 shadow-sm">
        <h3 className="text-sm font-black text-ink">Headline</h3>
        {text("tagline", "Small label after “Next Academy ·”", HERO_DEFAULTS.tagline)}
        <div className="grid gap-4 sm:grid-cols-3">
          {text("line1", "Line 1", HERO_DEFAULTS.line1)}
          {text("line2", "Line 2", HERO_DEFAULTS.line2)}
          {text("line3", "Line 3 (shown in red)", HERO_DEFAULTS.line3)}
        </div>
        <label className="block text-xs font-bold text-muted">Description
          <textarea rows={3} value={form.description} onChange={setField("description")} maxLength={HERO_TEXT_LIMITS.description} className={inputClass} />
        </label>
      </div>

      <div className="space-y-4 rounded-3xl border border-border-subtle bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-black text-ink">Numbers</h3>
          {form.stats.length < HERO_MAX_STATS && (
            <button type="button" onClick={addStat} className="inline-flex items-center gap-1 rounded-xl border border-border-subtle px-3 py-2 text-xs font-bold text-primary hover:bg-active">
              <Plus className="h-4 w-4" aria-hidden="true" /> Add number
            </button>
          )}
        </div>
        {form.stats.map((stat, index) => (
          <div key={index} className="grid grid-cols-[1fr_5rem_auto] items-end gap-3 sm:grid-cols-[6rem_4rem_1fr_auto]">
            <label className="block text-xs font-bold text-muted">Number
              <input type="number" min="0" required value={stat.value} onChange={setStat(index, "value")} className={inputClass} />
            </label>
            <label className="block text-xs font-bold text-muted">After
              <input value={stat.suffix} onChange={setStat(index, "suffix")} maxLength={4} placeholder="+" className={inputClass} />
            </label>
            <label className="col-span-2 block text-xs font-bold text-muted sm:col-span-1">Label
              <input required value={stat.label} onChange={setStat(index, "label")} maxLength={40} placeholder="Students Trained" className={inputClass} />
            </label>
            <button type="button" onClick={() => removeStat(index)} aria-label={`Remove ${stat.label || "number"}`} className="row-start-1 col-start-3 rounded-lg p-2.5 text-primary hover:bg-active sm:col-start-4">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        {!form.stats.length && <p className="text-sm text-muted">No numbers — the number row will be hidden.</p>}
      </div>

      <div className="flex justify-end">
        <button disabled={saving} className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60">{saving ? "Saving..." : "Save header"}</button>
      </div>
    </form>
  );
}

export default function WebsiteContent() {
  const [kind, setKind] = useState("hero");
  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-xl font-black text-ink">Website content</h2>
        <p className="text-xs text-muted">Edit the header, cards and team shown on the public homepage.</p>
      </div>
      <nav className="flex flex-wrap gap-2 overflow-x-auto rounded-2xl border border-border-subtle bg-card p-2 shadow-sm">
        {Object.entries({ hero: HEADER_TAB, ...SECTIONS, team: TEAM_TAB }).map(([key, { label }]) => (
          <button
            key={key}
            type="button"
            onClick={() => setKind(key)}
            className={`shrink-0 rounded-xl px-4 py-2 text-xs font-bold ${kind === key ? "bg-primary text-white" : "text-muted hover:bg-active"}`}
          >
            {label}
          </button>
        ))}
      </nav>
      {kind === "hero" ? <HeaderManager /> : kind === "team" ? <TeamManagement embedded /> : <SectionManager key={kind} kind={kind} />}
    </section>
  );
}
