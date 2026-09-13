"use client";

import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CalendarCheck, PieChart as PieChartIcon, TrendingUp } from "lucide-react";
import { useAuth } from "../../lib/auth-context";
import { subscribeMyAttendance, subscribeMyEnrollments } from "../../lib/student-data";
import { attendanceSummary } from "../../lib/attendance";
import { ChartCard, EmptyChartState } from "../dashboard/overview/ChartCard";

// Real data only, throughout this file — every number and every chart
// series below is derived from `attendance` records this student actually
// has (see lib/student-data.js's subscribeMyAttendance), the exact same
// collection Teacher's QR check-in/out and manual marking already write
// to. There is no mock data, no second attendance store, and no hardcoded
// percentage anywhere in this component.

const STATUS_COLORS = { present: "#22C55E", late: "#F59E0B", absent: "#FF2D2D", excused: "#98A2B3" };
const STATUS_LABELS = { present: "Present", late: "Late", absent: "Absent", excused: "Excused" };
const DATE_RANGES = [
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
  { key: "all", label: "This Term" },
  { key: "custom", label: "Custom Range" },
];
const TREND_PERIODS = [
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
];
const PAGE_SIZE = 10;

function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day + 6) % 7; // Monday-start week
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}
function toDateKey(date) {
  return date.toISOString().slice(0, 10);
}
function weekKey(dateKey) {
  return toDateKey(startOfWeek(new Date(`${dateKey}T00:00:00`)));
}
function monthKey(dateKey) {
  return dateKey.slice(0, 7);
}
function formatTime(timestamp) {
  const date = timestamp?.toDate?.();
  if (!date) return null;
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
function formatDuration(minutes) {
  if (minutes == null) return null;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return hours ? `${hours}h ${remaining}m` : `${remaining}m`;
}

export default function StudentAttendance() {
  const { user } = useAuth();
  const [records, setRecords] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [courseFilter, setCourseFilter] = useState("all");
  const [dateRange, setDateRange] = useState("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [trendPeriod, setTrendPeriod] = useState("monthly");
  const [visibleRows, setVisibleRows] = useState(PAGE_SIZE);

  useEffect(() => {
    if (!user?.uid) return undefined;
    const unsubAttendance = subscribeMyAttendance(
      user.uid,
      (rows) => {
        setRecords(rows);
        setLoading(false);
      },
      () => {
        setError("Unable to load your attendance records.");
        setLoading(false);
      },
    );
    const unsubEnrollments = subscribeMyEnrollments(user.uid, setEnrollments, () => {});
    return () => {
      unsubAttendance();
      unsubEnrollments();
    };
  }, [user?.uid]);

  const trainingOptions = useMemo(() => {
    const seen = new Map();
    enrollments.forEach((item) => seen.set(item.courseId, item.courseTitle));
    // Attendance can reference a course the current enrollment list doesn't
    // (e.g. a since-withdrawn enrollment) — include it too so no real
    // record is ever silently hidden from the filter.
    records.forEach((item) => {
      if (item.courseId && !seen.has(item.courseId)) seen.set(item.courseId, item.courseTitle);
    });
    return [...seen.entries()].map(([id, title]) => ({ id, title }));
  }, [enrollments, records]);

  const dateFiltered = useMemo(() => {
    if (dateRange === "all") return records;
    const now = new Date();
    if (dateRange === "week") {
      const start = toDateKey(startOfWeek(now));
      return records.filter((item) => item.date >= start);
    }
    if (dateRange === "month") {
      const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      return records.filter((item) => item.date >= start);
    }
    if (dateRange === "custom" && customStart && customEnd) {
      return records.filter((item) => item.date >= customStart && item.date <= customEnd);
    }
    return records;
  }, [records, dateRange, customStart, customEnd]);

  const filtered = useMemo(
    () => (courseFilter === "all" ? dateFiltered : dateFiltered.filter((item) => item.courseId === courseFilter)),
    [dateFiltered, courseFilter],
  );

  const summary = useMemo(() => attendanceSummary(filtered), [filtered]);

  const trend = useMemo(() => {
    const keyFn = trendPeriod === "weekly" ? weekKey : monthKey;
    const labelFn = trendPeriod === "weekly"
      ? (key) => new Date(`${key}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : (key) => {
          const [year, month] = key.split("-").map(Number);
          return new Date(year, month - 1, 1).toLocaleString("en-US", { month: "short", year: "numeric" });
        };
    const buckets = new Map();
    filtered.forEach((item) => {
      if (!item.date || item.status === "excused") return;
      const key = keyFn(item.date);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(item);
    });
    return [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([key, items]) => ({
        label: labelFn(key),
        percent: attendanceSummary(items).percent ?? 0,
      }));
  }, [filtered, trendPeriod]);

  const breakdown = useMemo(
    () => [
      { name: "Present", key: "present", value: summary.present },
      { name: "Late", key: "late", value: summary.late },
      { name: "Absent", key: "absent", value: summary.absent },
    ].filter((row) => row.value > 0),
    [summary],
  );

  const byTraining = useMemo(() => {
    if (trainingOptions.length < 2) return [];
    return trainingOptions
      .map((option) => {
        const rows = dateFiltered.filter((item) => item.courseId === option.id);
        const rowSummary = attendanceSummary(rows);
        return { name: option.title, percent: rowSummary.percent, total: rowSummary.total };
      })
      .filter((row) => row.total > 0);
  }, [trainingOptions, dateFiltered]);

  const calendar = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const byDate = new Map();
    filtered.forEach((item) => {
      if (!item.date) return;
      // Multiple sessions on one day: absent outranks late outranks present
      // when deciding the single glyph shown for that day.
      const rank = { absent: 3, late: 2, present: 1, excused: 0 };
      const current = byDate.get(item.date);
      if (!current || rank[item.status] > rank[current]) byDate.set(item.date, item.status);
    });
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // Monday-first
    const cells = Array.from({ length: firstWeekday }, () => null);
    for (let day = 1; day <= daysInMonth; day += 1) {
      const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      cells.push({ day, status: byDate.get(key) || null });
    }
    return { cells, label: now.toLocaleString("en-US", { month: "long", year: "numeric" }) };
  }, [filtered]);

  if (loading) {
    return <p className="py-10 text-center text-sm text-muted">Loading your attendance...</p>;
  }
  if (error) {
    return <p className="rounded-xl bg-active p-4 text-sm text-primary">{error}</p>;
  }

  const visibleRecords = filtered.slice(0, visibleRows);

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-[#f3aaaa] bg-[linear-gradient(120deg,#fff0f0_0%,#fff7f7_45%,#ffffff_100%)] p-6 shadow-xl">
        <p className="text-[10px] font-bold uppercase tracking-widest text-primary">Attendance</p>
        <h2 className="mt-2 text-3xl font-black text-ink">My Attendance</h2>
        <p className="mt-2 text-sm text-muted">Your real check-in/check-out history, calculated from your actual class records.</p>
      </section>

      {!records.length ? (
        <div className="rounded-3xl border border-dashed border-border-subtle bg-card p-10 text-center text-sm text-muted">
          No attendance records yet. Once your teacher scans your D Card or marks attendance for a class, your statistics will appear here.
        </div>
      ) : (
        <>
          {/* Filters */}
          <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-border-subtle bg-card p-3 shadow-sm">
            {trainingOptions.length > 0 && (
              <select
                value={courseFilter}
                onChange={(e) => setCourseFilter(e.target.value)}
                className="rounded-xl border border-border-subtle px-3 py-2 text-xs font-bold text-ink"
              >
                <option value="all">All Training</option>
                {trainingOptions.map((option) => (
                  <option key={option.id} value={option.id}>{option.title}</option>
                ))}
              </select>
            )}
            <div className="flex flex-wrap gap-2">
              {DATE_RANGES.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setDateRange(item.key)}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${dateRange === item.key ? "bg-primary text-white" : "bg-page text-muted hover:bg-active hover:text-primary"}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            {dateRange === "custom" && (
              <div className="flex items-center gap-2 text-xs">
                <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="rounded-lg border border-border-subtle px-2 py-1.5" />
                <span className="text-muted">to</span>
                <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="rounded-lg border border-border-subtle px-2 py-1.5" />
              </div>
            )}
          </section>

          {/* Summary cards — always shown as real numbers/text, never chart-only (accessibility) */}
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard label="Overall Attendance" value={summary.percent != null ? `${summary.percent}%` : "—"} accent="text-primary" />
            <SummaryCard label="Present" value={summary.present} accent="text-success" />
            <SummaryCard label="Absent" value={summary.absent} accent="text-primary" />
            <SummaryCard label="Late" value={summary.late} accent="text-warning" />
          </section>
          <p className="text-xs text-muted">{summary.total} total session{summary.total === 1 ? "" : "s"} counted{summary.excused ? ` · ${summary.excused} excused (not counted)` : ""}.</p>

          {/* Graph 1: Attendance Trend */}
          <ChartCard
            title="Attendance Trend"
            subtitle="Your attendance rate over time, calculated from real sessions"
            icon={TrendingUp}
          >
            <div className="mb-3 flex justify-end gap-2">
              {TREND_PERIODS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setTrendPeriod(item.key)}
                  className={`rounded-full px-3 py-1 text-[11px] font-bold transition ${trendPeriod === item.key ? "bg-primary text-white" : "bg-page text-muted hover:bg-active hover:text-primary"}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            {trend.length ? (
              <div className="h-70 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trend} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
                    <defs>
                      <linearGradient id="attendanceTrendFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#E53935" stopOpacity={0.18} />
                        <stop offset="100%" stopColor="#E53935" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#667085" }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#667085" }} tickFormatter={(value) => `${value}%`} />
                    <Tooltip formatter={(value) => [`${value}%`, "Attendance"]} contentStyle={{ borderRadius: 12, border: "1px solid #e7e5e4", fontSize: 12 }} />
                    <Area type="natural" dataKey="percent" name="Attendance" stroke="#E53935" strokeWidth={3} fill="url(#attendanceTrendFill)" dot={{ r: 4, fill: "#E53935", strokeWidth: 2, stroke: "#ffffff" }} activeDot={{ r: 6 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyChartState message="Not enough dated records yet to plot a trend." />
            )}
          </ChartCard>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Graph 2: Present/Absent/Late breakdown */}
            <ChartCard title="Attendance Breakdown" subtitle="Present, Late, and Absent counts" icon={PieChartIcon}>
              {breakdown.length ? (
                <div className="h-70 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={breakdown} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="80%" paddingAngle={2}>
                        {breakdown.map((entry) => (
                          <Cell key={entry.key} fill={STATUS_COLORS[entry.key]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value, name) => {
                          const total = breakdown.reduce((sum, row) => sum + row.value, 0);
                          const percent = total ? ((value / total) * 100).toFixed(1) : "0";
                          return [`${value} (${percent}%)`, name];
                        }}
                        contentStyle={{ borderRadius: 12, border: "1px solid #e7e5e4", fontSize: 12 }}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} verticalAlign="bottom" height={36} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyChartState message="No sessions in this range yet." />
              )}
            </ChartCard>

            {/* Graph 3: Attendance by Training — only for students in more than one course */}
            <ChartCard title="Attendance by Training" subtitle="Only trainings you're enrolled in" icon={CalendarCheck}>
              {byTraining.length ? (
                <div className="h-70 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={byTraining} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f3f4f6" />
                      <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: "#667085" }} tickFormatter={(value) => `${value}%`} />
                      <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11, fill: "#667085" }} />
                      <Tooltip formatter={(value) => [`${value}%`, "Attendance"]} contentStyle={{ borderRadius: 12, border: "1px solid #e7e5e4", fontSize: 12 }} />
                      <Bar dataKey="percent" fill="#E53935" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyChartState message={trainingOptions.length < 2 ? "You're enrolled in only one training." : "No sessions in this range yet."} />
              )}
            </ChartCard>
          </div>

          {/* Calendar */}
          <section className="rounded-2xl border border-border-subtle bg-card p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-bold text-ink">Attendance Calendar — {calendar.label}</h3>
              <div className="flex gap-3 text-[11px] text-muted">
                <span><b className="text-success">✓</b> Present</span>
                <span><b className="text-warning">L</b> Late</span>
                <span><b className="text-primary">A</b> Absent</span>
                <span><b>-</b> No session</span>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-bold text-subtle">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>
            <div className="mt-1.5 grid grid-cols-7 gap-1.5">
              {calendar.cells.map((cell, index) => (
                <div
                  key={index}
                  className={`grid aspect-square place-items-center rounded-lg text-xs font-bold ${
                    !cell ? "" : cell.status === "present" ? "bg-success-soft text-success" : cell.status === "late" ? "bg-warning-soft text-warning" : cell.status === "absent" ? "bg-active text-primary" : "bg-page text-subtle"
                  }`}
                >
                  {cell && (
                    <span>
                      <span className="block">{cell.day}</span>
                      <span className="block text-[10px]">{cell.status === "present" ? "✓" : cell.status === "late" ? "L" : cell.status === "absent" ? "A" : "-"}</span>
                    </span>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Attendance history table */}
          <section className="overflow-x-auto rounded-2xl border border-border-subtle bg-card shadow-sm">
            <div className="p-5 pb-0">
              <h3 className="text-sm font-bold text-ink">Attendance History</h3>
            </div>
            <table className="mt-4 w-full min-w-[720px] text-left text-xs">
              <thead className="bg-page text-[10px] font-bold uppercase tracking-wider text-subtle">
                <tr>
                  <th className="p-3">Date</th>
                  <th className="p-3">Training/Class</th>
                  <th className="p-3">Location</th>
                  <th className="p-3">Check In</th>
                  <th className="p-3">Check Out</th>
                  <th className="p-3">Duration</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {visibleRecords.map((record) => {
                  const checkIn = formatTime(record.checkInAt);
                  const checkOut = formatTime(record.checkOutAt);
                  const duration = formatDuration(record.durationMinutes);
                  return (
                    <tr key={record.id} className="border-t border-border-subtle">
                      <td className="p-3">{record.date}</td>
                      <td className="p-3">{record.courseTitle}{record.className ? ` · ${record.className}` : ""}</td>
                      <td className="p-3">{record.location || "—"}</td>
                      <td className="p-3">{checkIn || "—"}</td>
                      <td className="p-3">{record.checkInAt ? (checkOut || "Not checked out") : "—"}</td>
                      <td className="p-3">{duration || "—"}</td>
                      <td className="p-3">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          record.status === "present" ? "bg-success-soft text-success" : record.status === "late" ? "bg-warning-soft text-warning" : record.status === "absent" ? "bg-active text-primary" : "bg-page text-subtle"
                        }`}>
                          {STATUS_LABELS[record.status] || record.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {!visibleRecords.length && (
                  <tr><td colSpan={7} className="p-6 text-center text-muted">No records in this range.</td></tr>
                )}
              </tbody>
            </table>
            {filtered.length > visibleRows && (
              <div className="p-4 text-center">
                <button
                  type="button"
                  onClick={() => setVisibleRows((current) => current + PAGE_SIZE)}
                  className="rounded-xl border border-border-subtle px-4 py-2 text-xs font-bold text-ink hover:bg-active"
                >
                  Show more
                </button>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function SummaryCard({ label, value, accent }) {
  return (
    <article className="rounded-2xl border border-border-subtle bg-card p-5 shadow-sm">
      <p className="text-[10px] font-bold uppercase tracking-wider text-subtle">{label}</p>
      <p className={`mt-1 text-3xl font-extrabold ${accent}`}>{value}</p>
    </article>
  );
}
