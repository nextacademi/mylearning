"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";

const MAX_RESULTS = 50;

const label = (student) => student.displayName || student.email || "Unnamed student";
const digits = (value) => String(value || "").replace(/\D/g, "");

function matches(student, query) {
  const text = query.toLowerCase();
  const fields = [student.displayName, student.email, student.phone, student.userId];
  if (fields.some((field) => String(field || "").toLowerCase().includes(text))) return true;
  const queryDigits = digits(query);
  return queryDigits.length >= 3 && digits(student.phone).includes(queryDigits);
}

export default function StudentPicker({ students, value, onChange, className }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef(null);
  const listRef = useRef(null);

  const selected = students.find((student) => student.id === value) || null;

  const results = useMemo(() => {
    const trimmed = query.trim();
    const list = trimmed ? students.filter((student) => matches(student, trimmed)) : students;
    return list.slice(0, MAX_RESULTS);
  }, [students, query]);

  useEffect(() => {
    if (!open) return undefined;
    function onPointerDown(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${highlight}"]`)?.scrollIntoView({ block: "nearest" });
  }, [highlight]);

  function pick(id) {
    onChange(id);
    setQuery("");
    setOpen(false);
  }

  function onKeyDown(event) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setHighlight((index) => Math.min(index + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      // Enter picks the highlighted student instead of submitting the form.
      event.preventDefault();
      if (open && results[highlight]) pick(results[highlight].id);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          value={open ? query : selected ? label(selected) : ""}
          onChange={(event) => { setQuery(event.target.value); setHighlight(0); setOpen(true); }}
          onFocus={() => { setQuery(""); setHighlight(0); setOpen(true); }}
          onKeyDown={onKeyDown}
          placeholder={selected ? label(selected) : "Search by name, email or phone"}
          className={`${className} pl-9 ${selected ? "pr-9" : ""}`}
        />
        {selected && (
          <button
            type="button"
            onClick={() => pick("")}
            aria-label="Clear student"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-subtle hover:bg-page hover:text-ink"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
      {selected && !open && (selected.email || selected.phone) && (
        <span className="mt-1 block truncate text-[11px] font-normal text-subtle">
          {[selected.email, selected.phone].filter(Boolean).join(" · ")}
        </span>
      )}
      {open && (
        <ul
          ref={listRef}
          role="listbox"
          className="absolute left-0 right-0 z-30 mt-1 max-h-64 overflow-y-auto rounded-xl border border-border-subtle bg-card p-1 shadow-2xl"
        >
          <li>
            <button
              type="button"
              onClick={() => pick("")}
              className="w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-subtle hover:bg-page"
            >
              Not a specific student
            </button>
          </li>
          {results.map((student, index) => (
            <li key={student.id} data-index={index}>
              <button
                type="button"
                role="option"
                aria-selected={student.id === value}
                onMouseEnter={() => setHighlight(index)}
                onClick={() => pick(student.id)}
                className={`w-full rounded-lg px-3 py-2 text-left ${index === highlight ? "bg-active" : ""} ${student.id === value ? "font-bold" : ""}`}
              >
                <span className="block truncate text-sm text-ink">{label(student)}</span>
                <span className="block truncate text-[11px] font-normal text-subtle">
                  {[student.email, student.phone, student.userId].filter(Boolean).join(" · ") || "No contact details"}
                </span>
              </button>
            </li>
          ))}
          {!results.length && (
            <li className="px-3 py-3 text-center text-xs font-normal text-subtle">No student matches &ldquo;{query.trim()}&rdquo;</li>
          )}
          {results.length === MAX_RESULTS && (
            <li className="px-3 py-2 text-center text-[11px] font-normal text-subtle">Showing first {MAX_RESULTS} — type to narrow down</li>
          )}
        </ul>
      )}
    </div>
  );
}
