"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";

const MAX_RESULTS = 50;

const digits = (value) => String(value || "").replace(/\D/g, "");
const defaultLabel = (person) => person.displayName || person.email || "Unnamed";
const defaultDetail = (person) => [person.email, person.phone, person.userId].filter(Boolean).join(" · ");

function matches(person, query, label) {
  const text = query.toLowerCase();
  const fields = [label, person.displayName, person.email, person.phone, person.userId, person.role];
  if (fields.some((field) => String(field || "").toLowerCase().includes(text))) return true;
  const queryDigits = digits(query);
  return queryDigits.length >= 3 && digits(person.phone).includes(queryDigits);
}

// Type-to-search single pick from a list of people (name, email, phone, ID
// or role), in place of a long <select> that can only be scrolled. Enter
// picks the highlighted person instead of submitting the surrounding form.
//   noneLabel  — text of the "nobody" row at the top of the list
//   required   — blocks the form's native submit while nothing is picked
export default function PersonPicker({
  people,
  value,
  onChange,
  className,
  getLabel = defaultLabel,
  getDetail = defaultDetail,
  placeholder = "Search by name, email or phone",
  noneLabel = "None",
  noMatchLabel = "Nobody matches",
  ariaLabel,
  required = false,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef(null);
  const listRef = useRef(null);
  const listId = useId();

  const selected = people.find((person) => person.id === value) || null;

  const results = useMemo(() => {
    const trimmed = query.trim();
    const list = trimmed ? people.filter((person) => matches(person, trimmed, getLabel(person))) : people;
    return list.slice(0, MAX_RESULTS);
  }, [people, query, getLabel]);

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
      event.preventDefault();
      if (open && results[highlight]) pick(results[highlight].id);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  const selectedDetail = selected ? getDetail(selected) : "";

  return (
    <div ref={rootRef} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
        <input
          type="text"
          role="combobox"
          aria-label={ariaLabel}
          aria-controls={listId}
          aria-expanded={open}
          aria-autocomplete="list"
          value={open ? query : selected ? getLabel(selected) : ""}
          onChange={(event) => { setQuery(event.target.value); setHighlight(0); setOpen(true); }}
          onFocus={() => { setQuery(""); setHighlight(0); setOpen(true); }}
          onKeyDown={onKeyDown}
          placeholder={selected ? getLabel(selected) : placeholder}
          className={`${className} w-full pl-9 ${selected ? "pr-9" : ""}`}
        />
        {selected && (
          <button
            type="button"
            onClick={() => pick("")}
            aria-label={`Clear ${ariaLabel || "selection"}`}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-subtle hover:bg-page hover:text-ink"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
        {required && (
          // Invisible stand-in so the browser's own "Please fill out this
          // field" check still runs on submit, anchored under the search box.
          <input
            tabIndex={-1}
            aria-hidden="true"
            required
            value={value || ""}
            onChange={() => {}}
            className="pointer-events-none absolute bottom-0 left-1/2 h-px w-px opacity-0"
          />
        )}
      </div>
      {selected && !open && selectedDetail && (
        <span className="mt-1 block truncate text-[11px] font-normal text-subtle">{selectedDetail}</span>
      )}
      {open && (
        <ul
          id={listId}
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
              {noneLabel}
            </button>
          </li>
          {results.map((person, index) => (
            <li key={person.id} data-index={index}>
              <button
                type="button"
                role="option"
                aria-selected={person.id === value}
                onMouseEnter={() => setHighlight(index)}
                onClick={() => pick(person.id)}
                className={`w-full rounded-lg px-3 py-2 text-left ${index === highlight ? "bg-active" : ""} ${person.id === value ? "font-bold" : ""}`}
              >
                <span className="block truncate text-sm text-ink">{getLabel(person)}</span>
                <span className="block truncate text-[11px] font-normal text-subtle">{getDetail(person) || "No contact details"}</span>
              </button>
            </li>
          ))}
          {!results.length && (
            <li className="px-3 py-3 text-center text-xs font-normal text-subtle">{noMatchLabel} &ldquo;{query.trim()}&rdquo;</li>
          )}
          {results.length === MAX_RESULTS && (
            <li className="px-3 py-2 text-center text-[11px] font-normal text-subtle">Showing first {MAX_RESULTS} — type to narrow down</li>
          )}
        </ul>
      )}
    </div>
  );
}
