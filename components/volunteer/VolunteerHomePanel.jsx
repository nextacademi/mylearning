"use client";

import { useEffect, useState } from "react";
import { Award, CalendarCheck, Clock, HeartHandshake, Phone, Sparkles, Trophy } from "lucide-react";
import { loadMyVolunteerSummary } from "../../lib/services/volunteer-dashboard-service";
import { SkeletonList } from "../ui/Skeleton";

// "Volunteer Home Panel" — one member's own impact: hours (volunteer,
// event, training), events, certificates, a 6-month activity chart and an
// achievement wall. Used as the Volunteer role's Dashboard and as
// Director/Admin's Volunteer → My Panel. Data: /api/volunteer-dashboard.

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}


function ActivityChart({ months }) {
  const max = Math.max(1, ...months.map((m) => m.events + m.trainings));
  return (
    <div className="mt-4 flex h-44 items-end gap-3">
      {months.map((m) => {
        const total = m.events + m.trainings;
        return (
          <div key={m.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <span className="text-[10px] font-semibold text-muted">{total ? Math.round(total * 10) / 10 : "—"}</span>
            <div className="flex w-full max-w-10 flex-col-reverse overflow-hidden rounded-md bg-page" style={{ height: "100%" }}>
              <div className="bg-teal" style={{ height: `${(m.trainings / max) * 100}%` }} title={`${m.trainings}h training`} />
              <div className="bg-primary" style={{ height: `${(m.events / max) * 100}%` }} title={`${m.events}h events`} />
            </div>
            <span className="text-[10px] font-bold text-subtle">{m.label}</span>
          </div>
        );
      })}
    </div>
  );
}

const ROLE_TONE = {
  Volunteer: "bg-active text-primary",
  Teacher: "bg-purple-soft text-purple",
  Learner: "bg-teal-soft text-teal",
  Participant: "bg-info-soft text-info",
};
const STATUS_TONE = { Completed: "text-success", Upcoming: "text-info", Absent: "text-primary", Excused: "text-muted" };
const r1 = (n) => Math.round(n * 10) / 10;

// "My Contribution" — every event and training this person took part in
// (name, date, location, role, hours), with a compact summary on top that is
// worked out from the very same rows, so the two can never disagree.
function MyContribution({ rows, certificates }) {
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("All");
  const done = rows.filter((r) => r.status === "Completed");
  const hoursAs = (name) => r1(done.filter((r) => r.role === name).reduce((s, r) => s + r.hours, 0));
  const totalHours = r1(done.reduce((s, r) => s + r.hours, 0));
  const programmes = new Set(done.map((r) => `${r.type}:${r.name}`)).size;
  const summary = [
    [totalHours, "Total hours", Clock],
    [hoursAs("Volunteer"), "Volunteer hours", HeartHandshake],
    [hoursAs("Teacher"), "Teaching hours", Sparkles],
    [hoursAs("Learner"), "Learning hours", CalendarCheck],
    [r1(hoursAs("Participant")), "Event hours", CalendarCheck],
    [done.filter((r) => r.type !== "Training").length, "Events completed", Trophy],
    [programmes, "Programmes", Trophy],
    [certificates, "Certificates", Award],
  ];
  const roles = ["All", ...new Set(rows.map((r) => r.role))];
  const q = search.trim().toLowerCase();
  const shown = rows.filter((r) => (role === "All" || r.role === role) && (!q || [r.name, r.location, r.type].some((v) => String(v || "").toLowerCase().includes(q))));

  return (
    <section className="rounded-2xl border border-[#f3aaaa] bg-[linear-gradient(160deg,#fff7f7_0%,#ffffff_60%)] p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-black text-ink">My Contribution</h3>
          <p className="text-xs text-muted">Every event and training you&apos;ve taken part in — your role and the hours you contributed.</p>
        </div>
        <span className="rounded-full bg-active px-3 py-1 text-sm font-black text-primary">{totalHours} hrs</span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
        {summary.map(([value, label, Icon]) => (
          <div key={label} className="rounded-xl border border-border-subtle bg-card px-3 py-2.5 text-center">
            <p className="text-xl font-black text-primary">{value}</p>
            <p className="mt-0.5 flex items-center justify-center gap-1 text-[10px] font-bold text-muted"><Icon className="h-3 w-3" aria-hidden="true" /> {label}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search programme or location…" className="min-w-[200px] flex-1 rounded-xl border border-border-subtle bg-card px-3 py-2 text-sm" />
        <select value={role} onChange={(e) => setRole(e.target.value)} className="rounded-xl border border-border-subtle bg-card px-3 py-2 text-xs font-semibold">
          {roles.map((item) => <option key={item} value={item}>{item === "All" ? "All roles" : item}</option>)}
        </select>
      </div>

      <div className="mt-3 overflow-x-auto rounded-xl border border-border-subtle bg-card">
        <table className="w-full min-w-[720px] text-left text-xs">
          <thead className="bg-page text-[10px] font-black uppercase tracking-wider text-muted">
            <tr>{["Programme", "Date", "Location", "Role", "Hours", "Status"].map((h) => <th key={h} className={`px-4 py-3 ${h === "Hours" ? "text-right" : ""}`}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {shown.length ? shown.map((r) => (
              <tr key={r.id} className="border-t border-border-subtle">
                <td className="px-4 py-3">
                  <b className="block text-ink">{r.name}</b>
                  <span className="text-[10px] uppercase tracking-wide text-subtle">{r.type}</span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-muted">{formatDate(r.date)}</td>
                <td className="px-4 py-3 text-muted">{r.location || "—"}</td>
                <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${ROLE_TONE[r.role] || "bg-page text-muted"}`}>{r.role}</span></td>
                <td className="px-4 py-3 text-right font-bold text-ink">{r.status === "Completed" ? `${r.hours}h` : "—"}</td>
                <td className={`px-4 py-3 font-semibold ${STATUS_TONE[r.status] || "text-muted"}`}>{r.status}</td>
              </tr>
            )) : (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-muted">{rows.length ? "Nothing matches your search." : "No contributions yet — they appear here as you're checked in to events and trainings."}</td></tr>
            )}
          </tbody>
          {shown.length > 0 && (
            <tfoot>
              <tr className="border-t border-border-subtle bg-page font-bold">
                <td className="px-4 py-3 text-ink" colSpan={4}>{shown.length} record{shown.length === 1 ? "" : "s"}</td>
                <td className="px-4 py-3 text-right text-primary">{r1(shown.filter((r) => r.status === "Completed").reduce((s, r) => s + r.hours, 0))}h</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
}

export default function VolunteerHomePanel() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    loadMyVolunteerSummary()
      .then((result) => { if (!cancelled) setData(result); })
      .catch((err) => { if (!cancelled) setError(err.message || "Unable to load your panel."); });
    return () => { cancelled = true; };
  }, []);

  if (error) return <p className="rounded-2xl bg-active p-4 text-sm text-primary">{error}</p>;
  if (!data) return <SkeletonList count={6} />;
  const { profile } = data;
  const firstName = (profile.displayName || "there").split(" ")[0];

  return (
    <div className="space-y-5">
      <section className="grid gap-4 lg:grid-cols-[1fr_auto]">
        <div className="flex items-center gap-4 rounded-2xl border border-[#f3aaaa] bg-[linear-gradient(120deg,#fff0f0_0%,#fff7f7_45%,#ffffff_100%)] p-5 shadow-sm">
          {profile.photoURL ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.photoURL} alt="" className="h-16 w-16 shrink-0 rounded-full border-2 border-primary object-cover" />
          ) : (
            <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full border-2 border-primary bg-active text-lg font-black text-primary">{firstName.slice(0, 2).toUpperCase()}</span>
          )}
          <div className="min-w-0">
            <h2 className="text-xl font-black text-ink">👋 Welcome, <span className="text-primary">{firstName}!</span></h2>
            <p className="mt-1 truncate text-xs text-muted"><b className="text-ink">{profile.role || "Member"}</b> · {profile.email}</p>
            <p className="mt-1 text-xs text-muted">Keep learning, keep growing — your journey matters!</p>
          </div>
        </div>
        <div className="rounded-2xl border border-border-subtle bg-card px-8 py-5 text-center shadow-sm">
          <p className="flex items-center justify-center gap-1 text-[10px] font-bold uppercase tracking-wider text-warning"><Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Impact Score</p>
          <p className="mt-1 text-4xl font-black text-primary">{data.impactScore}</p>
          <p className="mt-1 text-[10px] text-muted">{data.totalHours} hours · {data.eventsAttended} events completed</p>
        </div>
      </section>


      <section className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <div className="rounded-2xl border border-border-subtle bg-card p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-bold text-ink">Your Activity</h3>
              <p className="text-xs text-muted">Hours credited over the last 6 months</p>
            </div>
            <span className="rounded-full bg-active px-3 py-1 text-sm font-black text-primary">{data.activityTotal} hrs</span>
          </div>
          <p className="mt-2 flex gap-3 text-[10px] font-bold text-muted">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-primary" /> Events</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-teal" /> Trainings</span>
          </p>
          <ActivityChart months={data.activity} />
        </div>
        <div className="rounded-2xl border border-border-subtle bg-card p-5 shadow-sm">
          <h3 className="font-bold text-ink">Quick Info</h3>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            {[
              ["Member since", formatDate(profile.memberSince)],
              ["Phone", profile.phone || "—"],
              ["Certificates", `${data.certificates} earned`],
              ["Upcoming", `${data.upcomingEvents} programme${data.upcomingEvents === 1 ? "" : "s"}`],
              ["Missing event", `${data.missedEvents} missed`],
              ["Missing training", `${data.missedTrainings} missed`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-page p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-subtle">{label === "Phone" ? <Phone className="mr-1 inline h-3 w-3" aria-hidden="true" /> : null}{label}</p>
                <p className="mt-0.5 font-semibold text-ink">{value}</p>
              </div>
            ))}
          </div>
          {data.recentEvents.length > 0 && (
            <div className="mt-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-subtle">Recent events</p>
              <ul className="mt-1 divide-y divide-border-subtle text-xs">
                {data.recentEvents.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-2 py-1.5">
                    <span className="min-w-0 truncate text-ink">{e.name}</span>
                    <span className="shrink-0 text-muted">{e.role} · {e.hours}h</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-4 rounded-2xl border border-[#f3aaaa] bg-[linear-gradient(120deg,#fff0f0_0%,#fff7f7_45%,#ffffff_100%)] p-5 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="flex items-center gap-1.5 font-black text-ink"><Trophy className="h-5 w-5 text-warning" aria-hidden="true" /> Your Achievement Wall</h3>
          <p className="mt-1 max-w-xl text-xs text-muted">Every certificate is proof of your dedication — keep going, your next milestone is closer than you think!</p>
        </div>
        <div className="flex gap-2">
          {[[data.certificates, "Total earned"], [data.eventsAttended, "Events"], [Math.round(data.trainingHours), "Training hrs"]].map(([value, label]) => (
            <div key={label} className="min-w-24 rounded-xl border border-border-subtle bg-card px-4 py-3 text-center">
              <p className="text-lg font-black text-primary">{value}</p>
              <p className="text-[9px] font-bold uppercase tracking-wider text-muted">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Detailed list last: summary + every programme, at the bottom of the panel. */}
      <MyContribution rows={data.contributions || []} certificates={data.certificates} />
    </div>
  );
}
