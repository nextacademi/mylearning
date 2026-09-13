"use client";

import { useEffect, useRef, useState } from "react";
import { Download, FileSpreadsheet, FileText, Printer, Table2 } from "lucide-react";
import { runExport } from "../../lib/data-table/export";

const FORMATS = [
  { key: "csv", label: "CSV (.csv)", Icon: Table2 },
  { key: "xlsx", label: "Excel (.xlsx)", Icon: FileSpreadsheet },
  { key: "pdf", label: "PDF (.pdf)", Icon: FileText },
  { key: "print", label: "Print", Icon: Printer },
];

// Reusable export control for the shared DataTable. Operates only on rows
// already loaded in the browser (role-scoped upstream) — scope just picks
// which of them to write.
export default function ExportMenu({ columns, pageRows = [], filteredRows = [], allRows = [], name = "export", disabled }) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState("filtered");
  const [busy, setBusy] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => { if (ref.current && !ref.current.contains(event.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const scopes = [
    { key: "page", label: "Current page", rows: pageRows },
    { key: "filtered", label: "Filtered results", rows: filteredRows },
    { key: "all", label: "All records", rows: allRows },
  ];
  const rows = (scopes.find((entry) => entry.key === scope) || scopes[1]).rows;

  async function go(format) {
    setBusy(format);
    try {
      await runExport(format, { columns, rows, name });
    } finally {
      setBusy("");
      if (format !== "print") setOpen(false);
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled || !allRows.length}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-1.5 rounded-xl border border-border-subtle bg-card px-3 py-2 text-xs font-bold text-ink shadow-sm hover:bg-page disabled:opacity-50"
      >
        <Download className="h-4 w-4" /> Export
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-60 rounded-2xl border border-border-subtle bg-card p-2 shadow-xl">
          <p className="px-2 pb-1 pt-1 text-[10px] font-black uppercase tracking-wider text-subtle">Scope</p>
          <div className="mb-2 grid gap-0.5">
            {scopes.map((entry) => (
              <button
                key={entry.key}
                type="button"
                onClick={() => setScope(entry.key)}
                className={`flex items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs font-semibold ${scope === entry.key ? "bg-success-soft text-success" : "text-muted hover:bg-page"}`}
              >
                {entry.label}
                <span className="text-[10px] font-bold text-subtle">{entry.rows.length}</span>
              </button>
            ))}
          </div>
          <p className="px-2 pb-1 text-[10px] font-black uppercase tracking-wider text-subtle">Format</p>
          <div className="grid gap-0.5">
            {FORMATS.map(({ key, label, Icon }) => (
              <button
                key={key}
                type="button"
                disabled={Boolean(busy) || !rows.length}
                onClick={() => go(key)}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-semibold text-ink hover:bg-page disabled:opacity-50"
              >
                <Icon className="h-3.5 w-3.5 text-subtle" />
                {busy === key ? "Preparing…" : label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
