"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { deleteContent, loadContent, reorderContent, saveContent } from "../../lib/services/site-content-service";
import { useToast } from "../ui/Toast";
import { useConfirm } from "../ui/ConfirmDialog";

// Director / Admin "Website" tab — manages the cards on the public homepage:
// "What we do", "Activities / gallery" and "Our training sessions".
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
        {fields.map(([key, label, placeholder]) => (
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
                {item.photo ? <img src={item.photo} alt="" className="h-full w-full object-cover" /> : "No photo"}
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

export default function WebsiteContent() {
  const [kind, setKind] = useState("program");
  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-xl font-black text-ink">Website content</h2>
        <p className="text-xs text-muted">Edit the cards shown on the public homepage.</p>
      </div>
      <nav className="flex flex-wrap gap-2 overflow-x-auto rounded-2xl border border-border-subtle bg-card p-2 shadow-sm">
        {Object.entries(SECTIONS).map(([key, { label }]) => (
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
      <SectionManager key={kind} kind={kind} />
    </section>
  );
}
