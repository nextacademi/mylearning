"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, PieChart, Pie, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BookOpen, GraduationCap, Layers, Presentation, RefreshCw, UserCheck, Wallet } from "lucide-react";
import { loadStudentDirectoryCached } from "../../lib/services/student-service";
import { loadTeacherAssignmentDataCached } from "../../lib/services/teacher-assignment-service";
import { loadFinanceOverviewCached } from "../../lib/services/finance-service";
import { loadTraining } from "../../lib/services/training-service";
import { countWithdrawnEnrollments, loadRecentActivities, loadUpcomingEvents } from "../../lib/director-analytics";
import { formatMoney } from "../training/PaymentHistoryTable";
import StatCard from "../finance/StatCard";
import { ChartCard, EmptyChartState } from "./overview/ChartCard";
import TrendCharts from "./overview/TrendCharts";
import StatusCharts from "./overview/StatusCharts";
import TrainingPerformance from "./overview/TrainingPerformance";
import TeacherWorkload from "./overview/TeacherWorkload";
import { EnrollmentBreakdown, OutstandingDueCard, RevenueVsExpenses } from "./overview/FinanceSummaries";
import EventsAndActivity from "./overview/EventsAndActivity";

// Same red/white accent used everywhere else in the app (--dash-primary and
// friends from app/globals.css) — chart series reuse those exact tokens
// instead of inventing a new palette.
const CHART_COLORS = ["#FF2D2D", "#F59E0B", "#22C55E", "#3B82F6", "#A855F7", "#14B8A6", "#EC4899"];
const MAX_CHART_SLICES = 6;

// Groups a long tail of trainings into "Other" so the bar/doughnut charts
// stay readable instead of rendering dozens of slivers.
function topSlices(rows) {
  if (rows.length <= MAX_CHART_SLICES) return rows;
  const sorted = [...rows].sort((a, b) => b.count - a.count);
  const top = sorted.slice(0, MAX_CHART_SLICES - 1);
  const otherCount = sorted.slice(MAX_CHART_SLICES - 1).reduce((sum, item) => sum + item.count, 0);
  return [...top, { name: "Other", count: otherCount }];
}

// Still the sole source for the 6 KPI cards and the two existing charts —
// a failure in any of the NEW analytics below can never break these.
// Reuses the SAME cached promises the Students/Teacher/Finance tabs (and
// their own prefetch calls from app/dashboard/[role]/page.jsx) use — this
// Dashboard tab was previously firing its own uncached duplicate fetch of
// all three on every mount, wasting the very prefetch meant to speed it up.
async function fetchOverviewData(force = false) {
  const [studentsRes, teacherRes, financeRes] = await Promise.all([
    loadStudentDirectoryCached({ force }),
    loadTeacherAssignmentDataCached({ force }),
    loadFinanceOverviewCached({ force }),
  ]);
  return {
    students: studentsRes.students || [],
    teachers: teacherRes.teachers || [],
    courses: teacherRes.courses || [],
    classes: teacherRes.classes || [],
    admissions: financeRes.admissions || [],
    payments: financeRes.payments || [],
    totalIncome: financeRes.totals?.income || 0,
    totals: financeRes.totals || {},
    expensesCount: (financeRes.expenses || []).length,
  };
}

// Separate, Promise.allSettled-based fetch for the new sections — a failure
// in any one of these can only ever affect that one section's own card,
// never the KPI cards/charts above (different Promise entirely) and never
// the other new sections (each tracked independently below).
async function fetchExtraAnalytics() {
  const [coursesResult, eventsResult, activitiesResult, withdrawnResult] = await Promise.allSettled([
    loadTraining(),
    loadUpcomingEvents(),
    loadRecentActivities(),
    countWithdrawnEnrollments(),
  ]);
  return {
    courses: coursesResult.status === "fulfilled" ? coursesResult.value.courses || [] : [],
    coursesError: coursesResult.status === "rejected",
    events: eventsResult.status === "fulfilled" ? eventsResult.value : [],
    eventsError: eventsResult.status === "rejected",
    activities: activitiesResult.status === "fulfilled" ? activitiesResult.value : [],
    activitiesError: activitiesResult.status === "rejected",
    withdrawnCount: withdrawnResult.status === "fulfilled" ? withdrawnResult.value : 0,
    withdrawnError: withdrawnResult.status === "rejected",
  };
}

export default function DirectorOverview({ onNavigate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const [extra, setExtra] = useState(null);
  const [extraLoading, setExtraLoading] = useState(true);

  const load = useCallback((force = false) => fetchOverviewData(force), []);
  const loadExtra = useCallback(() => fetchExtraAnalytics(), []);

  useEffect(() => {
    let cancelled = false;
    load()
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "Unable to load dashboard analytics.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    loadExtra()
      .then((result) => {
        if (!cancelled) setExtra(result);
      })
      .finally(() => {
        if (!cancelled) setExtraLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadExtra]);

  function handleRefreshExtra() {
    setExtraLoading(true);
    loadExtra()
      .then(setExtra)
      .finally(() => setExtraLoading(false));
  }

  function handleRefresh() {
    setRefreshing(true);
    setError("");
    load(true)
      .then(setData)
      .catch((err) => setError(err.message || "Unable to refresh dashboard analytics."))
      .finally(() => setRefreshing(false));
    handleRefreshExtra();
  }

  const stats = useMemo(() => {
    if (!data) return null;
    return {
      students: data.students.length,
      teachers: data.teachers.length,
      trainings: data.courses.length,
      batches: data.classes.length,
      enrollments: data.admissions.length,
      revenue: data.totalIncome,
    };
  }, [data]);

  const enrollmentByTraining = useMemo(() => {
    if (!data) return [];
    const counts = new Map();
    data.admissions.forEach((item) => {
      const name = item.courseTitle || "Untitled training";
      counts.set(name, (counts.get(name) || 0) + 1);
    });
    return topSlices([...counts.entries()].map(([name, count]) => ({ name, count })));
  }, [data]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-ink">Overview &amp; Analytics</h2>
          <p className="mt-1 text-sm text-muted">Monitor your LMS performance and business growth</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center rounded-full border border-red-line bg-active px-3 py-1 text-xs font-semibold text-primary">
            <span className="mr-1.5 h-2 w-2 rounded-full bg-primary animate-pulse" aria-hidden="true" />
            Live data
          </span>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={loading || refreshing}
            className="inline-flex items-center gap-2 rounded-xl border border-border-subtle bg-card px-4 py-2 text-xs font-bold text-ink shadow-sm transition hover:bg-active disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />
            Refresh Stats
          </button>
        </div>
      </div>

      {error && <p className="rounded-xl bg-active p-3 text-xs font-semibold text-primary">{error}</p>}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Total Students" value={stats?.students} loading={loading} icon={GraduationCap} iconBg="bg-active" iconColor="text-primary" />
        <StatCard label="Total Teachers" value={stats?.teachers} loading={loading} icon={Presentation} iconBg="bg-active" iconColor="text-primary" />
        <StatCard label="Total Trainings" value={stats?.trainings} loading={loading} icon={BookOpen} iconBg="bg-active" iconColor="text-primary" />
        <StatCard label="Total Batches" value={stats?.batches} loading={loading} icon={Layers} iconBg="bg-active" iconColor="text-primary" />
        <StatCard label="Total Enrollments" value={stats?.enrollments} loading={loading} icon={UserCheck} iconBg="bg-active" iconColor="text-primary" />
        <StatCard label="Total Revenue" value={stats?.revenue} format={formatMoney} loading={loading} icon={Wallet} iconBg="bg-active" iconColor="text-primary" />
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard title="Training-wise Enrollment" subtitle="Number of students enrolled per training program" icon={BookOpen}>
          {loading ? (
            <EmptyChartState message="Loading enrollment data..." />
          ) : enrollmentByTraining.length ? (
            <div className="h-70 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={enrollmentByTraining} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: "#667085" }}
                    interval={0}
                    angle={enrollmentByTraining.length > 4 ? -20 : 0}
                    textAnchor={enrollmentByTraining.length > 4 ? "end" : "middle"}
                    height={enrollmentByTraining.length > 4 ? 50 : 30}
                  />
                  <YAxis allowDecimals={false} domain={[0, "dataMax"]} tick={{ fontSize: 11, fill: "#667085" }} />
                  <Tooltip
                    cursor={{ fill: "#fff1f1" }}
                    formatter={(value) => [`${value} students`, "Enrolled"]}
                    contentStyle={{ borderRadius: 12, border: "1px solid #e7e5e4", fontSize: 12 }}
                  />
                  <Bar dataKey="count" name="Enrolled Students" radius={[6, 6, 0, 0]} maxBarSize={40}>
                    {enrollmentByTraining.map((entry, index) => (
                      <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyChartState message="No enrollments recorded yet." />
          )}
        </ChartCard>

        <ChartCard title="Enrollment Distribution" subtitle="Proportional share across training programs" icon={UserCheck}>
          {loading ? (
            <EmptyChartState message="Loading enrollment data..." />
          ) : enrollmentByTraining.length ? (
            <div className="h-70 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={enrollmentByTraining}
                    dataKey="count"
                    nameKey="name"
                    innerRadius="55%"
                    outerRadius="80%"
                    paddingAngle={2}
                  >
                    {enrollmentByTraining.map((entry, index) => (
                      <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value, name, item) => {
                      const total = enrollmentByTraining.reduce((sum, row) => sum + row.count, 0);
                      const percent = total ? ((item.value / total) * 100).toFixed(1) : "0";
                      return [`${value} (${percent}%)`, name];
                    }}
                    contentStyle={{ borderRadius: 12, border: "1px solid #e7e5e4", fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyChartState message="No enrollments recorded yet." />
          )}
        </ChartCard>
      </section>

      <TrendCharts admissions={data?.admissions || []} payments={data?.payments || []} loading={loading} />

      <StatusCharts
        totals={data?.totals}
        loading={loading}
        courses={extra?.courses}
        coursesLoading={extraLoading}
        coursesError={extra?.coursesError}
        onRetryCourses={handleRefreshExtra}
      />

      <TrainingPerformance
        courses={extra?.courses}
        loading={extraLoading}
        error={extra?.coursesError}
        onRetry={handleRefreshExtra}
        onNavigate={onNavigate}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <TeacherWorkload teachers={data?.teachers} courses={data?.courses} classes={data?.classes} students={data?.students} loading={loading} />
        <OutstandingDueCard totals={data?.totals} loading={loading} onNavigate={onNavigate} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <EnrollmentBreakdown
          activeCount={stats?.enrollments}
          withdrawnCount={extra?.withdrawnCount}
          loading={loading || extraLoading}
          error={extra?.withdrawnError}
          onRetry={handleRefreshExtra}
        />
        <RevenueVsExpenses totals={data?.totals} expensesCount={data?.expensesCount} loading={loading} />
      </div>

      <EventsAndActivity
        events={extra?.events}
        eventsLoading={extraLoading}
        eventsError={extra?.eventsError}
        onRetryEvents={handleRefreshExtra}
        activities={extra?.activities}
        activitiesLoading={extraLoading}
        activitiesError={extra?.activitiesError}
        onRetryActivities={handleRefreshExtra}
      />
    </div>
  );
}
