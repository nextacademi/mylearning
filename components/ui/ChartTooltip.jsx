"use client";

// Recharts tooltip drawn with the dashboard's own tokens (bg-card,
// border-border-subtle, text-ink…) so it follows the light/dark theme,
// unlike Recharts' default inline-styled box. Pass as
// <Tooltip content={<ChartTooltip />} />; `formatValue` formats each value.
export default function ChartTooltip({ active, payload, label, labelFormatter, formatValue }) {
  if (!active || !payload?.length) return null;
  const heading = labelFormatter ? labelFormatter(label, payload) : label ?? payload[0]?.payload?.name;
  return (
    <div className="min-w-40 rounded-xl border border-border-subtle bg-card px-3 py-2 text-xs shadow-lg">
      {heading !== undefined && heading !== "" && <p className="mb-1 font-bold text-ink">{heading}</p>}
      {payload.map((item) => (
        <div key={`${item.dataKey}-${item.name}`} className="flex items-center gap-2 py-0.5 text-muted">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: item.color || item.payload?.fill }} />
          <span className="flex-1">{item.name}</span>
          <b className="text-ink">{formatValue ? formatValue(item.value, item) : Number(item.value || 0).toLocaleString()}</b>
        </div>
      ))}
    </div>
  );
}
