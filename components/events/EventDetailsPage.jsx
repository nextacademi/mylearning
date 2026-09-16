"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "../../lib/auth-context";
import { db } from "../../lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { TeacherShell } from "../TeacherWorkspacePage";
import DirectorShell from "../dashboard/DirectorShell";
import AdminShell from "../dashboard/AdminShell";
import {
  addEventParticipant, cancelEventRegistration, loadEventParticipants, loadEvents,
  markEventAttendance, registerForEvent, removeEventParticipant, scanEventAttendance,
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

function ParticipantsTab({ eventId, canManage, staff, onNotice }) {
  const confirm = useConfirm();
  const [participants, setParticipants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [addingId, setAddingId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await loadEventParticipants(eventId);
      setParticipants(result.participants || []);
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
  async function remove(userId) {
    if (!(await confirm({ title: "Remove participant", message: "Remove this participant's registration?", tone: "danger", confirmLabel: "Remove" }))) return;
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
      participants.map((p) => ({ Name: p.displayName, Email: p.email, Phone: p.phone, Role: p.role, "Registered At": p.registeredAt || "", Attendance: p.attendanceStatus || "Not marked" })),
      ["Name", "Email", "Phone", "Role", "Registered At", "Attendance"],
    );
  }

  const available = staff.filter((item) => !participants.some((p) => p.userId === item.uid));

  return (
    <Panel
      title={`Participants (${participants.length})`}
      action={<button type="button" onClick={exportCsv} disabled={!participants.length} className="rounded-xl border border-border-subtle px-3 py-2 text-xs font-bold text-ink hover:bg-active disabled:opacity-40">Export CSV</button>}
    >
      {canManage && (
        <div className="mb-5 flex flex-wrap gap-2 rounded-2xl bg-page p-3">
          <select value={addingId} onChange={(e) => setAddingId(e.target.value)} className="flex-1 rounded-xl border border-border-subtle bg-card px-3 py-2 text-xs">
            <option value="">Manually add a participant...</option>
            {available.map((item) => <option key={item.uid} value={item.uid}>{item.displayName || item.email} ({item.role})</option>)}
          </select>
          <button type="button" onClick={addParticipant} disabled={!addingId} className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white disabled:opacity-40">Add</button>
        </div>
      )}
      {error && <p className="mb-3 rounded-xl bg-active px-3 py-2 text-xs text-primary">{error}</p>}
      {loading ? (
        <SkeletonList count={5} />
      ) : participants.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b text-[10px] uppercase tracking-wider text-subtle"><tr>{["Name", "Role", "Contact", "Registered", "Attendance", canManage ? "Actions" : ""].map((label) => <th key={label} className="p-3">{label}</th>)}</tr></thead>
            <tbody>
              {participants.map((p) => (
                <tr key={p.userId} className="border-b border-border-subtle text-xs">
                  <td className="p-3 font-semibold text-ink">{p.displayName || "—"}</td>
                  <td className="p-3 text-muted">{p.role || "—"}</td>
                  <td className="p-3 text-muted">{p.email}{p.phone ? ` · ${p.phone}` : ""}</td>
                  <td className="p-3 text-muted">{p.registeredAt ? new Date(p.registeredAt).toLocaleDateString() : "—"}</td>
                  <td className="p-3"><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${p.attendanceStatus === "present" ? "bg-success-soft text-success" : p.attendanceStatus === "absent" ? "bg-active text-primary" : "bg-page text-muted"}`}>{p.attendanceStatus === "present" ? "Present" : p.attendanceStatus === "absent" ? "Absent" : "Not marked"}</span></td>
                  {canManage && <td className="p-3"><button type="button" onClick={() => remove(p.userId)} className="text-primary hover:underline">Remove</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>No participants registered yet.</Empty>
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
                <b>{p.displayName || p.email}</b>
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
        <>
          {notice && <p className="mb-4 rounded-xl bg-success-soft p-3 text-sm text-success">{notice}</p>}
          <header className="overflow-hidden rounded-3xl border border-[#f3aaaa] bg-[linear-gradient(120deg,#fff0f0_0%,#fff7f7_45%,#ffffff_100%)] shadow-xl">
            {event.bannerUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={event.bannerUrl} alt={event.name} className="h-56 w-full object-cover" />
            )}
            <div className="p-6">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${statusTones[event.computedStatus] || "bg-page text-muted"}`}>{event.computedStatus}</span>
                <span className="font-mono text-[10px] uppercase tracking-widest text-primary">{event.type}</span>
              </div>
              <h1 className="mt-2 text-3xl font-black md:text-5xl">{event.name}</h1>
              <p className="mt-2 max-w-2xl text-sm text-muted">{event.description || "No description available."}</p>
            </div>
          </header>

          <nav className="my-5 flex gap-2 overflow-x-auto rounded-2xl border border-border-subtle bg-card p-1.5 shadow-sm">
            {tabs.map((item) => <button key={item} type="button" onClick={() => setTab(item)} className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-bold ${tab === item ? "bg-primary text-white" : "text-muted hover:bg-active"}`}>{item}</button>)}
          </nav>

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
        </>
      )}
    </div>
  );

  const paddedBody = <div className="-mx-4">{body}</div>;

  if (profile?.role === "Teacher") return <TeacherShell active="Event">{paddedBody}</TeacherShell>;

  if (profile?.role === "Director") {
    const name = profile?.displayName || user?.displayName || user?.email?.split("@")[0] || "Director";
    return (
      <DirectorShell modules={managerModules} active="Event" getHref={() => "/dashboard/director"} name={name} initials={name.slice(0, 2).toUpperCase()} userEmail={user?.email} headerTitle="Events" headerSubtitle="Organization overview" onLogout={logout}>
        {paddedBody}
      </DirectorShell>
    );
  }
  if (profile?.role === "Admin") {
    const name = profile?.displayName || user?.displayName || user?.email?.split("@")[0] || "Member";
    return (
      <AdminShell role="Admin" modules={managerModules} active="Event" getHref={() => "/dashboard/admin"} name={name} initials={name.slice(0, 2).toUpperCase()} userEmail={user?.email} headerTitle="Events" onLogout={logout}>
        {paddedBody}
      </AdminShell>
    );
  }

  return <main className="min-h-screen bg-page text-ink">{body}</main>;
}
