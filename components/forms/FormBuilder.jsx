"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Copy, Plus, Trash2, X } from "lucide-react";
import {
  DEFAULT_RATING_MAX, DEFAULT_SCALE, GRID_TYPES, MAX_GRID_COLUMNS, MAX_GRID_ROWS, NO_ANSWER_TYPES, OPTION_TYPES, OTHER_TYPES,
  QUESTION_TYPES, VALIDATIONS, blankQuestion, newQuestionId,
} from "../../lib/forms-shared";
import { saveForm } from "../../lib/services/forms-service";

const FIELD = "w-full rounded-xl border border-border-subtle bg-page px-3 py-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-primary";

// Editable list of short labels — a grid question's rows or its columns.
function LabelList({ title, items, max, min, placeholder, onChange }) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-bold uppercase tracking-wider text-subtle">{title}</p>
      {items.map((item, index) => (
        <div key={index} className="flex items-center gap-2">
          <input value={item} onChange={(e) => onChange(items.map((v, i) => (i === index ? e.target.value : v)))} aria-label={`${title} ${index + 1}`} className={`${FIELD} bg-card py-2`} />
          <button type="button" onClick={() => items.length > min && onChange(items.filter((_, i) => i !== index))} disabled={items.length <= min} aria-label={`Remove ${title.toLowerCase()}`} className="text-muted disabled:opacity-30">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ))}
      {items.length < max && (
        <button type="button" onClick={() => onChange([...items, `${placeholder} ${items.length + 1}`])} className="text-xs font-bold text-primary hover:underline">+ Add {placeholder.toLowerCase()}</button>
      )}
    </div>
  );
}

// Create / edit a form: title, description, and a list of questions.
export default function FormBuilder({ initial, onClose, onSaved }) {
  const [title, setTitle] = useState(initial?.title || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [confirmation, setConfirmation] = useState(initial?.confirmation || "");
  const [closesAt, setClosesAt] = useState(initial?.closesAt || "");
  const [questions, setQuestions] = useState(() => (initial?.questions?.length
    ? initial.questions.map((q) => ({ help: "", other: false, scale: { ...DEFAULT_SCALE }, rows: [], columns: [], validation: "", shuffle: false, ...q }))
    : [blankQuestion()]));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const update = (id, patch) => setQuestions((list) => list.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  const remove = (id) => setQuestions((list) => (list.length > 1 ? list.filter((q) => q.id !== id) : list));
  const duplicate = (id) => setQuestions((list) => {
    const index = list.findIndex((q) => q.id === id);
    const copy = { ...list[index], id: newQuestionId(), options: [...list[index].options], scale: { ...list[index].scale }, rows: [...(list[index].rows || [])], columns: [...(list[index].columns || [])] };
    return [...list.slice(0, index + 1), copy, ...list.slice(index + 1)];
  });
  function move(index, delta) {
    setQuestions((list) => {
      const next = [...list];
      const target = index + delta;
      if (target < 0 || target >= next.length) return list;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }
  function changeType(q, type) {
    const needsOptions = OPTION_TYPES.includes(type);
    const isGrid = GRID_TYPES.includes(type);
    update(q.id, {
      type,
      options: needsOptions ? (q.options.length ? q.options : ["Option 1", "Option 2"]) : [],
      rows: isGrid ? (q.rows?.length ? q.rows : ["Row 1", "Row 2"]) : [],
      columns: isGrid ? (q.columns?.length ? q.columns : ["Column 1", "Column 2", "Column 3"]) : [],
      ...(type === "rating" ? { scale: { ...DEFAULT_SCALE, min: 1, max: DEFAULT_RATING_MAX } } : {}),
      ...(type === "scale" && q.type === "rating" ? { scale: { ...DEFAULT_SCALE } } : {}),
      ...(NO_ANSWER_TYPES.includes(type) ? { required: false } : {}),
    });
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const result = await saveForm({ id: initial?.id, title, description, confirmation, closesAt, questions });
      onSaved(result.id);
    } catch (err) {
      setError(err.message || "Unable to save this form.");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 py-8">
      <form onSubmit={submit} className="w-full max-w-2xl rounded-3xl bg-card p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-ink">{initial ? "Edit Form" : "Create Form"}</h3>
          <button type="button" onClick={onClose} className="text-muted" aria-label="Close"><X className="h-5 w-5" aria-hidden="true" /></button>
        </div>

        <div className="space-y-3">
          <label className="grid gap-1 text-xs font-bold text-ink">
            Form title
            <input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Course Feedback — Batch 12" className={FIELD} />
          </label>
          <label className="grid gap-1 text-xs font-bold text-ink">
            Description <span className="font-normal text-subtle">(optional)</span>
            <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} className={FIELD} />
          </label>
        </div>

        <div className="mt-5 space-y-4">
          {questions.map((q, index) => (
            <div key={q.id} className="rounded-2xl border border-border-subtle bg-page/60 p-4">
              <div className="flex flex-wrap items-start gap-3">
                <input
                  required
                  value={q.label}
                  onChange={(e) => update(q.id, { label: e.target.value })}
                  placeholder={q.type === "section" ? "Section title" : `Question ${index + 1}`}
                  aria-label={`Question ${index + 1} title`}
                  className={`${FIELD} min-w-[200px] flex-1 bg-card`}
                />
                <select value={q.type} onChange={(e) => changeType(q, e.target.value)} aria-label="Question type" className={`${FIELD} w-auto bg-card`}>
                  {QUESTION_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>

              <input
                value={q.help}
                onChange={(e) => update(q.id, { help: e.target.value })}
                placeholder="Description (optional)"
                aria-label={`Question ${index + 1} description`}
                className={`${FIELD} mt-2 bg-card text-xs`}
              />

              {q.type === "short" && (
                <label className="mt-3 flex items-center gap-2 text-xs font-bold text-ink">
                  Response validation
                  <select value={q.validation || ""} onChange={(e) => update(q.id, { validation: e.target.value })} className={`${FIELD} w-auto bg-card py-2`}>
                    {VALIDATIONS.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                  </select>
                </label>
              )}

              {q.type === "rating" && (
                <label className="mt-3 flex items-center gap-2 text-xs font-bold text-ink">
                  Number of stars
                  <select value={q.scale.max} onChange={(e) => update(q.id, { scale: { ...q.scale, min: 1, max: Number(e.target.value) } })} className={`${FIELD} w-auto bg-card`}>
                    {[3, 4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
              )}

              {GRID_TYPES.includes(q.type) && (
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <LabelList title="Rows" items={q.rows || []} min={1} max={MAX_GRID_ROWS} placeholder="Row" onChange={(rows) => update(q.id, { rows })} />
                  <LabelList title="Columns" items={q.columns || []} min={2} max={MAX_GRID_COLUMNS} placeholder="Column" onChange={(columns) => update(q.id, { columns })} />
                </div>
              )}

              {q.type === "scale" && (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="flex items-center gap-2 text-xs font-bold text-ink">
                    From
                    <select value={q.scale.min} onChange={(e) => update(q.id, { scale: { ...q.scale, min: Number(e.target.value) } })} className={`${FIELD} w-auto bg-card`}>
                      <option value={0}>0</option>
                      <option value={1}>1</option>
                    </select>
                    to
                    <select value={q.scale.max} onChange={(e) => update(q.id, { scale: { ...q.scale, max: Number(e.target.value) } })} className={`${FIELD} w-auto bg-card`}>
                      {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </label>
                  <span />
                  <input value={q.scale.lowLabel} onChange={(e) => update(q.id, { scale: { ...q.scale, lowLabel: e.target.value } })} placeholder={`Label for ${q.scale.min} (optional)`} className={`${FIELD} bg-card`} />
                  <input value={q.scale.highLabel} onChange={(e) => update(q.id, { scale: { ...q.scale, highLabel: e.target.value } })} placeholder={`Label for ${q.scale.max} (optional)`} className={`${FIELD} bg-card`} />
                </div>
              )}

              {OPTION_TYPES.includes(q.type) && (
                <div className="mt-3 space-y-2">
                  {q.options.map((option, optionIndex) => (
                    <div key={optionIndex} className="flex items-center gap-2">
                      <input
                        value={option}
                        onChange={(e) => update(q.id, { options: q.options.map((o, i) => (i === optionIndex ? e.target.value : o)) })}
                        aria-label={`Option ${optionIndex + 1}`}
                        className={`${FIELD} bg-card`}
                      />
                      <button
                        type="button"
                        onClick={() => q.options.length > 2 && update(q.id, { options: q.options.filter((_, i) => i !== optionIndex) })}
                        disabled={q.options.length <= 2}
                        aria-label="Remove option"
                        className="text-muted disabled:opacity-30"
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                  <div className="flex flex-wrap items-center gap-4">
                    <button type="button" onClick={() => update(q.id, { options: [...q.options, `Option ${q.options.length + 1}`] })} className="text-xs font-bold text-primary hover:underline">
                      + Add option
                    </button>
                    {OTHER_TYPES.includes(q.type) && (
                      <label className="flex items-center gap-2 text-xs font-bold text-ink">
                        <input type="checkbox" checked={q.other} onChange={(e) => update(q.id, { other: e.target.checked })} className="h-4 w-4 rounded border-border-subtle" />
                        Add &quot;Other&quot; option
                      </label>
                    )}
                    <label className="flex items-center gap-2 text-xs font-bold text-ink">
                      <input type="checkbox" checked={Boolean(q.shuffle)} onChange={(e) => update(q.id, { shuffle: e.target.checked })} className="h-4 w-4 rounded border-border-subtle" />
                      Shuffle option order
                    </label>
                  </div>
                </div>
              )}

              <div className="mt-3 flex items-center justify-between border-t border-border-subtle pt-3">
                {NO_ANSWER_TYPES.includes(q.type) ? (
                  <span className="text-[11px] text-subtle">Starts a new section — no answer needed.</span>
                ) : (
                  <label className="flex items-center gap-2 text-xs font-bold text-ink">
                    <input type="checkbox" checked={q.required} onChange={(e) => update(q.id, { required: e.target.checked })} className="h-4 w-4 rounded border-border-subtle" />
                    {GRID_TYPES.includes(q.type) ? "Require a response in each row" : "Required"}
                  </label>
                )}
                <div className="flex items-center gap-1 text-muted">
                  <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label="Move up" className="rounded-lg p-1.5 hover:bg-active disabled:opacity-30"><ArrowUp className="h-4 w-4" aria-hidden="true" /></button>
                  <button type="button" onClick={() => move(index, 1)} disabled={index === questions.length - 1} aria-label="Move down" className="rounded-lg p-1.5 hover:bg-active disabled:opacity-30"><ArrowDown className="h-4 w-4" aria-hidden="true" /></button>
                  <button type="button" onClick={() => duplicate(q.id)} disabled={questions.length >= 50} aria-label="Duplicate question" className="rounded-lg p-1.5 hover:bg-active disabled:opacity-30"><Copy className="h-4 w-4" aria-hidden="true" /></button>
                  <button type="button" onClick={() => remove(q.id)} disabled={questions.length === 1} aria-label="Delete question" className="rounded-lg p-1.5 hover:bg-active disabled:opacity-30"><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <button type="button" onClick={() => setQuestions((list) => [...list, blankQuestion()])} className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-dashed border-primary px-4 py-2.5 text-xs font-bold text-primary">
          <Plus className="h-4 w-4" aria-hidden="true" /> Add question
        </button>

        <label className="mt-5 grid gap-1 text-xs font-bold text-ink">
          Confirmation message <span className="font-normal text-subtle">(shown after someone submits — optional)</span>
          <input value={confirmation} onChange={(e) => setConfirmation(e.target.value)} placeholder="Your response has been recorded. Thank you!" className={FIELD} />
        </label>

        <label className="mt-4 grid gap-1 text-xs font-bold text-ink">
          <span>Stop accepting responses after <span className="font-normal text-subtle">(optional — the form closes automatically after this date)</span></span>
          <input type="date" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} className={`${FIELD} sm:w-auto`} />
        </label>

        {error && <p className="mt-4 rounded-xl bg-active p-3 text-xs text-primary">{error}</p>}
        <div className="mt-5 flex justify-end gap-3">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-xl border border-border-subtle px-5 py-2.5 text-sm font-medium text-ink">Cancel</button>
          <button type="submit" disabled={saving} className="rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-white shadow-md disabled:opacity-60">{saving ? "Saving…" : "Save Form"}</button>
        </div>
      </form>
    </div>
  );
}
