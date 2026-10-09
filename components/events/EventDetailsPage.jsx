"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AnimatePresence, motion, MotionConfig } from "framer-motion";
import { useAuth } from "../../lib/auth-context";
import { db } from "../../lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { TeacherShell } from "../TeacherWorkspacePage";
import DirectorShell from "../dashboard/DirectorShell";
import AdminShell from "../dashboard/AdminShell";
import {
  addEventParticipant, addEventWalkIn, cancelEventRegistration, loadEventParticipants, loadEvents,
  markEventAttendance, registerForEvent, removeEventParticipant, scanEventAttendance, updateEventParticipant,
} from "../../lib/services/event-service";
import { loadMyParticipation } from "../../lib/events-client";
import { loadUsers } from "../../lib/services/user-service";
import { computeEventStatus, isRegistrationOpen } from "../../lib/events-shared";
import { useConfirm } from "../ui/ConfirmDialog";
import { SkeletonBar, SkeletonList } from "../ui/Skeleton";

// Perceived-speed only — mirrors the real header + tab nav + Overview
// panel shape below so there's no layout jump once the real event data
// resolves.
function EventDetailsSkeleton() {
  return (
    <div className="mt-6">
      <div className="overflow-hidden rounded-3xl border border-border-subtle bg-card shadow-sm">
        <div className="p-6">
          <SkeletonBar className="h-5 w-24 rounded-full" />
          <SkeletonBar className="mt-3 h-9 w-2/3" />
          <SkeletonBar className="mt-3 h-4 w-1/2" />
        </div>
      </div>
      <div className="my-5 h-12 animate-pulse rounded-2xl border border-border-subtle bg-card" />
      <div className="rounded-3xl border border-border-subtle bg-card p-7 shadow-sm">
        <SkeletonBar className="mb-5 h-5 w-32" />
        <div className="grid gap-x-12 gap-y-6 sm:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <SkeletonBar className="h-2.5 w-20" />
              <SkeletonBar className="h-4 w-28" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const managerModules = ["Dashboard", "Students", "Teacher", "Training", "Event", "Finance", "Documents", "My Shop", "User", "Chat", "Achievement", "ID Card", "Scan QR Code"];

function Empty({ children }) {
  return <div className="rounded-2xl border border-dashed border-border-subtle bg-card p-8 text-center text-sm text-muted">{children}</div>;
}
function Panel({ title, children, action }) {
  return (
    <section className="rounded-3xl border border-border-subtle bg-card p-7 shadow-sm">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><h2 className="font-bold text-ink">{title}</h2>{action}</div>
      {children}
    </section>
  );
}
function Field({ label, value }) {
  return <div><dt className="text-[10px] font-bold uppercase tracking-wider text-subtle">{label}</dt><dd className="mt-1 text-sm text-ink">{value || "—"}</dd></div>;
}
const statusTones = { Upcoming: "bg-info-soft text-info", Ongoing: "bg-success-soft text-success", Completed: "bg-page text-subtle", Cancelled: "bg-active text-primary", Draft: "bg-warning-soft text-warning" };

// Same entrance-motion vocabulary as components/settings/SettingsPage.jsx
// (kept as a local copy rather than a shared import — this is the only
// other place that needed it so far) so opening an event reads as an
// animated arrival like Settings does, instead of the plain instant swap
// this page had before.
const EASE = [0.22, 1, 0.36, 1];
const staggerContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
};
const fadeSlideUp = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } },
};

function downloadCsv(filename, rows, headers) {
  const escape = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const csv = [headers.map(escape).join(","), ...rows.map((row) => headers.map((h) => escape(row[h])).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Walk-in = someone who turned up / helped without registering. Pick an
// existing account (their hours add to their profile totals) or type a
// guest's details; either way they're marked present with hours credited.
function WalkInDialog({ eventId, staff, participants, defaultHours, onClose, onAdded }) {
  const [mode, setMode] = useState("existing");
  const [search, setSearch] = useState("");
  const [userId, setUserId] = useState("");
  const [guest, setGuest] = useState({ name: "", email: "", phone: "" });
  const [eventRole, setEventRole] = useState("Volunteer");
  const [hours, setHours] = useState(String(defaultHours || ""));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const present = new Set(participants.filter((p) => p.attendanceStatus === "present").map((p) => p.userId));
  const q = search.trim().toLowerCase();
  const matches = staff
    .filter((item) => !present.has(item.uid))
    .filter((item) => !q || [item.displayName, item.email, item.phone].some((v) => String(v || "").toLowerCase().includes(q)))
    .slice(0, 50);

  async function save(event) {
    event.preventDefault();
    if (mode === "existing" && !userId) return setError("Choose a person.");
    if (mode === "guest" && !guest.name.trim()) return setError("Enter the walk-in's name.");
    setSaving(true);
    setError("");
    try {
      await addEventWalkIn(eventId, { ...(mode === "existing" ? { userId } : guest), eventRole, hours });
      onAdded();
    } catch (saveError) {
      setError(saveError.message || "Unable to add this walk-in.");
      setSaving(false);
    }
  }

  const input = "w-full rounded-xl border border-border-subtle bg-card px-3 py-2 text-sm";
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4" role="dialog" aria-modal="true">
      <form onSubmit={save} className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-3xl bg-card p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-ink">Add walk-in</h3>
          <button type="button" onClick={onClose} className="text-xl text-muted" aria-label="Close">×</button>
        </div>
        <div className="flex gap-1 rounded-xl border border-border-subtle p-1 text-xs font-bold">
          {[["existing", "Existing member"], ["guest", "Guest (no account)"]].map(([key, label]) => (
            <button key={key} type="button" onClick={() => setMode(key)} className={`flex-1 rounded-lg px-3 py-2 ${mode === key ? "bg-primary text-white" : "text-muted hover:bg-page"}`}>{label}</button>
          ))}
        </div>
        {mode === "existing" ? (
          <div className="space-y-2">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, or phone…" className={input} />
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-border-subtle p-1">
              {matches.length ? matches.map((item) => (
                <label key={item.uid} className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${userId === item.uid ? "bg-active" : "hover:bg-page"}`}>
                  <input type="radio" name="walkin-user" checked={userId === item.uid} onChange={() => setUserId(item.uid)} />
                  <span className="min-w-0 truncate text-ink">{item.displayName || item.email}</span>
                  <span className="ml-auto shrink-0 text-[11px] text-muted">{item.role}</span>
                </label>
              )) : <p className="p-3 text-xs text-muted">No matching members.</p>}
            </div>
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            <input required value={guest.name} onChange={(e) => setGuest({ ...guest, name: e.target.value })} placeholder="Full name" className={`${input} sm:col-span-2`} />
            <input type="email" value={guest.email} onChange={(e) => setGuest({ ...guest, email: e.target.value })} placeholder="Email (optional)" className={input} />
            <input type="tel" value={guest.phone} onChange={(e) => setGuest({ ...guest, phone: e.target.value })} placeholder="Phone (optional)" className={input} />
            <p className="text-[11px] text-subtle sm:col-span-2">A guest&apos;s hours are recorded on this event only — there&apos;s no profile to add them to.</p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1 text-xs font-bold text-muted">
            Role at this event
            <select value={eventRole} onChange={(e) => setEventRole(e.target.value)} className={input}>
              <option value="Volunteer">Volunteer</option>
              <option value="Participant">Participant</option>
            </select>
          </label>
          <label className="grid gap-1 text-xs font-bold text-muted">
            Hours to credit
            <input type="number" min="0" max="24" step="0.25" value={hours} onChange={(e) => setHours(e.target.value)} className={input} />
          </label>
        </div>
        {error && <p className="rounded-xl bg-active px-3 py-2 text-xs text-primary">{error}</p>}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} disabled={saving} className="px-4 py-2 text-sm font-bold text-muted">Cancel</button>
          <button disabled={saving} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-60">{saving ? "Adding…" : "Add & check in"}</button>
        </div>
      </form>
    </div>
  );
}

function ActivityPills({ totals }) {
  if (!totals) return <span className="text-[11px] text-subtle">Guest</span>;
  const pill = "rounded-full border border-red-line px-2 py-0.5 text-[10px] font-bold text-muted";
  return (
    <div className="flex flex-wrap gap-1">
      <span className={pill}>{totals.volunteerHours} VOL H</span>
      <span className={pill}>{totals.eventHours} EVENT H</span>
      <span className={pill}>{totals.eventsAttended} EVENTS</span>
    </div>
  );
}

function ParticipantsTab({ eventId, canManage, staff, onNotice }) {
  const confirm = useConfirm();
  const [participants, setParticipants] = useState([]);
  const [defaultHours, setDefaultHours] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [addingId, setAddingId] = useState("");
  const [walkIn, setWalkIn] = useState(false);
  const [search, setSearch] = useState("");
  const [hoursDraft, setHoursDraft] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await loadEventParticipants(eventId);
      setParticipants(result.participants || []);
      setDefaultHours(result.defaultHours || 0);
      setError("");
    } catch (loadError) {
      setError(loadError.message || "Unable to load participants.");
    } finally {
      setLoading(false);
    }
  }, [eventId]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  async function addParticipant() {
    if (!addingId) return;
    try {
      await addEventParticipant(eventId, addingId);
      setAddingId("");
      onNotice("Participant added.");
      await load();
    } catch (addError) {
      setError(addError.message || "Unable to add this participant.");
    }
  }
  async function update(userId, patch, message) {
    try {
      await updateEventParticipant(eventId, userId, patch);
      if (message) onNotice(message);
      await load();
    } catch (updateError) {
      setError(updateError.message || "Unable to update this participant.");
    }
  }
  async function remove(userId) {
    if (!(await confirm({ title: "Remove participant", message: "Remove this participant? Any hours credited for this event are taken off their totals.", tone: "danger", confirmLabel: "Remove" }))) return;
    try {
      await removeEventParticipant(eventId, userId);
      onNotice("Participant removed.");
      await load();
    } catch (removeError) {
      setError(removeError.message || "Unable to remove this participant.");
    }
  }
  function exportCsv() {
    downloadCsv(
      `event-${eventId}-participants.csv`,
      participants.map((p) => ({ Name: p.displayName, Email: p.email, Phone: p.phone, "Event Role": p.eventRole, Source: p.source, "Registered At": p.registeredAt || "", Attendance: p.attendanceStatus || "Not marked", "Hours Credited": p.hoursCredited })),
      ["Name", "Email", "Phone", "Event Role", "Source", "Registered At", "Attendance", "Hours Credited"],
    );
  }

  const available = staff.filter((item) => !participants.some((p) => p.userId === item.uid));
  const q = search.trim().toLowerCase();
  const shown = participants.filter((p) => !q || [p.displayName, p.email, p.phone].some((v) => String(v || "").toLowerCase().includes(q)));
  const presentCount = participants.filter((p) => p.attendanceStatus === "present").length;
  const totalHours = participants.reduce((sum, p) => sum + (p.attendanceStatus === "present" ? p.hoursCredited : 0), 0);

  return (
    <Panel
      title={`Participants (${participants.length})`}
      action={
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={exportCsv} disabled={!participants.length} className="rounded-xl border border-border-subtle px-3 py-2 text-xs font-bold text-ink hover:bg-active disabled:opacity-40">Export CSV</button>
          {canManage && <button type="button" onClick={() => setWalkIn(true)} className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white">+ Add walk-in</button>}
        </div>
      }
    >
      <p className="mb-3 text-xs text-muted">
        {presentCount} attended · {totalHours}h credited in total · default {defaultHours}h per person (the event&apos;s length). Scanning someone&apos;s ID QR in the Attendance tab checks them in and credits their hours — even if they didn&apos;t register.
      </p>
      {canManage && (
        <div className="mb-4 flex flex-wrap gap-2 rounded-2xl bg-page p-3">
          <select value={addingId} onChange={(e) => setAddingId(e.target.value)} className="flex-1 rounded-xl border border-border-subtle bg-card px-3 py-2 text-xs">
            <option value="">Register someone (not checked in yet)...</option>
            {available.map((item) => <option key={item.uid} value={item.uid}>{item.displayName || item.email} ({item.role})</option>)}
          </select>
          <button type="button" onClick={addParticipant} disabled={!addingId} className="rounded-xl border border-border-subtle bg-card px-4 py-2 text-xs font-bold text-ink disabled:opacity-40">Register</button>
        </div>
      )}
      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, or phone…" className="mb-3 w-full rounded-xl border border-border-subtle bg-card px-3 py-2 text-sm" />
      {error && <p className="mb-3 rounded-xl bg-active px-3 py-2 text-xs text-primary">{error}</p>}
      {loading ? (
        <SkeletonList count={5} />
      ) : participants.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="border-b text-[10px] uppercase tracking-wider text-subtle"><tr>{["Member", "Contact", "Role", "Attendance", "Hours", "Previous activity", canManage ? "Actions" : ""].map((label) => <th key={label} className="p-3">{label}</th>)}</tr></thead>
            <tbody>
              {shown.map((p) => {
                const present = p.attendanceStatus === "present";
                const draft = hoursDraft[p.userId];
                return (
                  <tr key={p.userId} className="border-b border-border-subtle text-xs">
                    <td className="p-3">
                      <b className="block text-ink">{p.displayName || "—"}</b>
                      {p.source === "walk-in" && <span className="text-[10px] font-bold uppercase text-warning">Walk-in</span>}
                    </td>
                    <td className="p-3 text-muted">{p.email}{p.phone ? <span className="block">{p.phone}</span> : null}</td>
                    <td className="p-3">
                      {canManage ? (
                        <button
                          type="button"
                          onClick={() => update(p.userId, { eventRole: p.eventRole === "Volunteer" ? "Participant" : "Volunteer" })}
                          title="Click to switch Participant / Volunteer"
                          className={`rounded-xl px-3 py-1.5 font-bold ${p.eventRole === "Volunteer" ? "bg-primary text-white" : "border border-border-subtle text-ink hover:bg-page"}`}
                        >
                          {p.eventRole}
                        </button>
                      ) : p.eventRole}
                    </td>
                    <td className="p-3">
                      <select
                        value={p.attendanceStatus || ""}
                        onChange={(e) => update(p.userId, { attendanceStatus: e.target.value || null }, "Attendance updated.")}
                        className={`rounded-lg border border-border-subtle px-2 py-1.5 text-xs font-bold ${present ? "text-success" : p.attendanceStatus === "absent" ? "text-primary" : "text-muted"}`}
                      >
                        <option value="">Not marked</option>
                        <option value="present">Attended</option>
                        <option value="absent">Absent</option>
                      </select>
                    </td>
                    <td className="p-3">
                      {present ? (
                        <span className="flex items-center gap-1">
                          <input
                            type="number"
                            min="0"
                            max="24"
                            step="0.25"
                            value={draft ?? p.hoursCredited}
                            onChange={(e) => setHoursDraft({ ...hoursDraft, [p.userId]: e.target.value })}
                            onBlur={() => {
                              if (draft === undefined || Number(draft) === p.hoursCredited) return;
                              setHoursDraft((d) => { const next = { ...d }; delete next[p.userId]; return next; });
                              update(p.userId, { hours: draft }, "Hours updated.");
                            }}
                            className="w-16 rounded-lg border border-border-subtle px-2 py-1 text-xs"
                            aria-label={`Hours credited to ${p.displayName}`}
                          />
                          <span className="text-muted">h</span>
                        </span>
                      ) : <span className="text-subtle">—</span>}
                    </td>
                    <td className="p-3"><ActivityPills totals={p.totals} /></td>
                    {canManage && <td className="p-3"><button type="button" onClick={() => remove(p.userId)} className="text-primary hover:underline">Remove</button></td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>No participants yet — scan ID cards in the Attendance tab, or use “Add walk-in”.</Empty>
      )}
      {walkIn && (
        <WalkInDialog
          eventId={eventId}
          staff={staff}
          participants={participants}
          defaultHours={defaultHours}
          onClose={() => setWalkIn(false)}
          onAdded={async () => { setWalkIn(false); onNotice("Walk-in added and checked in."); await load(); }}
        />
      )}
    </Panel>
  );
}

const SCANNER_ELEMENT_ID = "event-attendance-scanner";

function AttendanceTab({ eventId, onNotice }) {
  const [participants, setParticipants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [manualToken, setManualToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const scannerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await loadEventParticipants(eventId);
      setParticipants(data.participants || []);
    } finally {
      setLoading(false);
    }
  }, [eventId]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  useEffect(() => () => { scannerRef.current?.stop().catch(() => {}); }, []);

  async function mark(userId, attendanceStatus) {
    try {
      await markEventAttendance(eventId, userId, attendanceStatus);
      onNotice("Attendance updated.");
      await load();
    } catch (markError) {
      onNotice(markError.message || "Unable to update attendance.", true);
    }
  }

  async function handleToken(tokenValue) {
    if (!tokenValue || busy) return;
    setBusy(true);
    setResult(null);
    try {
      const response = await scanEventAttendance(eventId, tokenValue);
      setResult({ ok: true, ...response });
      await load();
    } catch (scanError) {
      setResult({ ok: false, message: scanError.message });
    } finally {
      setBusy(false);
    }
  }
  async function startScanning() {
    setCameraError("");
    setResult(null);
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const scanner = new Html5Qrcode(SCANNER_ELEMENT_ID);
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

  const present = participants.filter((p) => p.attendanceStatus === "present").length;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_.9fr]">
      <Panel title={`Manual attendance (${present}/${participants.length} present)`}>
        {loading ? <SkeletonList count={4} /> : participants.length ? (
          <div className="space-y-2">
            {participants.map((p) => (
              <div key={p.userId} className="flex items-center justify-between rounded-xl bg-page p-3 text-xs">
                <span>
                  <b className="block">{p.displayName || p.email}</b>
                  <span className="text-[11px] text-muted">{p.eventRole}{p.attendanceStatus === "present" ? ` · ${p.hoursCredited}h credited` : ""}</span>
                </span>
                <div className="flex gap-2">
                  <button type="button" onClick={() => mark(p.userId, "present")} className={`rounded-lg px-3 py-1.5 font-bold ${p.attendanceStatus === "present" ? "bg-success text-white" : "border border-border-subtle text-muted hover:bg-active"}`}>Present</button>
                  <button type="button" onClick={() => mark(p.userId, "absent")} className={`rounded-lg px-3 py-1.5 font-bold ${p.attendanceStatus === "absent" ? "bg-primary text-white" : "border border-border-subtle text-muted hover:bg-active"}`}>Absent</button>
                </div>
              </div>
            ))}
          </div>
        ) : <Empty>No participants to mark attendance for.</Empty>}
      </Panel>
      <Panel title="Scan a participant's ID QR code">
        <div id={SCANNER_ELEMENT_ID} className="mx-auto max-w-sm overflow-hidden rounded-2xl bg-slate-900" />
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
          <div className={`mt-4 rounded-2xl p-4 text-sm ${result.ok ? (result.code === "already_marked" ? "bg-warning-soft text-warning" : "bg-success-soft text-success") : "bg-active text-primary"}`}>
            <b className="block">{result.message}</b>
            {result.participant && <p className="mt-1 text-xs">{result.participant.displayName || result.participant.email}</p>}
          </div>
        )}
      </Panel>
    </div>
  );
}

export default function EventDetailsPage() {
  const { user, profile, loading: authLoading, logout } = useAuth();
  const confirm = useConfirm();
  const { eventId } = useParams();
  const router = useRouter();
  const [tab, setTab] = useState("Overview");
  const [event, setEvent] = useState(null);
  const [myParticipation, setMyParticipation] = useState(null);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [registering, setRegistering] = useState(false);

  const canManage = profile?.role === "Admin" || profile?.role === "Director";
  const isOrganizerTeacher = profile?.role === "Teacher" && event?.organizerId === user?.uid;
  const canManageAttendance = canManage || isOrganizerTeacher;

  const flash = (message, isError) => (isError ? setError(message) : setNotice(message));

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!eventId || authLoading || !profile) return;
    let cancelled = false;
    async function run() {
      setLoading(true);
      try {
        if (canManage) {
          const result = await loadEvents();
          const found = (result.events || []).find((item) => item.id === eventId);
          if (!cancelled) setEvent(found || null);
        } else if (db) {
          const snapshot = await getDoc(doc(db, "academyEvents", eventId));
          if (!cancelled) setEvent(snapshot.exists() ? { id: snapshot.id, ...snapshot.data(), computedStatus: computeEventStatus(snapshot.data()) } : null);
          if (user?.uid) {
            const participation = await loadMyParticipation(eventId, user.uid);
            if (!cancelled) setMyParticipation(participation);
          }
        }
        setError("");
      } catch (loadError) {
        if (!cancelled) setError(loadError.code === "permission-denied" ? "You do not have access to this event." : loadError.message || "Unable to load this event.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => { cancelled = true; };
  }, [eventId, authLoading, profile, canManage, user?.uid]);

  useEffect(() => {
    if (!canManage) return;
    loadUsers().then((result) => setStaff(result.users || [])).catch(() => {});
  }, [canManage]);

  async function register() {
    setRegistering(true);
    try {
      await registerForEvent(eventId);
      flash("You are registered for this event.");
      setMyParticipation(await loadMyParticipation(eventId, user.uid));
    } catch (registerError) {
      flash(registerError.message, true);
    } finally {
      setRegistering(false);
    }
  }
  async function cancelRegistration() {
    if (!(await confirm({ title: "Cancel registration", message: "Cancel your registration for this event?", tone: "danger", confirmLabel: "Cancel registration", cancelLabel: "Keep it" }))) return;
    setRegistering(true);
    try {
      await cancelEventRegistration(eventId);
      flash("Registration cancelled.");
      setMyParticipation(null);
    } catch (cancelError) {
      flash(cancelError.message, true);
    } finally {
      setRegistering(false);
    }
  }

  const tabs = ["Overview", ...(canManage || isOrganizerTeacher ? ["Participants", "Attendance"] : [])];

  // The dashboard tab lives only in that page's own React state, not the
  // URL — so navigating to the bare dashboard URL always lands back on its
  // default "Dashboard" tab, which read as an unwanted reset. `?tab=...`
  // (read by app/dashboard/[role]/page.jsx on mount) makes the destination
  // itself encode "come back to the Events tab", so this works the same
  // whether it's a fresh push or a browser back — no reliance on history
  // state. Teacher has a real dedicated route for this instead of a tab, so
  // it needs no query param. The tab's actual NAME differs by role — it's
  // "Event" (singular) only for Admin/Director; every other role's sidebar
  // calls it "Events" (plural, see roleConfig in app/dashboard/[role]/page)
  // — using the wrong name silently fails the `config.modules.includes()`
  // check there and falls back to "Dashboard" instead of Events.
  const backHref =
    profile?.role === "Teacher"
      ? "/teacher/events"
      : canManage
        ? `/dashboard/${(profile?.role || "admin").toLowerCase()}?tab=Event`
        : `/dashboard/${(profile?.role || "student").toLowerCase()}?tab=Events`;

  function goBack() {
    router.push(backHref);
  }

  const registrationOpen = event ? isRegistrationOpen(event) : false;
  const isFull = event?.maxParticipants != null && event.participantCount >= event.maxParticipants;

  const body = (
    <div className="px-2">
      <button type="button" onClick={goBack} className="mb-6 inline-block text-xs font-semibold text-primary hover:underline">← Back to Events</button>
      {authLoading || loading ? (
        <EventDetailsSkeleton />
      ) : error ? (
        <Empty>{error}</Empty>
      ) : !event ? (
        <Empty>Event not found</Empty>
      ) : (
        <MotionConfig reducedMotion="user">
          <motion.div initial="hidden" animate="show" variants={staggerContainer}>
            {notice && <p className="mb-4 rounded-xl bg-success-soft p-3 text-sm text-success">{notice}</p>}
            <motion.header variants={fadeSlideUp} className="overflow-hidden rounded-2xl border border-[#f3aaaa] bg-[linear-gradient(120deg,#fff0f0_0%,#fff7f7_45%,#ffffff_100%)] shadow-sm">
              {event.bannerUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={event.bannerUrl} alt={event.name} className="h-56 w-full object-cover" />
              )}
              <div className="p-4 md:p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${statusTones[event.computedStatus] || "bg-page text-muted"}`}>{event.computedStatus}</span>
                  <span className="font-mono text-[10px] uppercase tracking-widest text-primary">{event.type}</span>
                </div>
                <h1 className="mt-1 text-lg font-black md:text-xl">{event.name}</h1>
                <p className="mt-1 max-w-2xl text-xs text-muted">{event.description || "No description available."}</p>
              </div>
            </motion.header>

            <motion.nav variants={fadeSlideUp} className="my-5 flex gap-2 overflow-x-auto rounded-2xl border border-border-subtle bg-card p-1.5 shadow-sm">
              {tabs.map((item) => <button key={item} type="button" onClick={() => setTab(item)} className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-bold ${tab === item ? "bg-primary text-white" : "text-muted hover:bg-active"}`}>{item}</button>)}
            </motion.nav>

            <AnimatePresence mode="wait">
              <motion.div key={tab} initial="hidden" animate="show" exit={{ opacity: 0, transition: { duration: 0.12 } }} variants={fadeSlideUp}>
                {tab === "Overview" && (
                  <Panel title="Overview">
                    <dl className="grid gap-x-12 gap-y-6 sm:grid-cols-3">
                      <Field label="Date" value={event.eventDate} />
                      <Field label="Time" value={event.startTime && event.endTime ? `${event.startTime}–${event.endTime}` : "—"} />
                      <Field label="Location" value={event.location} />
                      <Field label="Organizer" value={event.organizer} />
                      <Field label="Target Audience" value={(event.targetAudience || []).join(", ")} />
                      <Field label="Maximum Participants" value={event.maxParticipants ?? "No limit"} />
                      <Field label="Participants Registered" value={event.participantCount ?? 0} />
                      <Field label="Registration" value={event.registrationRequired ? `Required (deadline ${event.registrationDeadline || "none"})` : "Not required"} />
                      <Field label="Published" value={event.published ? "Yes" : "No"} />
                    </dl>
                    {!canManage && event.registrationRequired && (
                      <div className="mt-6 border-t border-border-subtle pt-5">
                        {myParticipation ? (
                          <div className="flex flex-wrap items-center gap-3">
                            <span className="rounded-full bg-success-soft px-3 py-1.5 text-xs font-bold text-success">You are registered</span>
                            {event.computedStatus !== "Completed" && <button type="button" onClick={cancelRegistration} disabled={registering} className="rounded-xl border border-border-subtle px-4 py-2 text-xs font-bold text-primary hover:bg-active disabled:opacity-40">Cancel Registration</button>}
                          </div>
                        ) : !registrationOpen ? (
                          <span className="rounded-full bg-page px-3 py-1.5 text-xs font-bold text-muted">{isFull ? "Event Full" : "Registration Closed"}</span>
                        ) : (
                          <button type="button" onClick={register} disabled={registering || isFull} className="rounded-xl bg-primary px-5 py-2.5 text-xs font-bold text-white disabled:opacity-40">{isFull ? "Event Full" : registering ? "Registering..." : "Register"}</button>
                        )}
                      </div>
                    )}
                  </Panel>
                )}
                {tab === "Participants" && <ParticipantsTab eventId={event.id} canManage={canManage} staff={staff} onNotice={flash} />}
                {tab === "Attendance" && canManageAttendance && <AttendanceTab eventId={event.id} onNotice={flash} />}
              </motion.div>
            </AnimatePresence>
          </motion.div>
        </MotionConfig>
      )}
    </div>
  );

  const paddedBody = <div className="-mx-4">{body}</div>;

  if (profile?.role === "Teacher") return <TeacherShell active="Event">{paddedBody}</TeacherShell>;

  if (profile?.role === "Director") {
    const name = profile?.displayName || user?.displayName || user?.email?.split("@")[0] || "Director";
    return (
      <DirectorShell modules={managerModules} active="Event" getHref={() => "/dashboard/director"} name={name} initials={name.slice(0, 2).toUpperCase()} photoURL={profile?.photoURL} userEmail={user?.email} headerTitle="Events" headerSubtitle="Organization overview" onLogout={logout}>
        {paddedBody}
      </DirectorShell>
    );
  }
  if (profile?.role === "Admin") {
    const name = profile?.displayName || user?.displayName || user?.email?.split("@")[0] || "Member";
    return (
      <AdminShell role="Admin" modules={managerModules} active="Event" getHref={() => "/dashboard/admin"} name={name} initials={name.slice(0, 2).toUpperCase()} photoURL={profile?.photoURL} userEmail={user?.email} headerTitle="Events" onLogout={logout}>
        {paddedBody}
      </AdminShell>
    );
  }

  return <main className="min-h-screen bg-page text-ink">{body}</main>;
}
