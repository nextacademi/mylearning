"use client";

import { useState } from "react";
import { Plus, Settings2, Trash2, X } from "lucide-react";

export const QUICK_EMOJI = ["🎁", "🔋", "📦", "🏆", "🎯", "💎", "⭐", "🎟️", "🎮", "🎧", "☕", "📚", "👕", "☂️", "🎒"];
export const SUSPENSE = [["short", "Short · 4 s", 4000], ["medium", "Medium · 8 s", 8000], ["long", "Long · 12 s", 12000]];
const field = "w-full rounded-xl border border-border-subtle bg-page px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none";
export const newPrize = () => ({ id: `p${Math.random().toString(36).slice(2, 8)}`, icon: "🎁", name: "", allocation: 1 });

function formatDate(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}/.test(value)) return "";
  return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" });
}

export default function PrizeConfigModal({ config, sources, sourcesError, onSave, onClose }) {
  const [prizes, setPrizes] = useState(() => (config.prizes.length ? config.prizes.map((prize) => ({ ...prize })) : [newPrize()]));
  const [pool, setPool] = useState(config.pool);
  const [suspense, setSuspense] = useState(config.suspense);
  const [activeRow, setActiveRow] = useState(0);
  const [error, setError] = useState("");

  const events = sources?.events || [];
  const trainings = sources?.trainings || [];
  const setPrize = (index, key, value) => setPrizes((current) => current.map((prize, i) => (i === index ? { ...prize, [key]: value } : prize)));

  function pickType(type) {
    if (type === "all") return setPool({ type: "all" });
    const list = type === "event" ? events : trainings;
    const keep = pool.type === type ? pool : null;
    const first = list[0];
    setPool(keep || (first ? { type, id: first.id, label: first.label, presentOnly: false } : { type, id: "", label: "" }));
  }

  function pickSource(type, id) {
    const item = (type === "event" ? events : trainings).find((entry) => entry.id === id);
    setPool((current) => ({ ...current, type, id, label: item?.label || "" }));
  }

  function save() {
    const clean = prizes
      .map((prize) => ({
        id: prize.id,
        icon: (prize.icon || "").trim() || "🎁",
        name: (prize.name || "").trim(),
        allocation: Math.max(1, Math.min(500, parseInt(prize.allocation, 10) || 1)),
      }))
      .filter((prize) => prize.name);
    if (!clean.length) return setError("Add at least one prize with a name.");
    if (pool.type !== "all" && !pool.id) return setError(`Choose ${pool.type === "event" ? "an event" : "a training"}, or draw from all students.`);
    onSave({ prizes: clean, pool, suspense });
  }

  const sourceSelect = (type, list) => (
    <select value={pool.type === type ? pool.id : ""} onChange={(event) => pickSource(type, event.target.value)} className={`${field} mt-2`} aria-label={type === "event" ? "Event" : "Training"}>
      {list.map((item) => (
        <option key={item.id} value={item.id}>
          {item.label}{formatDate(item.date) ? ` · ${formatDate(item.date)}` : ""} ({item.count} {type === "event" ? "registered" : "enrolled"})
        </option>
      ))}
    </select>
  );

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Prizes and draw pool">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-border-subtle bg-card text-ink shadow-2xl">
        <div className="flex items-center justify-between border-b border-border-subtle px-6 py-4">
          <h3 className="flex items-center gap-2 text-lg font-bold"><Settings2 className="h-5 w-5 text-primary" aria-hidden="true" />Prizes &amp; draw pool</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-subtle hover:bg-page hover:text-ink" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {error && <p className="rounded-xl bg-active p-3 text-sm text-primary">{error}</p>}
          {sourcesError && <p className="rounded-xl bg-warning-soft p-3 text-sm text-warning">{sourcesError}</p>}

          <section>
            <h4 className="mb-2 text-sm font-bold">Who can win?</h4>
            <div className="space-y-2">
              <label className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm ${pool.type === "all" ? "border-primary bg-active" : "border-border-subtle"}`}>
                <input type="radio" name="pool" checked={pool.type === "all"} onChange={() => pickType("all")} className="accent-[var(--dash-primary)]" />
                <span className="flex-1 font-semibold">All students</span>
                <span className="text-xs text-muted">{sources ? `${sources.studentCount.toLocaleString()} active` : "…"}</span>
              </label>

              <div className={`rounded-xl border p-3 text-sm ${pool.type === "event" ? "border-primary bg-active" : "border-border-subtle"}`}>
                <label className="flex cursor-pointer items-center gap-3">
                  <input type="radio" name="pool" checked={pool.type === "event"} onChange={() => pickType("event")} disabled={!events.length} className="accent-[var(--dash-primary)]" />
                  <span className="flex-1 font-semibold">People registered for an event</span>
                  {sources && !events.length && <span className="text-xs text-muted">No events yet</span>}
                </label>
                {pool.type === "event" && events.length > 0 && (
                  <>
                    {sourceSelect("event", events)}
                    <label className="mt-2 flex items-center gap-2 text-xs text-muted">
                      <input type="checkbox" checked={Boolean(pool.presentOnly)} onChange={(event) => setPool((current) => ({ ...current, presentOnly: event.target.checked }))} className="accent-[var(--dash-primary)]" />
                      Only people checked in as present
                    </label>
                  </>
                )}
              </div>

              <div className={`rounded-xl border p-3 text-sm ${pool.type === "training" ? "border-primary bg-active" : "border-border-subtle"}`}>
                <label className="flex cursor-pointer items-center gap-3">
                  <input type="radio" name="pool" checked={pool.type === "training"} onChange={() => pickType("training")} disabled={!trainings.length} className="accent-[var(--dash-primary)]" />
                  <span className="flex-1 font-semibold">Students enrolled in a training / class</span>
                  {sources && !trainings.length && <span className="text-xs text-muted">No trainings yet</span>}
                </label>
                {pool.type === "training" && trainings.length > 0 && sourceSelect("training", trainings)}
              </div>
              {!sources && !sourcesError && <p className="text-xs text-muted">Loading events and trainings…</p>}
              <p className="text-[11px] text-subtle">Staff, teachers and event volunteers are never included. Each person can win only once per draw session.</p>
            </div>
          </section>

          <section>
            <h4 className="mb-2 text-sm font-bold">Prizes</h4>
            <div className="space-y-2">
              {prizes.map((prize, index) => (
                <div key={prize.id} className={`flex items-center gap-2 rounded-xl border p-2 ${activeRow === index ? "border-primary/50" : "border-border-subtle"}`} onFocus={() => setActiveRow(index)}>
                  <input value={prize.icon} onChange={(event) => setPrize(index, "icon", event.target.value)} maxLength={4} className={`${field} w-14 text-center text-xl`} aria-label="Prize icon (emoji)" />
                  <input value={prize.name} onChange={(event) => setPrize(index, "name", event.target.value)} placeholder="Prize name (e.g. Power Bank)" className={`${field} flex-1`} aria-label="Prize name" />
                  <input type="number" min="1" max="500" value={prize.allocation} onChange={(event) => setPrize(index, "allocation", event.target.value)} className={`${field} w-20 text-center`} aria-label="Number of winners" />
                  <span className="hidden text-xs text-muted sm:inline">winners</span>
                  <button type="button" onClick={() => setPrizes((current) => current.filter((_, i) => i !== index))} disabled={prizes.length === 1} className="rounded-lg p-2 text-subtle hover:bg-active hover:text-primary disabled:opacity-30" aria-label="Remove prize">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => { setPrizes((current) => [...current, newPrize()]); setActiveRow(prizes.length); }} className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline">
              <Plus className="h-3.5 w-3.5" /> Add another prize
            </button>
            <div className="mt-3">
              <p className="mb-1 text-[11px] text-muted">Tap an icon to use it for the highlighted prize:</p>
              <div className="flex flex-wrap gap-1">
                {QUICK_EMOJI.map((emoji) => (
                  <button key={emoji} type="button" onClick={() => setPrize(Math.min(activeRow, prizes.length - 1), "icon", emoji)} className="rounded-lg bg-page px-2 py-1 text-lg hover:bg-active" aria-label={`Use ${emoji}`}>
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section>
            <h4 className="mb-2 text-sm font-bold">Suspense</h4>
            <div className="flex flex-wrap gap-2">
              {SUSPENSE.map(([key, label]) => (
                <button key={key} type="button" onClick={() => setSuspense(key)} aria-pressed={suspense === key}
                  className={`rounded-full px-4 py-2 text-xs font-bold transition ${suspense === key ? "bg-primary text-white" : "bg-page text-muted hover:bg-active hover:text-primary"}`}>
                  {label}
                </button>
              ))}
            </div>
          </section>
        </div>

        <div className="flex justify-end gap-3 border-t border-border-subtle px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-2.5 text-sm font-bold text-muted hover:bg-page">Cancel</button>
          <button type="button" onClick={save} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white hover:bg-primary-hover">Save changes</button>
        </div>
      </div>
    </div>
  );
}
