"use client";

import { ChevronDown, ChevronLeft, ChevronRight, ChevronsUpDown, ChevronUp, RotateCcw, Search } from "lucide-react";
import { useDataTable } from "../../lib/data-table/useDataTable";
import ExportMenu from "./ExportMenu";

// ---------------------------------------------------------------------------
// Reusable LMS data table. Column def:
//   {
//     key, header,
//     accessor?: (row) => value,      // default row[key]
//     render?: (row) => ReactNode,    // default the accessor value
//     sortable?: boolean,
//     sortValue?: (row) => value,     // for sort/search/filter if different
//     align?: "left" | "right" | "center",
//     searchable?: boolean,           // default true
//     filter?: { options?, predicate?, placeholder? },
//     exportValue?: (row) => value,   // default the accessor value
//     exportHeader?, exportable?: boolean,
//     className?: string,
//   }
// ---------------------------------------------------------------------------
const alignClass = { right: "text-right", center: "text-center", left: "text-left" };

export default function DataTable({
  columns,
  exportColumns,          // optional: different column set for exports (defaults to `columns`)
  rows,
  loading = false,
  error = "",
  getRowId = (row) => row.id,
  rowActions,            // (row) => ReactNode  (rendered in a trailing "Actions" cell)
  actionsHeader = "Actions",
  onRowClick,
  toolbar,               // ReactNode rendered left of Export (e.g. "Import from Word")
  title,
  name = "export",
  initialSort = null,
  pageSize = 10,
  enableExport = true,
  emptyLabel = "No records found.",
  dense = false,
}) {
  const table = useDataTable({ rows, columns, initialSort, pageSize });
  const cellPad = dense ? "px-3 py-2" : "px-4 py-3";

  return (
    <div className="space-y-3">
      {/* ---- toolbar ---- */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-subtle" aria-hidden="true" />
          <input
            value={table.search}
            onChange={(event) => table.setSearch(event.target.value)}
            placeholder={`Search${title ? ` ${title.toLowerCase()}` : ""}…`}
            className="w-full rounded-xl border border-border-subtle bg-card py-2 pl-9 pr-3 text-sm shadow-sm outline-none focus:ring-2 focus:ring-success"
          />
        </label>

        {table.filterable.map((col) => (
          <select
            key={col.key}
            value={table.filters[col.key] ?? "__all__"}
            onChange={(event) => table.setFilter(col.key, event.target.value)}
            className="rounded-xl border border-border-subtle bg-card px-3 py-2 text-xs font-semibold text-ink shadow-sm outline-none focus:ring-2 focus:ring-success"
          >
            <option value="__all__">{col.filter.placeholder || `All ${col.header || col.key}`}</option>
            {(table.filterOptions[col.key] || []).map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        ))}

        {table.activeFilterCount > 0 && (
          <button type="button" onClick={table.reset} className="inline-flex items-center gap-1 rounded-xl border border-border-subtle bg-card px-2.5 py-2 text-xs font-bold text-muted hover:bg-page">
            <RotateCcw className="h-3.5 w-3.5" /> Clear
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          {toolbar}
          {enableExport && (
            <ExportMenu
              columns={exportColumns || columns}
              pageRows={table.pageRows}
              filteredRows={table.sortedRows}
              allRows={rows}
              name={name}
            />
          )}
        </div>
      </div>

      {error && <p className="rounded-xl bg-active p-3 text-sm text-primary">{error}</p>}

      {/* ---- table ---- */}
      <div className="overflow-x-auto rounded-2xl border border-border-subtle bg-card shadow-sm">
        <table className="w-full text-left text-sm" style={{ minWidth: `${Math.max(640, columns.length * 130)}px` }}>
          <thead className="bg-page text-[10px] font-black uppercase tracking-wider text-muted">
            <tr>
              {columns.map((col) => {
                const active = table.sort?.key === col.key;
                return (
                  <th
                    key={col.key}
                    className={`${cellPad} ${alignClass[col.align] || "text-left"} ${col.sortable ? "cursor-pointer select-none" : ""}`}
                    onClick={col.sortable ? () => table.toggleSort(col.key) : undefined}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.header}
                      {col.sortable && (active
                        ? (table.sort.dir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)
                        : <ChevronsUpDown className="h-3 w-3 opacity-40" />)}
                    </span>
                  </th>
                );
              })}
              {rowActions && <th className={`${cellPad} text-right`}>{actionsHeader}</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={columns.length + (rowActions ? 1 : 0)} className="px-4 py-12 text-center text-sm text-muted">Loading…</td></tr>
            ) : !table.pageRows.length ? (
              <tr><td colSpan={columns.length + (rowActions ? 1 : 0)} className="px-4 py-12 text-center text-sm text-muted">{table.total ? "No records match your search or filters." : emptyLabel}</td></tr>
            ) : (
              table.pageRows.map((row) => (
                <tr
                  key={getRowId(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={`border-t border-border-subtle transition-colors hover:bg-page ${onRowClick ? "cursor-pointer" : ""}`}
                >
                  {columns.map((col) => (
                    <td key={col.key} className={`${cellPad} ${alignClass[col.align] || "text-left"} ${col.className || ""}`}>
                      {col.render ? col.render(row) : String(
                        (col.accessor ? col.accessor(row) : row[col.key]) ?? "—",
                      )}
                    </td>
                  ))}
                  {rowActions && (
                    <td className={`${cellPad} text-right`} onClick={(event) => event.stopPropagation()}>
                      <div className="flex justify-end gap-1.5">{rowActions(row)}</div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ---- pagination ---- */}
      {!loading && table.sortedRows.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
          <div className="flex items-center gap-2">
            <span>
              {(table.page - 1) * table.pageSize + 1}–{Math.min(table.page * table.pageSize, table.sortedRows.length)} of{" "}
              <b className="text-ink">{table.sortedRows.length}</b>
              {table.sortedRows.length !== table.total && <span> (filtered from {table.total})</span>}
            </span>
            <select
              value={table.pageSize}
              onChange={(event) => { table.setPageSize(Number(event.target.value)); table.setPage(1); }}
              className="rounded-lg border border-border-subtle bg-card px-2 py-1 text-xs"
            >
              {[10, 25, 50, 100].map((size) => <option key={size} value={size}>{size} / page</option>)}
            </select>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" disabled={table.page <= 1} onClick={() => table.setPage(table.page - 1)} className="rounded-lg border border-border-subtle bg-card p-1.5 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
            <span className="px-2 font-bold text-ink">{table.page} / {table.pageCount}</span>
            <button type="button" disabled={table.page >= table.pageCount} onClick={() => table.setPage(table.page + 1)} className="rounded-lg border border-border-subtle bg-card p-1.5 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
      )}
    </div>
  );
}

// Shared status-badge helper so every module's badges look identical.
const BADGE_TONES = {
  green: "bg-success-soft text-success",
  blue: "bg-info-soft text-info",
  purple: "bg-purple-soft text-purple",
  orange: "bg-warning-soft text-warning",
  red: "bg-active text-primary",
  gray: "bg-page text-muted",
};
export function StatusBadge({ children, tone = "gray" }) {
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide ${BADGE_TONES[tone] || BADGE_TONES.gray}`}>{children}</span>;
}
