"use client";

import { useMemo } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3, ListChecks, TrendingUp } from "lucide-react";
import { ChartCard, EmptyChartState } from "../dashboard/overview/ChartCard";
import { assignmentNumberLabel } from "../../lib/assignment-shared";
import { batchRates, statusByNumber, submissionTrend } from "./portal-view";

// The second row of the Assignment dashboard ("3 + 3"): the first row is the
// three headline cards in AssignmentPortal.jsx. Same chart chrome and colours
// as the Director overview (components/dashboard/overview/*).
const COLORS = { onTime: "#22C55E", late: "#F59E0B", missing: "#FF2D2D", trend: "#3B82F6" };
const AXIS = { fontSize: 11, fill: "#667085" };
const TOOLTIP = { borderRadius: 12, border: "1px solid #e7e5e4", fontSize: 12 };

export default function AssignmentCharts({ batches, filters }) {
  const trend = useMemo(() => submissionTrend(batches, filters), [batches, filters]);
  const rates = useMemo(() => batchRates(batches), [batches]);
  const byNumber = useMemo(() => statusByNumber(batches), [batches]);
  const trendTotal = trend.reduce((sum, row) => sum + row.total, 0);

  return (
    <section className="grid grid-cols-1 gap-5 xl:grid-cols-3">
      <ChartCard title="Submissions Over Time" subtitle={filters.from || filters.to ? "Inside the chosen dates" : "Last 12 weeks"} icon={TrendingUp}>
        {trendTotal ? (
          <div className="h-70 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="assignmentTrendFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLORS.trend} stopOpacity={0.2} />
                    <stop offset="100%" stopColor={COLORS.trend} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis dataKey="label" tick={AXIS} interval="preserveStartEnd" minTickGap={12} />
                <YAxis allowDecimals={false} tick={AXIS} />
                <Tooltip
                  contentStyle={TOOLTIP}
                  labelFormatter={(label, items) => (items?.[0]?.payload?.monthly ? label : `Week of ${label}`)}
                />
                <Area type="monotone" dataKey="total" name="Submissions" stroke={COLORS.trend} strokeWidth={3} fill="url(#assignmentTrendFill)" dot={{ r: 3, fill: COLORS.trend, strokeWidth: 2, stroke: "#ffffff" }} activeDot={{ r: 5 }} />
                <Area type="monotone" dataKey="late" name="Of which late" stroke={COLORS.late} strokeWidth={2} fill="none" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyChartState message="No submissions in this period yet" />
        )}
      </ChartCard>

      <ChartCard title="Submission Rate by Batch" subtitle="Share of owed assignments handed in" icon={BarChart3}>
        {rates.length ? (
          <div className="h-70 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rates} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f3f4f6" />
                <XAxis type="number" domain={[0, 100]} tickFormatter={(value) => `${value}%`} tick={AXIS} />
                <YAxis type="category" dataKey="label" width={92} tick={AXIS} />
                <Tooltip
                  contentStyle={TOOLTIP}
                  cursor={{ fill: "#f9fafb" }}
                  formatter={(value, name, item) => [`${value}% (${item.payload.submitted}/${item.payload.owed})`, "Submitted"]}
                  labelFormatter={(label, items) => items?.[0]?.payload?.title || label}
                />
                <Bar dataKey="rate" name="Submitted" fill={COLORS.onTime} radius={[0, 6, 6, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyChartState message="No assignments owed yet" />
        )}
      </ChartCard>

      <ChartCard title="Status by Assignment" subtitle="On time, late and missing per assignment number" icon={ListChecks}>
        {byNumber.length ? (
          <div className="h-70 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byNumber} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis dataKey="label" tick={AXIS} />
                <YAxis allowDecimals={false} tick={AXIS} />
                <Tooltip contentStyle={TOOLTIP} cursor={{ fill: "#f9fafb" }} labelFormatter={(label, items) => (items?.[0]?.payload ? assignmentNumberLabel(items[0].payload.number) : label)} />
                <Legend wrapperStyle={{ fontSize: 12 }} itemSorter={(item) => ["onTime", "late", "missing"].indexOf(item.dataKey)} />
                <Bar dataKey="onTime" name="On time" stackId="status" fill={COLORS.onTime} maxBarSize={38} />
                <Bar dataKey="late" name="Late" stackId="status" fill={COLORS.late} maxBarSize={38} />
                <Bar dataKey="missing" name="Missing" stackId="status" fill={COLORS.missing} radius={[6, 6, 0, 0]} maxBarSize={38} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyChartState message="No published assignments yet" />
        )}
      </ChartCard>
    </section>
  );
}
