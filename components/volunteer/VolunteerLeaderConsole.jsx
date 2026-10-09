"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Award, BookOpen, CalendarDays, ChevronRight, Clock, GraduationCap, HeartHandshake, LineChart, RefreshCw, UserCheck, Users,
} from "lucide-react";
import { loadVolunteerOrgSummary } from "../../lib/services/volunteer-dashboard-service";
import { SkeletonList } from "../ui/Skeleton";

// Director/Admin "leader console" — the organisation's volunteer & learning
// impact at a glance: snapshot KPIs, people, hours, programmes, a 6-month
// trend, priority actions and derived insights. Data: /api/volunteer-dashboard?scope=org.

const TONES = {
  red: "bg-active text-primary",
  blue: "bg-info-soft text-info",
  teal: "bg-teal-soft text-teal",
  orange: "bg-warning-soft text-warning",
  purple: "bg-purple-soft text-purple",
};

function Kpi({ value, label, note, Icon, tone = "red" }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-border-subtle bg-card p-4 shadow-sm">
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${TONES[tone]}`}><Icon className="h-4 w-4" aria-hidden="true" /></span>
      <div className="min-w-0">
        <p className={`text-2xl font-black ${tone === "red" ? "text-primary" : tone === "orange" ? "text-warning" : "text-ink"}`}>{value}</p>
        <p className="text-xs font-bold text-ink">{label}</p>
        <p className="text-[10px] text-muted">{note}</p>
      </div>
    </div>
  );
}

function Section({ title, subtitle, children }) {
  return (
    <section>
      <h3 className="text-sm font-bold text-ink">{title}</h3>
      {subtitle && <p className="text-[11px] text-muted">{subtitle}</p>}
      <div className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{children}</div>
    </section>
  );
}

function TrendChart({ trend }) {
  const max = Math.max(1, ...trend.map((m) => m.events + m.trainings + m.certificates));
  return (
    <div className="mt-4 flex h-48 items-end gap-4">
      {trend.map((m) => {
        const total = m.events + m.trainings + m.certificates;
        return (
          <div key={m.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <span className="text-[10px] font-semibold text-muted">{total || "—"}</span>
            <div className="flex w-full max-w-12 flex-col-reverse overflow-hidden rounded-md bg-page" style={{ height: "100%" }}>
              <div className="bg-primary" style={{ height: `${(m.events / max) * 100}%` }} title={`${m.events} events`} />
              <div className="bg-teal" style={{ height: `${(m.trainings / max) * 100}%` }} title={`${m.trainings} trainings`} />
              <div className="bg-warning" style={{ height: `${(m.certificates / max) * 100}%` }} title={`${m.certificates} certificates`} />
            </div>
            <span className="text-[10px] font-bold text-subtle">{m.label}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function VolunteerLeaderConsole({ name, onNavigate }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback((fresh = false) => {
    setLoading(true);
    return loadVolunteerOrgSummary({ fresh })
      .then((result) => { setData(result); setError(""); })
      .catch((err) => setError(err.message || "Unable to load the leader console."))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { void Promise.resolve().then(() => load()); }, [load]);

  if (error && !data) return <p className="rounded-2xl bg-active p-4 text-sm text-primary">{error}</p>;
  if (!data) return <SkeletonList count={8} />;
  const { snapshot, people, hours, programmes, insights } = data;
  const go = (module) => onNavigate?.(module);

  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-[#f3aaaa] bg-[linear-gradient(120deg,#fff0f0_0%,#fff7f7_45%,#ffffff_100%)] p-5 shadow-sm">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-primary">Leader console</p>
          <h2 className="mt-1 text-xl font-black text-ink">Welcome, <span className="text-primary">{name || "Leader"}</span></h2>
          <p className="mt-1 max-w-xl text-xs text-muted">Your volunteer organisation at a glance — track people, programmes, and impact from one place.</p>
          <p className="mt-2 flex flex-wrap gap-2 text-[10px] font-bold">
            <span className="rounded-full bg-success-soft px-2 py-1 text-success">● Live dashboard</span>
            <span className="rounded-full bg-card px-2 py-1 text-muted">Updated {new Date(data.generatedAt).toLocaleString()}</span>
          </p>
        </div>
        <button type="button" onClick={() => load(true)} disabled={loading} className="inline-flex items-center gap-1.5 rounded-xl border border-border-subtle bg-card px-3 py-2 text-xs font-bold text-ink hover:bg-page disabled:opacity-50">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden="true" /> Refresh
        </button>
      </section>

      <div className="grid gap-5 xl:grid-cols-[1fr_280px]">
        <div className="space-y-5">
          <Section title="Impact snapshot">
            <Kpi value={snapshot.activeVolunteers} label="Active volunteers" note="Approved members serving" Icon={HeartHandshake} />
            <Kpi value={snapshot.openEvents} label="Open events" note="Upcoming, published events" Icon={CalendarDays} tone="blue" />
            <Kpi value={snapshot.trainings} label="Trainings" note="Skill-building programmes" Icon={BookOpen} tone="teal" />
            <Kpi value={snapshot.certificates} label="Certificates" note="Recognition issued" Icon={Award} tone="orange" />
            <Kpi value={snapshot.hoursContributed} label="Hours contributed" note="Volunteer + event hours" Icon={Clock} tone="purple" />
            <Kpi value={snapshot.pendingApprovals} label="New user approvals" note="Awaiting your review" Icon={UserCheck} tone="orange" />
          </Section>

          <Section title="People" subtitle="Students and volunteers in your organisation">
            <Kpi value={people.students} label="Total students" note="Members on the student roster" Icon={GraduationCap} tone="teal" />
            <Kpi value={people.volunteers} label="Total volunteers" note="All volunteer-role members" Icon={Users} />
            <Kpi value={people.activeVolunteers} label="Active volunteers" note="Volunteers not marked inactive" Icon={HeartHandshake} tone="blue" />
          </Section>

          <Section title="Hours & recognition" subtitle="Learning, volunteering and certificates">
            <Kpi value={hours.trainingHours} label="Total training hours" note="Student class time (QR check-in/out)" Icon={BookOpen} tone="purple" />
            <Kpi value={hours.volunteerHours} label="Total volunteer hours" note="Hours credited as Volunteer at events" Icon={HeartHandshake} tone="orange" />
            <Kpi value={hours.certificates} label="Total certificates issued" note="Recognition awarded to members" Icon={Award} tone="orange" />
          </Section>

          <Section title="Programmes" subtitle="Events and trainings delivered">
            <Kpi value={programmes.trainings} label="Total trainings" note="Active and past trainings" Icon={BookOpen} tone="teal" />
            <Kpi value={programmes.events} label="Total events" note="Volunteer programmes and community events" Icon={CalendarDays} tone="blue" />
          </Section>

          <section className="rounded-2xl border border-border-subtle bg-card p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-ink">Programme activity trend</h3>
                <p className="text-[11px] text-muted">Stacked monthly view — events, trainings and certificates</p>
              </div>
              <p className="flex gap-3 text-[10px] font-bold text-muted">
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-primary" /> Events</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-teal" /> Trainings</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-warning" /> Certificates</span>
              </p>
            </div>
            <TrendChart trend={data.trend} />
          </section>

          {data.topVolunteers.length > 0 && (
            <section className="rounded-2xl border border-border-subtle bg-card p-5 shadow-sm">
              <h3 className="text-sm font-bold text-ink">Top contributors</h3>
              <ul className="mt-3 divide-y divide-border-subtle">
                {data.topVolunteers.map((v) => (
                  <li key={v.id} className="flex items-center gap-3 py-2 text-xs">
                    {v.photoURL ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={v.photoURL} alt="" className="h-8 w-8 rounded-full object-cover" />
                    ) : (
                      <span className="grid h-8 w-8 place-items-center rounded-full bg-active text-[10px] font-bold text-primary">{v.name.slice(0, 2).toUpperCase()}</span>
                    )}
                    <span className="min-w-0 flex-1 truncate font-semibold text-ink">{v.name} <span className="font-normal text-muted">· {v.role}</span></span>
                    <span className="rounded-full border border-red-line px-2 py-0.5 text-[10px] font-bold text-muted">{v.volunteerHours} VOL H</span>
                    <span className="rounded-full border border-red-line px-2 py-0.5 text-[10px] font-bold text-muted">{v.eventHours} EVENT H</span>
                    <span className="hidden rounded-full border border-red-line px-2 py-0.5 text-[10px] font-bold text-muted sm:inline">{v.eventsAttended} EVENTS</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-border-subtle bg-card p-4 shadow-sm">
            <h3 className="text-sm font-bold text-ink">Priority actions</h3>
            <p className="text-[11px] text-muted">Common leader tasks</p>
            <div className="mt-2 space-y-2">
              {[
                ["Pending approvals", `${snapshot.pendingApprovals} member${snapshot.pendingApprovals === 1 ? "" : "s"} waiting to be activated`, "User"],
                ["Events & walk-ins", "Check people in and credit their hours", "Event"],
                ["Scan QR Code", "Check students or teachers in to a class", "Scan QR Code"],
              ].map(([title, note, module]) => (
                <button key={title} type="button" onClick={() => go(module)} className="flex w-full items-center gap-2 rounded-xl border border-border-subtle p-3 text-left hover:bg-page">
                  <span className="min-w-0 flex-1">
                    <b className="block text-xs text-ink">{title}</b>
                    <span className="block text-[10px] text-muted">{note}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-subtle" aria-hidden="true" />
                </button>
              ))}
            </div>
          </section>
          <section className="rounded-2xl border border-border-subtle bg-card p-4 shadow-sm">
            <h3 className="flex items-center gap-1.5 text-sm font-bold text-ink"><LineChart className="h-4 w-4 text-primary" aria-hidden="true" /> Impact insights</h3>
            <p className="text-[11px] text-muted">Derived from current data</p>
            <div className="mt-2 space-y-2">
              {[
                [insights.avgLearningHoursPerStudent, "Avg learning hrs / student", "Training hours per student"],
                [insights.avgVolunteerHoursPerVolunteer, "Avg volunteer hrs / volunteer", "Service time per volunteer"],
                [`${insights.activeVolunteerRate}%`, "Active volunteer rate", `${people.activeVolunteers} of ${people.volunteers} active`],
                [insights.totalProgrammes, "Total programmes", "Events + trainings combined"],
                [insights.peakMonth, "Peak activity month", "Last 6 months"],
              ].map(([value, label, note]) => (
                <div key={label} className="rounded-xl border border-border-subtle p-3">
                  <p className="text-base font-black text-primary">{value}</p>
                  <p className="text-[11px] font-bold text-ink">{label}</p>
                  <p className="text-[10px] text-muted">{note}</p>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
