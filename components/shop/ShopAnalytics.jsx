"use client";

import { useMemo } from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, PolarAngleAxis, PolarGrid,
  PolarRadiusAxis, Radar, RadarChart, RadialBar, RadialBarChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { BadgeDollarSign, CheckCheck, ClipboardList, History, PackageCheck, PieChart as PieIcon, TrendingDown, TrendingUp, TriangleAlert } from "lucide-react";
import ChartTooltip from "../ui/ChartTooltip";

// Accent palette from the shop dashboard design (rose / orange / purple).
// Axis text and grid lines use currentColor inside a `text-subtle` wrapper,
// so the charts follow the app's light/dark theme like everything else.
const RED = "#e11d48";
const ORANGE = "#f97316";
const PURPLE = "#9333ea";
const SKY = "#0ea5e9";
const GREY = "#cbd5e1";
const SERIES = [RED, ORANGE, PURPLE, SKY, "#fb7185", "#64748b"];
const AXIS = { fill: "currentColor", fontSize: 10 };
export const SHOP_RANGES = [["7D", 7], ["30D", 30], ["1Y", 365], ["All", 0]];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY = 86400000;

export const money = (value) => `$${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
export const orderTime = (order) => order.createdAt?.toMillis?.() || 0;
export const statusOf = (order) => order.status || "pending";
export const quantityOf = (order) => (order.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
const shortDate = (ms) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });

const KPI_TONES = {
  rose: { icon: "border-red-line bg-active text-primary", hover: "hover:border-red-line" },
  orange: { icon: "border-deep-orange/30 bg-deep-orange-soft text-deep-orange", hover: "hover:border-deep-orange/40" },
  purple: { icon: "border-purple/30 bg-purple-soft text-purple", hover: "hover:border-purple/40" },
  slate: { icon: "border-border-subtle bg-page text-muted", hover: "hover:border-subtle" },
};

function KpiCard({ label, value, note, noteClass = "text-muted", icon: Icon, tone }) {
  const styles = KPI_TONES[tone];
  return (
    <div className={`rounded-2xl border border-border-subtle bg-card p-5 shadow-sm transition ${styles.hover}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</p>
          <p className="mt-1 text-3xl font-extrabold tabular-nums text-ink">{value}</p>
        </div>
        <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl border shadow-sm ${styles.icon}`}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      </div>
      <p className={`mt-4 flex items-center gap-1.5 text-xs font-semibold ${noteClass}`}>{note}</p>
    </div>
  );
}

const CHIP_TONES = {
  rose: "border-red-line bg-active text-primary",
  orange: "border-deep-orange/30 bg-deep-orange-soft text-deep-orange",
  purple: "border-purple/30 bg-purple-soft text-purple",
};

function Panel({ title, subtitle, chip, tone, children }) {
  return (
    <div className="flex min-w-0 flex-col rounded-2xl border border-border-subtle bg-card p-5 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold text-ink">{title}</h4>
        <span className={`shrink-0 rounded border px-2 py-0.5 text-[10px] font-semibold ${CHIP_TONES[tone]}`}>{chip}</span>
      </div>
      <p className="mb-4 text-xs text-muted">{subtitle}</p>
      <div className="h-60 w-full text-subtle">{children}</div>
    </div>
  );
}

function Empty({ message = "No orders in this period" }) {
  return <div className="grid h-full place-items-center rounded-xl border border-dashed border-border-subtle text-xs text-subtle">{message}</div>;
}

// Everything the KPI cards and charts show, for orders placed within the
// last `days` (0 = all time) plus the equal period before it for the change %.
function computeStats(orders, days) {
  const now = Date.now();
  const start = days ? now - days * DAY : 0;
  const inRange = orders.filter((order) => !days || orderTime(order) >= start);
  const previous = days ? orders.filter((order) => orderTime(order) >= start - days * DAY && orderTime(order) < start) : [];

  const fulfilled = inRange.filter((order) => statusOf(order) === "fulfilled");
  const pending = inRange.filter((order) => statusOf(order) === "pending");
  const live = inRange.filter((order) => statusOf(order) !== "cancelled");
  const revenue = fulfilled.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
  const prevRevenue = previous.filter((order) => statusOf(order) === "fulfilled").reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
  const delivered = fulfilled.reduce((sum, order) => sum + quantityOf(order), 0);
  const deliveredProducts = new Set(fulfilled.flatMap((order) => (order.items || []).map((item) => item.productId))).size;
  const closed = inRange.filter((order) => statusOf(order) !== "pending").length;
  const successRate = closed ? (fulfilled.length / closed) * 100 : 0;
  const change = days && prevRevenue ? ((revenue - prevRevenue) / prevRevenue) * 100 : null;

  // Collection activity: delivered vs pending orders per collection date (latest 8 dates).
  const byCollection = new Map();
  inRange.forEach((order) => {
    if (!order.collectionDate || statusOf(order) === "cancelled") return;
    const row = byCollection.get(order.collectionDate) || { date: order.collectionDate, Delivered: 0, Pending: 0 };
    row[statusOf(order) === "fulfilled" ? "Delivered" : "Pending"] += 1;
    byCollection.set(order.collectionDate, row);
  });
  const collection = [...byCollection.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-8)
    .map((row) => ({ ...row, label: shortDate(new Date(`${row.date}T00:00:00`).getTime()) }));

  // Item popularity: units per product (top 5 + Other).
  const byProduct = new Map();
  live.forEach((order) => (order.items || []).forEach((item) => byProduct.set(item.name, (byProduct.get(item.name) || 0) + Number(item.quantity || 0))));
  const ranked = [...byProduct.entries()].sort((a, b) => b[1] - a[1]);
  const popularity = ranked.slice(0, 5).map(([name, value]) => ({ name, value }));
  const rest = ranked.slice(5).reduce((sum, [, value]) => sum + value, 0);
  if (rest) popularity.push({ name: "Other", value: rest });

  // Revenue trend: daily for short ranges, monthly otherwise.
  const monthly = !days || days > 31;
  const buckets = new Map();
  if (!monthly) {
    for (let t = start; t <= now; t += DAY) buckets.set(new Date(t).toDateString(), { label: shortDate(t), Revenue: 0 });
  }
  live.forEach((order) => {
    const t = orderTime(order);
    if (!t) return;
    const d = new Date(t);
    const key = monthly ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` : d.toDateString();
    const row = buckets.get(key) || { label: monthly ? d.toLocaleDateString("en-US", { month: "short", year: "2-digit" }) : shortDate(t), Revenue: 0 };
    row.Revenue += Number(order.totalAmount || 0);
    buckets.set(key, row);
  });
  const trend = monthly ? [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, row]) => row) : [...buckets.values()];

  // Size / variant breakdown.
  const bySize = new Map();
  live.forEach((order) => (order.items || []).forEach((item) => {
    if (item.variantLabel) bySize.set(item.variantLabel, (bySize.get(item.variantLabel) || 0) + Number(item.quantity || 0));
  }));
  const sizes = [...bySize.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([name, value], index) => ({ name, value, fill: SERIES[index % SERIES.length] }));

  // Orders by weekday placed.
  const weekday = WEEKDAYS.map((day) => ({ day, Orders: 0 }));
  inRange.forEach((order) => { const t = orderTime(order); if (t) weekday[new Date(t).getDay()].Orders += 1; });

  // Order value per payment method, stacked by status.
  const byPayment = new Map();
  live.forEach((order) => {
    const method = order.paymentMethod || "Not recorded";
    const row = byPayment.get(method) || { name: method, Fulfilled: 0, Pending: 0 };
    row[statusOf(order) === "fulfilled" ? "Fulfilled" : "Pending"] += Number(order.totalAmount || 0);
    byPayment.set(method, row);
  });
  const payments = [...byPayment.values()].sort((a, b) => (b.Fulfilled + b.Pending) - (a.Fulfilled + a.Pending)).slice(0, 6);

  return {
    total: inRange.length, revenue, change, delivered, deliveredProducts, pending: pending.length, successRate,
    collection, popularity, trend, sizes, weekday, payments,
  };
}

/** Shop orders analytics (Admin/Director): KPI cards + six charts, built only from real order docs. */
export default function ShopAnalytics({ orders, range, onRangeChange }) {
  const days = SHOP_RANGES.find(([key]) => key === range)[1];

  const data = useMemo(() => computeStats(orders, days), [orders, days]);

  const period = { "7D": "last 7 days", "30D": "last 30 days", "1Y": "last year", All: "all time" }[range];

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Order summary">
        <KpiCard
          label="Total Revenue Collected"
          value={money(data.revenue)}
          icon={BadgeDollarSign}
          tone="rose"
          noteClass={data.change == null ? "text-muted" : data.change >= 0 ? "text-success" : "text-primary"}
          note={data.change == null
            ? <>From fulfilled orders · {period}</>
            : <>{data.change >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}{data.change >= 0 ? "+" : ""}{data.change.toFixed(1)}% from previous period</>}
        />
        <KpiCard label="Items Delivered" value={data.delivered.toLocaleString()} icon={PackageCheck} tone="orange" noteClass="text-deep-orange"
          note={<><PackageCheck className="h-3.5 w-3.5" />Across {data.deliveredProducts} product{data.deliveredProducts === 1 ? "" : "s"}</>} />
        <KpiCard label="Pending Pickup" value={data.pending.toLocaleString()} icon={History} tone="purple" noteClass="text-purple"
          note={<><TriangleAlert className="h-3.5 w-3.5" />Awaiting collection</>} />
        <KpiCard label="Total Orders Logged" value={data.total.toLocaleString()} icon={ClipboardList} tone="slate"
          note={<><CheckCheck className="h-3.5 w-3.5" />{data.successRate.toFixed(1)}% fulfillment success rate</>} />
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-bold text-ink"><PieIcon className="h-5 w-5 text-primary" aria-hidden="true" />Shop Analytics &amp; Metrics</h3>
            <p className="mt-0.5 text-xs text-muted">Live from every order placed in the shop · {period}</p>
          </div>
          <div className="flex gap-1.5 text-xs" role="group" aria-label="Date range">
            {SHOP_RANGES.map(([key]) => (
              <button key={key} type="button" onClick={() => onRangeChange(key)} aria-pressed={range === key}
                className={`rounded px-3 py-1 font-semibold transition ${range === key ? "bg-primary text-white shadow-sm" : "bg-page text-muted hover:bg-active hover:text-ink"}`}>
                {key}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          <Panel title="Collection Activity & Status" subtitle="Delivered vs pending per collection date" chip="Bar" tone="rose">
            {data.collection.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.collection} barGap={4}>
                  <CartesianGrid stroke="currentColor" strokeOpacity={0.18} vertical={false} />
                  <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} width={28} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: "currentColor", fillOpacity: 0.06 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} iconType="square" />
                  <Bar dataKey="Delivered" fill={RED} radius={[4, 4, 0, 0]} maxBarSize={22} />
                  <Bar dataKey="Pending" fill={GREY} radius={[4, 4, 0, 0]} maxBarSize={22} />
                </BarChart>
              </ResponsiveContainer>
            ) : <Empty message="No orders with a collection date in this period" />}
          </Panel>

          <Panel title="Item Popularity Share" subtitle="Units ordered per product" chip="Doughnut" tone="orange">
            {data.popularity.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data.popularity} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="80%" paddingAngle={2} stroke="none">
                    {data.popularity.map((entry, index) => <Cell key={entry.name} fill={SERIES[index % SERIES.length]} />)}
                  </Pie>
                  <Tooltip content={<ChartTooltip formatValue={(value) => `${value} units`} />} />
                  <Legend wrapperStyle={{ fontSize: 10 }} iconType="square" />
                </PieChart>
              </ResponsiveContainer>
            ) : <Empty />}
          </Panel>

          <Panel title="Revenue Influx ($)" subtitle={`Order value, excluding cancelled · ${period}`} chip="Line" tone="purple">
            {data.trend.some((row) => row.Revenue > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.trend}>
                  <defs>
                    <linearGradient id="shopRevenueFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor={ORANGE} stopOpacity={0.25} />
                      <stop offset="1" stopColor={ORANGE} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="currentColor" strokeOpacity={0.18} vertical={false} />
                  <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} minTickGap={16} />
                  <YAxis tick={AXIS} axisLine={false} tickLine={false} width={44} tickFormatter={(v) => `$${v}`} />
                  <Tooltip content={<ChartTooltip formatValue={money} />} />
                  <Area type="monotone" dataKey="Revenue" stroke={ORANGE} strokeWidth={2.5} fill="url(#shopRevenueFill)" dot={{ r: 3, fill: ORANGE, strokeWidth: 0 }} activeDot={{ r: 5 }} />
                </AreaChart>
              </ResponsiveContainer>
            ) : <Empty />}
          </Panel>

          <Panel title="Size Breakdown" subtitle="Units ordered per size / variant" chip="Radial" tone="rose">
            {data.sizes.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart data={data.sizes} innerRadius="18%" outerRadius="95%" startAngle={90} endAngle={-270} barSize={12}>
                  <PolarAngleAxis type="number" domain={[0, Math.max(...data.sizes.map((s) => s.value))]} tick={false} />
                  <RadialBar dataKey="value" background={{ fill: "currentColor", fillOpacity: 0.08 }} cornerRadius={6} />
                  <Tooltip content={<ChartTooltip formatValue={(value) => `${value} units`} />} />
                  <Legend wrapperStyle={{ fontSize: 10 }} iconType="square" layout="vertical" align="right" verticalAlign="middle" />
                </RadialBarChart>
              </ResponsiveContainer>
            ) : <Empty message="No sized items ordered in this period" />}
          </Panel>

          <Panel title="Ordering Pattern by Weekday" subtitle="When orders are placed" chip="Radar" tone="rose">
            {data.total ? (
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={data.weekday} outerRadius="75%">
                  <PolarGrid stroke="currentColor" strokeOpacity={0.25} />
                  <PolarAngleAxis dataKey="day" tick={AXIS} />
                  <PolarRadiusAxis tick={false} axisLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Radar dataKey="Orders" stroke={PURPLE} fill={PURPLE} fillOpacity={0.25} strokeWidth={2} dot={{ r: 3, fill: PURPLE }} />
                </RadarChart>
              </ResponsiveContainer>
            ) : <Empty />}
          </Panel>

          <Panel title="Payment Methods Breakdown" subtitle="Order value per payment method, by status" chip="Stacked" tone="purple">
            {data.payments.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.payments}>
                  <CartesianGrid stroke="currentColor" strokeOpacity={0.18} vertical={false} />
                  <XAxis dataKey="name" tick={AXIS} axisLine={false} tickLine={false} interval={0} />
                  <YAxis tick={AXIS} axisLine={false} tickLine={false} width={44} tickFormatter={(v) => `$${v}`} />
                  <Tooltip content={<ChartTooltip formatValue={money} />} cursor={{ fill: "currentColor", fillOpacity: 0.06 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} iconType="square" />
                  <Bar dataKey="Fulfilled" stackId="value" fill={RED} maxBarSize={56} />
                  <Bar dataKey="Pending" stackId="value" fill={ORANGE} radius={[4, 4, 0, 0]} maxBarSize={56} />
                </BarChart>
              </ResponsiveContainer>
            ) : <Empty />}
          </Panel>
        </div>
      </section>
    </div>
  );
}
