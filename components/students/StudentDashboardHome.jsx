"use client";

import { useEffect, useState } from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  Activity, Award, BookOpen, CalendarClock, CheckCircle2, ChevronRight, CloudOff,
  Flame, GraduationCap, MapPin, RefreshCw, ScrollText, TrendingUp, Wifi,
} from "lucide-react";
import SidebarIcon from "../dashboard/SidebarIcon";
import { ChartCard, EmptyChartState } from "../dashboard/overview/ChartCard";
import { useStudentDashboardData } from "../../lib/student-dashboard-data";
import { SkeletonBar } from "../ui/Skeleton";

// Perceived-speed only — matches the h-70 area the real chart fills once
// data.loading resolves, so there's no layout jump when it swaps in.
function ChartSkeleton() {
  return <div className="h-70 w-full animate-pulse rounded-xl bg-page" />;
}

// Matches one real "Upcoming Schedule" / "Recent Activity" row (an
// icon-in-square, two lines of text).
function FeedRowSkeleton() {
  return (
    <div className="flex items-center gap-4 border-b border-border-subtle py-3 last:border-0">
      <div className="h-11 w-11 shrink-0 animate-pulse rounded-xl bg-page" />
      <div className="min-w-0 flex-1 space-y-2">
        <SkeletonBar className="h-3 w-2/3" />
        <SkeletonBar className="h-2.5 w-1/2" />
      </div>
    </div>
  );
}

const STATUS_COLORS = { present: "#22C55E", late: "#F59E0B", absent: "#FF2D2D" };

function relativeTime(date) {
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 45) return "Just now";
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
  const days = Math.round(seconds / 86400);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return date.toLocaleDateString("en-US", { day: "numeric", month: "short" });
}

function formatDay(value) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-US", { day: "numeric", month: "short" });
}

function useOnlineStatus() {
  // Lazy initializer (not an effect) reads the real browser status at
  // mount; the listeners keep it live. Guarded for SSR, where `navigator`
  // doesn't exist.
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);
  return online;
}

function StatCard({ label, value, sub, icon: Icon, loading, accent = "text-ink" }) {
  return (
    <article className="rounded-2xl border border-border-subtle/70 bg-card p-4 shadow-sm sm:p-5">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-wider text-subtle">{label}</p>
        {Icon && <Icon className="h-4 w-4 text-subtle" aria-hidden="true" />}
      </div>
      {loading ? (
        <div className="mt-3 h-7 w-16 animate-pulse rounded bg-page" />
      ) : (
        <h3 className={`mt-2 text-2xl font-extrabold ${accent}`}>{value}</h3>
      )}
      {!loading && sub && <span className="mt-1 block text-[10px] font-bold text-muted">{sub}</span>}
    </article>
  );
}

export default function StudentDashboardHome({ uid, name, greeting, modules, activeModule, onNavigate }) {
  const online = useOnlineStatus();
  const d = useStudentDashboardData(uid);

  const quickActions = [
    { label: "Continue Learning", module: "My Training", icon: GraduationCap },
    { label: "View Attendance", module: "Attendance", icon: Activity },
    { label: "Achievements", module: "Achievements", icon: Award },
    { label: "QR Attendance", module: "QR Scanner", icon: CalendarClock },
  ].filter((action) => modules.includes(action.module));

  const progressPoints = d.learningProgressTrend.points;
  const hasProgressData = progressPoints.some((p) => p.value != null);
  const attendanceBreakdown = [
    { name: "Present", key: "present", value: d.attendanceStats.present },
    { name: "Late", key: "late", value: d.attendanceStats.late },
    { name: "Absent", key: "absent", value: d.attendanceStats.absent },
  ].filter((row) => row.value > 0);
  const hasWeeklyActivity = d.weeklyActivity.some((day) => day.count > 0);

  return (
    <div className="space-y-6">
      {/* Welcome + sync status */}
      <section className="flex flex-col gap-4 rounded-2xl border border-[#f3aaaa] bg-[linear-gradient(120deg,#fff0f0_0%,#fff7f7_45%,#ffffff_100%)] p-4 text-ink shadow-sm md:flex-row md:items-center md:justify-between md:p-5">
        <div>
          <h2 className="text-lg font-extrabold md:text-xl">Welcome, {name}</h2>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted">{greeting}</p>
        </div>
        <div className="flex items-center gap-2 self-start rounded-full border border-border-subtle bg-card px-3 py-1.5 text-[11px] font-bold shadow-sm">
          {online ? (
            <>
              <Wifi className="h-3.5 w-3.5 text-success" aria-hidden="true" />
              <span className="text-success">Online</span>
            </>
          ) : (
            <>
              <CloudOff className="h-3.5 w-3.5 text-warning" aria-hidden="true" />
              <span className="text-warning">Offline mode</span>
            </>
          )}
          {d.lastSyncedAt && (
            <span className="flex items-center gap-1 border-l border-border-subtle pl-2 text-muted">
              <RefreshCw className="h-3 w-3" aria-hidden="true" />
              synced {relativeTime(new Date(d.lastSyncedAt))}
            </span>
          )}
        </div>
      </section>

      {/* Top statistics */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Active Courses" value={d.activeCourses} sub={d.courseStatusSummary.completed ? `${d.courseStatusSummary.completed} completed` : "enrolled"} icon={BookOpen} loading={d.loading} />
        <StatCard label="Due This Week" value={d.dueThisWeek} sub="no deadline data yet" icon={CalendarClock} loading={d.loading} />
        <StatCard label="Learning Streak" value={d.learningStreak} sub={d.learningStreak === 1 ? "day" : "days"} icon={Flame} loading={d.loading} accent="text-primary" />
        <StatCard label="Achievements" value={d.achievementCount} sub="earned" icon={Award} loading={d.loading} />
        <StatCard
          label="Attendance"
          value={d.attendanceStats.percent != null ? `${d.attendanceStats.percent}%` : "—"}
          sub={d.attendanceStats.total ? `${d.attendanceStats.present + d.attendanceStats.late} / ${d.attendanceStats.total} sessions` : "no records yet"}
          icon={CheckCircle2}
          loading={d.loading}
          accent="text-success"
        />
      </section>

      {/* Learning progress + weekly activity */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard title="Learning Progress" subtitle={d.learningProgressTrend.metric === "score" ? "Your average assessment score over the last 14 days" : "Your attendance rate over the last 14 days"} icon={TrendingUp}>
          {d.loading ? (
            <ChartSkeleton />
          ) : hasProgressData ? (
            <div className="h-70 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={progressPoints} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="studentProgressFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#E53935" stopOpacity={0.18} />
                      <stop offset="100%" stopColor="#E53935" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                  <XAxis dataKey="date" tickFormatter={formatDay} tick={{ fontSize: 10, fill: "#667085" }} interval="preserveStartEnd" />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#667085" }} tickFormatter={(v) => `${v}%`} />
                  <Tooltip formatter={(value) => [`${value}%`, d.learningProgressTrend.metric === "score" ? "Avg score" : "Attendance"]} labelFormatter={formatDay} contentStyle={{ borderRadius: 12, border: "1px solid #e7e5e4", fontSize: 12 }} />
                  <Area type="natural" dataKey="value" connectNulls stroke="#E53935" strokeWidth={3} fill="url(#studentProgressFill)" dot={{ r: 3, fill: "#E53935", strokeWidth: 2, stroke: "#fff" }} activeDot={{ r: 5 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyChartState message="No learning activity yet." />
          )}
        </ChartCard>

        <ChartCard title="Weekly Learning Activity" subtitle="Classes attended this week" icon={Activity}>
          {d.loading ? (
            <ChartSkeleton />
          ) : hasWeeklyActivity ? (
            <div className="h-70 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={d.weeklyActivity} margin={{ top: 8, right: 16, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#667085" }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#667085" }} />
                  <Tooltip formatter={(value) => [value, "Classes"]} contentStyle={{ borderRadius: 12, border: "1px solid #e7e5e4", fontSize: 12 }} />
                  <Bar dataKey="count" fill="#E53935" radius={[6, 6, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyChartState message="No activity this week yet." />
          )}
        </ChartCard>
      </div>

      {/* Course progress + attendance overview */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard title="Course Progress" subtitle="Your average score per enrolled training" icon={BookOpen}>
          {d.loading ? (
            <ChartSkeleton />
          ) : !d.courseProgress.length ? (
            <EmptyChartState message="No active courses." />
          ) : (
            <div className="space-y-3 py-2">
              {d.courseProgress.map((course) => (
                <div key={course.courseId} className="text-xs">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="truncate font-semibold text-ink">{course.courseTitle}</span>
                    <span className="shrink-0 font-bold text-muted">{course.progress != null ? `${course.progress}%` : "No data"}</span>
                  </div>
                  <span className="block h-2.5 overflow-hidden rounded-full bg-page">
                    <span className="block h-full rounded-full bg-primary" style={{ width: `${course.progress ?? 0}%` }} />
                  </span>
                </div>
              ))}
            </div>
          )}
        </ChartCard>

        <ChartCard title="Attendance Overview" subtitle="Present, Late and Absent — real records" icon={CheckCircle2}>
          {d.loading ? (
            <ChartSkeleton />
          ) : attendanceBreakdown.length ? (
            <div className="h-70 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={attendanceBreakdown} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="80%" paddingAngle={2}>
                    {attendanceBreakdown.map((entry) => (
                      <Cell key={entry.key} fill={STATUS_COLORS[entry.key]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value, nm) => [value, nm]} contentStyle={{ borderRadius: 12, border: "1px solid #e7e5e4", fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyChartState message="No attendance data available." />
          )}
        </ChartCard>
      </div>

      {/* Course status summary + quick actions */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.4fr]">
        <section className="rounded-xl border border-border-subtle bg-card p-5 shadow-sm">
          <h3 className="mb-4 text-sm font-bold text-ink">Courses</h3>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              ["Active", d.courseStatusSummary.active, "text-success"],
              ["Completed", d.courseStatusSummary.completed, "text-primary"],
              ["Not Started", d.courseStatusSummary.notStarted, "text-muted"],
            ].map(([label, value, tone]) => (
              <div key={label} className="rounded-xl bg-page p-3">
                {d.loading ? <SkeletonBar className="mx-auto h-6 w-10" /> : <p className={`text-xl font-extrabold ${tone}`}>{value}</p>}
                <p className="text-[10px] font-bold uppercase tracking-wider text-subtle">{label}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-border-subtle bg-card p-5 shadow-sm">
          <h3 className="mb-4 text-sm font-bold text-ink">Quick Actions</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {quickActions.map((action) => (
              <button
                key={action.label}
                type="button"
                onClick={() => onNavigate(action.module)}
                className="flex flex-col items-center gap-2 rounded-xl border border-border-subtle bg-page/50 p-3 text-center transition hover:border-red-line hover:bg-active/50"
              >
                <action.icon className="h-5 w-5 text-primary" aria-hidden="true" />
                <span className="text-[11px] font-bold text-muted">{action.label}</span>
              </button>
            ))}
          </div>
        </section>
      </div>

      {/* Latest achievement + certificate */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <HighlightCard
          title="Latest Achievement"
          icon={Award}
          empty="No achievements earned yet"
          loading={d.loading}
          item={d.latestAchievement}
          onView={() => onNavigate("Achievements")}
          renderItem={(item) => (
            <>
              <b className="block text-sm text-ink">{item.title}</b>
              {item.description && <p className="mt-1 text-xs text-muted">{item.description}</p>}
              {item.awardedAt?.toDate && <p className="mt-2 text-[11px] font-bold text-subtle">{item.awardedAt.toDate().toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })}</p>}
            </>
          )}
        />
        <HighlightCard
          title="Latest Certificate"
          icon={ScrollText}
          empty="No certificates earned yet"
          loading={d.loading}
          item={d.latestCertificate}
          onView={() => onNavigate("Certificates")}
          renderItem={(item) => (
            <>
              <b className="block text-sm text-ink">{item.title || item.metadata?.courseName || "Certificate"}</b>
              <p className="mt-1 font-mono text-[11px] text-subtle">{item.certificateCode || item.id}</p>
              {(item.issueDate?.toDate || item.createdAt?.toDate) && (
                <p className="mt-2 text-[11px] font-bold text-subtle">
                  Issued {(item.issueDate?.toDate?.() || item.createdAt?.toDate?.()).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })}
                </p>
              )}
            </>
          )}
        />
      </div>

      {/* Workspace modules */}
      <section className="rounded-3xl border border-border-subtle/70 bg-card p-5 shadow-sm md:p-6">
        <div className="mb-5">
          <h2 className="font-bold text-ink">Workspace</h2>
          <p className="mt-1 text-xs text-muted">Everything available for your student account.</p>
        </div>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5">
          {modules.map((module) => (
            <button
              key={module}
              type="button"
              onClick={() => onNavigate(module)}
              className={`group flex flex-col items-center gap-2 rounded-2xl border p-4 text-center transition ${
                activeModule === module ? "border-primary bg-active" : "border-border-subtle bg-page/50 hover:border-red-line hover:bg-active/50"
              }`}
            >
              <span className={`grid h-11 w-11 place-items-center rounded-xl bg-card shadow-sm transition group-hover:bg-primary group-hover:text-white ${activeModule === module ? "bg-primary text-white" : "text-muted"}`}>
                <SidebarIcon name={module} className="h-6 w-6" />
              </span>
              <span className="text-[11px] font-bold text-muted">{module}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Upcoming schedule + recent activity */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-3xl border border-border-subtle/70 bg-card p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-bold text-ink">Upcoming Schedule</h2>
            <button type="button" onClick={() => onNavigate("Events")} className="flex items-center gap-1 text-xs font-bold text-primary">
              View all <ChevronRight className="h-3 w-3" aria-hidden="true" />
            </button>
          </div>
          {d.loading ? (
            <div>{Array.from({ length: 3 }).map((_, i) => <FeedRowSkeleton key={i} />)}</div>
          ) : !d.upcomingEvents.length ? (
            <p className="py-8 text-center text-sm text-muted">No upcoming events.</p>
          ) : (
            <div className="space-y-3">
              {d.upcomingEvents.slice(0, 5).map((event) => {
                const dateObj = new Date(`${event.date}T00:00:00`);
                return (
                  <div key={event.id} className="flex items-center gap-4 border-b border-border-subtle py-3 last:border-0">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-active text-center text-primary">
                      <b className="block text-lg">{Number.isNaN(dateObj.getTime()) ? "—" : dateObj.getDate()}</b>
                    </span>
                    <div className="min-w-0">
                      <b className="block truncate text-xs text-ink">{event.courseTitle} — {event.title}</b>
                      <span className="flex flex-wrap items-center gap-2 text-[10px] text-muted">
                        <span>{formatDay(event.date)}{event.startTime ? ` · ${event.startTime}` : ""}</span>
                        {event.location && <span className="flex items-center gap-0.5"><MapPin className="h-2.5 w-2.5" aria-hidden="true" />{event.location}</span>}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-border-subtle/70 bg-card p-6 shadow-sm">
          <h2 className="mb-4 font-bold text-ink">Recent Activity</h2>
          {d.loading ? (
            <div>{Array.from({ length: 3 }).map((_, i) => <FeedRowSkeleton key={i} />)}</div>
          ) : !d.recentActivity.length ? (
            <p className="py-8 text-center text-sm text-muted">No recent activity.</p>
          ) : (
            <div className="space-y-3">
              {d.recentActivity.map((item) => (
                <div key={item.id} className="flex items-start gap-3 border-b border-border-subtle py-2.5 last:border-0">
                  <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-active text-primary">
                    {item.type === "achievement" ? <Award className="h-3.5 w-3.5" aria-hidden="true" />
                      : item.type === "certificate" ? <ScrollText className="h-3.5 w-3.5" aria-hidden="true" />
                      : item.type === "enrolled" ? <GraduationCap className="h-3.5 w-3.5" aria-hidden="true" />
                      : <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-ink">{item.label}</p>
                    <p className="text-[10px] text-subtle">{relativeTime(item.at)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function HighlightCard({ title, icon: Icon, empty, loading, item, onView, renderItem }) {
  return (
    <section className="rounded-3xl border border-border-subtle/70 bg-card p-6 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-bold text-ink">
          <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
          {title}
        </h3>
        <button type="button" onClick={onView} className="flex items-center gap-1 text-xs font-bold text-primary">
          View <ChevronRight className="h-3 w-3" aria-hidden="true" />
        </button>
      </div>
      {loading ? (
        <div className="h-16 animate-pulse rounded-xl bg-page" />
      ) : item ? (
        <div className="rounded-xl border border-border-subtle p-4">{renderItem(item)}</div>
      ) : (
        <p className="py-4 text-sm text-muted">{empty}</p>
      )}
    </section>
  );
}
