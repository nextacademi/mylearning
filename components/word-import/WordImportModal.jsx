"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileUp, Loader2, X } from "lucide-react";
import { parseWordDocument } from "../../lib/word-import-data";
import {
  evaluateRecord, extractFields, extractTables, matchTable, tableToRecords,
} from "../../lib/word-import/extract";

const STATUS_TONE = {
  valid: "bg-success-soft text-success",
  duplicate: "bg-warning-soft text-warning",
  invalid: "bg-active text-primary",
};

// ---------------------------------------------------------------------------
// Reusable Word (.docx) import pipeline:
//   Upload → Parse (Admin API) → Preview → Validate → Edit → Confirm → Save
// Nothing is saved until the admin confirms; the save itself is delegated to
// `onConfirm`, which calls the module's own existing, role-checked API.
//
//   mode="fields"  → onConfirm(fieldValues)      (e.g. populate a Course form)
//   mode="records" → onConfirm(rows)             rows: [{ data, action, duplicateOf }]
// ---------------------------------------------------------------------------
export default function WordImportModal({
  open,
  onClose,
  title = "Import from Word",
  mode = "fields",
  fields = [],
  columns = [],
  dedupe = null,
  onConfirm,
  hint,
  preamble = null,   // extra controls shown above the records grid (records mode)
  canConfirm,        // () => string | null  — block the Import button with a reason
}) {
  const [step, setStep] = useState("upload");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [parsed, setParsed] = useState(null);
  const [showSource, setShowSource] = useState(false);

  const [fieldValues, setFieldValues] = useState({});
  const [records, setRecords] = useState([]); // [{ data, action, duplicateOf, evaluation }]
  const [saveResult, setSaveResult] = useState(null);
  const inputRef = useRef(null);

  const reset = useCallback(() => {
    setStep("upload"); setBusy(false); setError(""); setParsed(null);
    setShowSource(false); setFieldValues({}); setRecords([]); setSaveResult(null);
  }, []);

  const close = useCallback(() => { reset(); onClose(); }, [reset, onClose]);

  const handleFile = useCallback(async (file) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".docx")) {
      setError("Unable to read this Word document. Please upload a valid .docx file.");
      return;
    }
    setBusy(true); setError("");
    try {
      const result = await parseWordDocument(file);
      setParsed(result);
      if (mode === "fields") {
        setFieldValues(extractFields(result.text, fields));
      } else {
        const tables = extractTables(result.html);
        const matched = matchTable(tables, columns);
        if (!matched) {
          setError("No table in this document matches the expected columns. Check the headings and try again.");
          setBusy(false);
          return;
        }
        const rows = tableToRecords(matched.table, matched.mapping, columns).map((data) => {
          const evaluation = evaluateRecord(data, columns, dedupe);
          return {
            data,
            evaluation,
            duplicateOf: evaluation.duplicateOf,
            action: evaluation.status === "duplicate" ? "skip" : "new",
          };
        });
        setRecords(rows);
      }
      setStep("review");
    } catch (parseError) {
      setError(parseError.message || "Unable to read this Word document.");
    } finally {
      setBusy(false);
    }
  }, [mode, fields, columns, dedupe]);

  const setRecordCell = (index, key, value) => {
    setRecords((current) => current.map((row, i) => {
      if (i !== index) return row;
      const data = { ...row.data, [key]: value };
      const evaluation = evaluateRecord(data, columns, dedupe);
      return {
        ...row,
        data,
        evaluation,
        duplicateOf: evaluation.duplicateOf,
        action: evaluation.status === "duplicate" ? (row.action === "new" ? "skip" : row.action) : (row.action === "skip" ? "new" : row.action),
      };
    }));
  };

  const counts = useMemo(() => ({
    valid: records.filter((r) => r.evaluation.status === "valid").length,
    duplicate: records.filter((r) => r.evaluation.status === "duplicate").length,
    invalid: records.filter((r) => r.evaluation.status === "invalid").length,
  }), [records]);

  const importable = records.filter(
    (r) => r.evaluation.status === "valid" || (r.evaluation.status === "duplicate" && r.action !== "skip"),
  );

  async function confirmFields() {
    setBusy(true); setError("");
    try {
      await onConfirm(fieldValues);
      close();
    } catch (confirmError) {
      setError(confirmError.message || "Unable to import.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmRecords() {
    setBusy(true); setError("");
    try {
      const payload = importable.map((row) => ({ data: row.data, action: row.action, duplicateOf: row.duplicateOf }));
      const result = await onConfirm(payload);
      setSaveResult(result && typeof result === "object" ? result : { imported: payload.length });
    } catch (confirmError) {
      setError(confirmError.message || "Unable to import records.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4" role="dialog" aria-modal="true">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-card shadow-2xl">
        <div className="flex items-center justify-between gap-4 border-b border-border-subtle px-5 py-4">
          <h2 className="flex items-center gap-2 text-lg font-black text-ink"><FileUp className="h-5 w-5 text-success" /> {title}</h2>
          <button type="button" onClick={close} className="rounded-lg p-1 text-muted hover:bg-page" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {/* step indicator */}
          <ol className="mb-5 flex flex-wrap gap-2 text-[11px] font-bold">
            {["Upload", "Preview & validate", "Confirm"].map((label, index) => {
              const stageIndex = step === "upload" ? 0 : saveResult ? 2 : 1;
              return (
                <li key={label} className={`rounded-full px-2.5 py-1 ${index <= stageIndex ? "bg-success-soft text-success" : "bg-page text-subtle"}`}>
                  {index + 1}. {label}
                </li>
              );
            })}
          </ol>

          {error && <p className="mb-4 rounded-xl bg-active px-3 py-2 text-sm font-semibold text-primary">{error}</p>}

          {step === "upload" && (
            <div>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => { event.preventDefault(); handleFile(event.dataTransfer.files?.[0]); }}
                className="grid w-full place-items-center gap-2 rounded-2xl border-2 border-dashed border-border-subtle bg-page py-14 text-center hover:border-success"
              >
                {busy ? <Loader2 className="h-7 w-7 animate-spin text-success" /> : <FileUp className="h-7 w-7 text-subtle" />}
                <span className="text-sm font-bold text-ink">{busy ? "Reading document…" : "Drop a .docx file here, or click to choose"}</span>
                <span className="text-xs text-muted">Word documents only · up to 8 MB · nothing is saved yet</span>
              </button>
              <input ref={inputRef} type="file" accept=".docx" hidden onChange={(event) => handleFile(event.target.files?.[0])} />
              {hint && <p className="mt-3 rounded-xl bg-info-soft/50 px-3 py-2 text-xs text-info">{hint}</p>}
            </div>
          )}

          {step === "review" && parsed && !saveResult && (
            <div className="space-y-4">
              {parsed.warnings?.length > 0 && (
                <p className="flex items-start gap-2 rounded-xl bg-warning-soft/50 px-3 py-2 text-xs text-warning">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Some Word formatting could not be fully preserved ({parsed.warnings.length} note{parsed.warnings.length === 1 ? "" : "s"}). Review the values below.
                </p>
              )}

              {mode === "fields" ? (
                <div className="grid gap-3">
                  {fields.map((def) => (
                    <label key={def.key} className="grid gap-1 text-xs font-bold text-muted">
                      {def.label}{def.required && <span className="text-primary"> *</span>}
                      {def.multiline ? (
                        <textarea
                          rows={def.key === "syllabus" || def.key === "description" ? 4 : 3}
                          value={fieldValues[def.key] || ""}
                          onChange={(event) => setFieldValues((v) => ({ ...v, [def.key]: event.target.value }))}
                          className="rounded-xl border border-border-subtle bg-card px-3 py-2 text-sm font-normal text-ink outline-none focus:ring-2 focus:ring-success"
                        />
                      ) : (
                        <input
                          value={fieldValues[def.key] || ""}
                          onChange={(event) => setFieldValues((v) => ({ ...v, [def.key]: event.target.value }))}
                          className="rounded-xl border border-border-subtle bg-card px-3 py-2 text-sm font-normal text-ink outline-none focus:ring-2 focus:ring-success"
                        />
                      )}
                    </label>
                  ))}
                  {!Object.keys(fieldValues).length && (
                    <p className="rounded-xl bg-page px-3 py-2 text-xs text-muted">No labelled fields were detected. Fill them in from the document preview below, or cancel.</p>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {preamble}
                  <div className="flex flex-wrap gap-2 text-[11px] font-bold">
                    <span className="rounded-full bg-success-soft px-2.5 py-1 text-success">{counts.valid} valid</span>
                    <span className="rounded-full bg-warning-soft px-2.5 py-1 text-warning">{counts.duplicate} duplicate</span>
                    <span className="rounded-full bg-active px-2.5 py-1 text-primary">{counts.invalid} invalid</span>
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-border-subtle">
                    <table className="w-full text-left text-xs" style={{ minWidth: `${columns.length * 150 + 160}px` }}>
                      <thead className="bg-page text-[10px] font-black uppercase tracking-wider text-muted">
                        <tr>
                          <th className="px-2 py-2">#</th>
                          {columns.map((col) => <th key={col.key} className="px-2 py-2">{col.label}</th>)}
                          <th className="px-2 py-2">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {records.map((row, index) => (
                          <tr key={index} className="border-t border-border-subtle align-top">
                            <td className="px-2 py-2 text-subtle">{index + 1}</td>
                            {columns.map((col) => (
                              <td key={col.key} className="px-2 py-2">
                                <input
                                  value={row.data[col.key] || ""}
                                  onChange={(event) => setRecordCell(index, col.key, event.target.value)}
                                  className="w-full rounded-lg border border-border-subtle bg-card px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-success"
                                />
                              </td>
                            ))}
                            <td className="px-2 py-2">
                              <span className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${STATUS_TONE[row.evaluation.status]}`}>
                                {row.evaluation.status}
                              </span>
                              {row.evaluation.errors.length > 0 && (
                                <p className="mt-1 text-[10px] text-primary">{row.evaluation.errors.join("; ")}</p>
                              )}
                              {row.evaluation.status === "duplicate" && (
                                <select
                                  value={row.action}
                                  onChange={(event) => setRecords((current) => current.map((r, i) => i === index ? { ...r, action: event.target.value } : r))}
                                  className="mt-1 w-full rounded-lg border border-border-subtle bg-card px-1.5 py-1 text-[10px]"
                                >
                                  <option value="skip">Skip</option>
                                  {dedupe?.allowUpdate !== false && <option value="update">Update existing</option>}
                                  {dedupe?.allowNew !== false && <option value="new">Import as new</option>}
                                </select>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div>
                <button type="button" onClick={() => setShowSource((value) => !value)} className="text-xs font-bold text-info hover:underline">
                  {showSource ? "Hide" : "Show"} original document
                </button>
                {showSource && (
                  <div
                    className="prose-word mt-2 max-h-64 overflow-y-auto rounded-xl border border-border-subtle bg-page p-3 text-sm text-ink [&_h1]:mb-1 [&_h1]:text-base [&_h1]:font-black [&_h2]:mt-2 [&_h2]:font-bold [&_li]:ml-4 [&_li]:list-disc [&_table]:w-full [&_td]:border [&_td]:border-border-subtle [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-border-subtle [&_th]:bg-card [&_th]:px-2 [&_th]:py-1"
                    dangerouslySetInnerHTML={{ __html: parsed.html }}
                  />
                )}
              </div>
            </div>
          )}

          {saveResult && (
            <div className="py-8 text-center">
              <CheckCircle2 className="mx-auto h-10 w-10 text-success" />
              <p className="mt-3 text-lg font-black text-ink">Import complete</p>
              <p className="mt-1 text-sm text-muted">
                {saveResult.imported ?? importable.length} record{(saveResult.imported ?? importable.length) === 1 ? "" : "s"} imported
                {saveResult.updated ? ` · ${saveResult.updated} updated` : ""}
                {saveResult.skipped ? ` · ${saveResult.skipped} skipped` : ""}
                {saveResult.failed?.length ? ` · ${saveResult.failed.length} failed` : ""}.
              </p>
              {saveResult.failed?.length > 0 && (
                <ul className="mx-auto mt-3 max-w-md space-y-1 text-left text-xs text-primary">
                  {saveResult.failed.slice(0, 12).map((failure, index) => <li key={index}>Row {failure.row}: {failure.message}</li>)}
                </ul>
              )}
              {saveResult.credentials?.length > 0 && (
                <div className="mx-auto mt-4 max-w-md rounded-xl border border-border-subtle bg-page p-3 text-left">
                  <p className="mb-1 text-xs font-bold text-ink">Temporary passwords — share with each person, then have them change it:</p>
                  <ul className="max-h-40 space-y-0.5 overflow-y-auto text-[11px] text-muted">
                    {saveResult.credentials.map((cred, index) => <li key={index}><b className="text-ink">{cred.email}</b> — <code>{cred.password}</code></li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border-subtle px-5 py-4">
          <button type="button" onClick={close} className="rounded-xl px-4 py-2.5 text-sm font-bold text-muted hover:bg-page">
            {saveResult ? "Close" : "Cancel"}
          </button>
          {step === "review" && !saveResult && (
            <div className="flex gap-2">
              <button type="button" onClick={reset} className="rounded-xl border border-border-subtle px-4 py-2.5 text-sm font-bold text-ink hover:bg-page">Upload another</button>
              {mode === "fields" ? (
                <button type="button" disabled={busy} onClick={confirmFields} className="rounded-xl bg-success px-5 py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-60">
                  {busy ? "Importing…" : "Import into form"}
                </button>
              ) : (
                <button type="button" disabled={busy || !importable.length || Boolean(canConfirm?.())} title={canConfirm?.() || ""} onClick={confirmRecords} className="rounded-xl bg-success px-5 py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-60">
                  {busy ? "Importing…" : `Import ${importable.length} record${importable.length === 1 ? "" : "s"}`}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
