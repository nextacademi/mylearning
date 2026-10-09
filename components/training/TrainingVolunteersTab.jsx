"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import {
  addTrainingVolunteer, loadTrainingVolunteers, removeTrainingVolunteer, updateTrainingVolunteerHours,
} from "../../lib/services/training-volunteer-service";
import { loadUsersCached } from "../../lib/services/user-service";
import { useConfirm } from "../ui/ConfirmDialog";
import { useToast } from "../ui/Toast";
import { SkeletonList } from "../ui/Skeleton";

// Training → Volunteers: who helped run this training on a given day and
// for how long (lib/server/training-volunteers.js). Scan a volunteer's ID
// card, or "+ Add walk-in" (member or guest) — they appear in the day's
// list with their hours, which also count toward their volunteer total.

const SCANNER_ID = "training-volunteer-scanner";
function todayLocal() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

// Inline "Add walk-in volunteers" box (opened by "+ Add walk-in"): pick Half
// or Full credit, search a member, click to add — repeat for several. No
// match (or a Teacher, who can't list members)? Add the typed name as a guest.
function WalkInVolunteerPanel({ courseId, date, defaultHours, members, onAdded }) {
  const [credit, setCredit] = useState("full");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const full = Number(defaultHours) || 0;
  const half = Math.round((full / 2) * 100) / 100;
  const hours = credit === "half" ? half : full;
  const q = search.trim().toLowerCase();
  const matches = q
    ? members.filter((m) => [m.displayName, m.email, m.phone].some((v) => String(v || "").toLowerCase().includes(q))).slice(0, 8)
    : [];

  async function add(person, key) {
    setBusy(key);
    setError("");
    try {
      const result = await addTrainingVolunteer({ courseId, date, hours, ...person });
      onAdded(result.message);
      setSearch("");
    } catch (err) {
      setError(err.message || "Unable to add this volunteer.");
    } finally {
      setBusy("");
    }
  }

  const radio = (key, text) => (
    <label className={`flex cursor-pointer items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold ${credit === key ? "border-primary bg-active text-ink" : "border-transparent bg-card text-muted"}`}>
      <input type="radio" name="training-walkin-credit" checked={credit === key} onChange={() => setCredit(key)} />
      {text}
    </label>
  );

  return (
    <div className="mb-4 rounded-2xl border border-[#f3aaaa] bg-[#fdeaea] p-5">
      <h3 className="font-bold text-ink">Add walk-in volunteers · {date}</h3>
      <p className="mt-1 max-w-2xl text-xs text-muted">Add one or more people who helped run this class. Hours are based on the class length ({full}h) — choose half or full.</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-[11px] font-bold uppercase tracking-wider text-muted">Credit hours</span>
        {radio("half", `Half (${half}h)`)}
        {radio("full", `Full (${full}h)`)}
      </div>
      <div className="relative mt-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={members.length ? "Search member by name, email, or phone..." : "Type the volunteer's name..."}
          className="w-full rounded-xl border border-border-subtle bg-card px-4 py-3 text-sm"
          aria-label="Search member"
        />
        {q && (
          <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-xl border border-border-subtle bg-card p-1 shadow-xl">
            {matches.map((m) => (
              <button
                key={m.uid}
                type="button"
                disabled={Boolean(busy)}
                onClick={() => add({ userId: m.uid }, m.uid)}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-page disabled:opacity-50"
              >
                <span className="min-w-0 flex-1 truncate"><b className="text-ink">{m.displayName || m.email}</b> <span className="text-xs text-muted">{m.email}{m.phone ? ` · ${m.phone}` : ""}</span></span>
                <span className="shrink-0 text-[11px] text-muted">{busy === m.uid ? "Adding…" : m.role}</span>
              </button>
            ))}
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => add({ name: search.trim() }, "guest")}
              className="flex w-full items-center gap-2 rounded-lg border-t border-border-subtle px-3 py-2 text-left text-sm text-primary hover:bg-page disabled:opacity-50"
            >
              + Add “{search.trim()}” as a guest (no account)
            </button>
          </div>
        )}
      </div>
      {error && <p className="mt-2 rounded-xl bg-card px-3 py-2 text-xs text-primary">{error}</p>}
    </div>
  );
}

export default function TrainingVolunteersTab({ courseId }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [date, setDate] = useState(todayLocal);
  const [showAll, setShowAll] = useState(false);
  const [rows, setRows] = useState([]);
  const [defaultHours, setDefaultHours] = useState(0);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [manualToken, setManualToken] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [hoursDraft, setHoursDraft] = useState({});
  const [loadError, setLoadError] = useState("");
  const [volunteerSearch, setVolunteerSearch] = useState("");
  const scannerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await loadTrainingVolunteers(courseId, showAll ? "" : date);
      setRows(data.volunteers || []);
      setDefaultHours(data.defaultHours || 0);
      setLoadError("");
    } catch (err) {
      setLoadError(err.message || "Unable to load volunteers.");
    } finally {
      setLoading(false);
    }
  }, [courseId, date, showAll]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  // Member picker — Admin/Director only (a Teacher can still add guests or scan).
  useEffect(() => {
    loadUsersCached().then((data) => setMembers((data.users || []).filter((u) => !u.missingProfile))).catch(() => setMembers([]));
  }, []);
  useEffect(() => () => { scannerRef.current?.stop().catch(() => {}); }, []);

  async function handleToken(token) {
    if (!token || busy) return;
    setBusy(true);
    setResult(null);
    try {
      const response = await addTrainingVolunteer({ courseId, date, token });
      setResult({ ok: true, message: response.message });
      setManualToken("");
      await load();
    } catch (err) {
      setResult({ ok: false, message: err.message });
    } finally {
      setBusy(false);
    }
  }
  async function startScanning() {
    setCameraError("");
    setResult(null);
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const scanner = new Html5Qrcode(SCANNER_ID);
      scannerRef.current = scanner;
      await scanner.start({ facingMode: "environment" }, { fps: 10, qrbox: 220 }, async (decodedText) => {
        await scanner.stop().catch(() => {});
        setScanning(false);
        handleToken(decodedText);
      }, () => {});
      setScanning(true);
    } catch {
      setCameraError("Unable to access the camera. Use manual entry below instead.");
    }
  }
  async function saveHours(row) {
    const draft = hoursDraft[row.id];
    if (draft === undefined || Number(draft) === row.hours) return;
    setHoursDraft((d) => { const next = { ...d }; delete next[row.id]; return next; });
    try {
      await updateTrainingVolunteerHours(courseId, row.id, draft);
      toast.success("Hours updated.");
      await load();
    } catch (err) {
      toast.error(err.message || "Unable to update hours.");
    }
  }
  function remove(row) {
    return confirm({
      title: "Remove volunteer",
      message: `Remove ${row.displayName} from ${row.date}? Their ${row.hours}h is taken off their volunteer total.`,
      tone: "danger",
      confirmLabel: "Remove",
      onConfirm: async () => { await removeTrainingVolunteer(courseId, row.id); toast.success("Volunteer removed."); await load(); },
    });
  }

  const totalHours = rows.reduce((sum, r) => sum + (Number(r.hours) || 0), 0);
  const vq = volunteerSearch.trim().toLowerCase();
  const shownRows = vq ? rows.filter((r) => [r.displayName, r.email, r.phone].some((v) => String(v || "").toLowerCase().includes(vq))) : rows;

  return (
    <div className="grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
      <section className="rounded-3xl border border-border-subtle bg-card p-6 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-bold text-ink">Volunteers ({rows.length} · {Math.round(totalHours * 100) / 100}h)</h2>
          <div className="flex flex-wrap items-center gap-2">
            <input type="date" value={date} onChange={(e) => { setDate(e.target.value); setShowAll(false); }} className="rounded-xl border border-border-subtle bg-page px-3 py-2 text-xs" />
            <label className="flex items-center gap-1.5 text-xs font-semibold text-muted">
              <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> All days
            </label>
            <button type="button" onClick={() => setAdding((open) => !open)} className={adding ? "rounded-xl border border-border-subtle bg-card px-4 py-2 text-xs font-bold text-ink hover:bg-page" : "rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white"}>
              {adding ? "Close walk-in" : "+ Add walk-in"}
            </button>
          </div>
        </div>
        {adding && (
          <WalkInVolunteerPanel
            courseId={courseId}
            date={date}
            defaultHours={defaultHours}
            members={members}
            onAdded={async (message) => { toast.success(message || "Volunteer added."); await load(); }}
          />
        )}
        <p className="mb-3 text-xs text-muted">Who helped run this training {showAll ? "on every day" : `on ${date}`}. Each check-in credits {defaultHours}h (the class length) to their volunteer hours — edit it if they helped longer or shorter.</p>
        {loadError && <p className="mb-3 rounded-xl bg-active p-3 text-xs text-primary">{loadError}</p>}
        <input value={volunteerSearch} onChange={(e) => setVolunteerSearch(e.target.value)} placeholder="Search volunteers by name, email, or phone…" className="mb-3 w-full rounded-xl border border-border-subtle bg-card px-3 py-2 text-sm" aria-label="Search volunteers" />
        {loading ? <SkeletonList count={4} /> : shownRows.length ? (
          <div className="space-y-2">
            {shownRows.map((row) => (
              <div key={row.id} className="flex flex-col gap-2 rounded-xl bg-page p-3 text-xs sm:flex-row sm:items-center sm:justify-between">
                <span className="min-w-0">
                  <b className="block text-ink">{row.displayName}{!row.userId && <span className="ml-1.5 text-[10px] font-bold uppercase text-warning">Guest</span>}</b>
                  <span className="block truncate text-[11px] text-muted">{[row.email, row.phone].filter(Boolean).join(" · ")}{showAll ? ` · ${row.date}` : ""} · {row.source === "scan" ? "QR scan" : "added by hand"}</span>
                </span>
                <span className="flex items-center gap-2">
                  <input
                    type="number" min="0" max="24" step="0.25"
                    value={hoursDraft[row.id] ?? row.hours}
                    onChange={(e) => setHoursDraft({ ...hoursDraft, [row.id]: e.target.value })}
                    onBlur={() => saveHours(row)}
                    className="w-16 rounded-lg border border-border-subtle bg-card px-2 py-1"
                    aria-label={`Hours for ${row.displayName}`}
                  />
                  <span className="text-muted">h</span>
                  <button type="button" onClick={() => remove(row)} className="rounded-lg p-1.5 text-primary hover:bg-active" aria-label={`Remove ${row.displayName}`}><Trash2 className="h-4 w-4" /></button>
                </span>
              </div>
            ))}
          </div>
        ) : rows.length ? (
          <div className="rounded-2xl border border-dashed border-border-subtle p-8 text-center text-sm text-muted">No volunteers match “{volunteerSearch}”.</div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border-subtle p-8 text-center text-sm text-muted">No volunteers {showAll ? "yet" : "on this day"} — scan a volunteer&apos;s ID card or use “+ Add walk-in”.</div>
        )}
      </section>

      <section className="rounded-3xl border border-border-subtle bg-card p-6 shadow-sm">
        <h2 className="mb-4 font-bold text-ink">Check in a volunteer · {date}</h2>
        <div id={SCANNER_ID} className="mx-auto max-w-sm overflow-hidden rounded-2xl bg-slate-900" />
        {!scanning && <button type="button" onClick={startScanning} className="mt-4 w-full rounded-xl bg-primary py-3 text-xs font-bold text-white">Start camera scan</button>}
        {cameraError && <p className="mt-3 text-xs text-primary">{cameraError}</p>}
        <div className="mt-5 border-t border-border-subtle pt-4">
          <p className="mb-2 text-xs font-semibold text-muted">Camera denied? Paste the QR token manually:</p>
          <div className="flex gap-2">
            <input value={manualToken} onChange={(e) => setManualToken(e.target.value)} placeholder="Scanned token" className="flex-1 rounded-xl border border-border-subtle px-3 py-2 text-xs" />
            <button type="button" onClick={() => handleToken(manualToken)} disabled={busy || !manualToken} className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white disabled:opacity-40">Submit</button>
          </div>
        </div>
        {result && (
          <div className={`mt-4 rounded-2xl p-4 text-sm ${result.ok ? "bg-success-soft text-success" : "bg-active text-primary"}`}>
            <b className="block">{result.message}</b>
          </div>
        )}
      </section>

    </div>
  );
}
