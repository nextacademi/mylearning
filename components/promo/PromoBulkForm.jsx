"use client";

import { useState } from "react";
import { UsersRound } from "lucide-react";
import { formatMoney } from "../training/PaymentHistoryTable";
import { bulkGeneratePromoCodes } from "../../lib/services/promo-service";

const blankBulk = { type: "percentage", orgName: "Org Member Batch", expiry: "", count: "100" };
// Mirrors lib/server/promo-core.js's MAX_BULK_COUNT — the 4-digit code
// suffix only has 9,000 possible draws, so this stays well under that.
const MAX_BULK_COUNT = 2000;
const FIELD = "rounded-xl border border-border-subtle bg-page px-3 py-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-orange-500";

// "Generate Org Promos" modal — a batch of unique one-use codes. Mounted only
// while open, so its state starts fresh every time.
export default function PromoBulkForm({ onClose, onGenerated }) {
  const [form, setForm] = useState(blankBulk);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const set = (key) => (e) => setForm((current) => ({ ...current, [key]: e.target.value }));

  async function submit() {
    const count = Number(form.count);
    if (!Number.isInteger(count) || count < 1 || count > MAX_BULK_COUNT) {
      setMessage(`Enter a whole number between 1 and ${MAX_BULK_COUNT}.`);
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const result = await bulkGeneratePromoCodes({ ...form, count });
      onGenerated(result);
    } catch (err) {
      setMessage(err.message || "Unable to generate codes.");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 py-8">
      <div className="w-full max-w-md rounded-3xl bg-card p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-bold text-ink"><UsersRound className="h-5 w-5 text-orange-500" aria-hidden="true" /> Generate Org Promos</h3>
          <button type="button" onClick={onClose} className="text-xl text-muted" aria-label="Close">×</button>
        </div>
        <p className="mb-4 text-xs font-medium text-ink/70">
          Batch-generates unique 8-character promo codes (format <code className="rounded bg-page px-1.5 py-0.5 font-mono text-orange-600">NEXTXXXX</code>) for team members or clients — one use each.
        </p>
        <div className="space-y-4">
          <label className="grid gap-1 text-xs font-bold text-ink">
            Quantity
            <input type="number" min="1" max={MAX_BULK_COUNT} step="1" value={form.count} onChange={set("count")} className={FIELD} />
            <span className="font-semibold normal-case text-muted">Up to {MAX_BULK_COUNT} codes at a time.</span>
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="grid gap-1 text-xs font-bold text-ink">
              Discount Type
              <select value={form.type} onChange={set("type")} className={FIELD}>
                <option value="percentage">Percentage Off (25%)</option>
                <option value="fixed">Fixed Amount ({formatMoney(20)})</option>
                <option value="shipping">Free Shipping</option>
              </select>
            </label>
            <label className="grid gap-1 text-xs font-bold text-ink">
              Organization Name
              <input value={form.orgName} onChange={set("orgName")} placeholder="e.g. Enterprise Partner" className={FIELD} />
            </label>
          </div>
          <label className="grid gap-1 text-xs font-bold text-ink">
            Expiration Date
            <input type="date" value={form.expiry} onChange={set("expiry")} className={FIELD} />
          </label>
          {message && <p className="text-xs text-primary">{message}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} disabled={saving} className="rounded-xl border border-border-subtle px-5 py-2.5 text-sm font-medium text-ink">Cancel</button>
            <button type="button" onClick={submit} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-medium text-white shadow-md disabled:opacity-60">{saving ? "Generating…" : `Generate ${form.count || 0} Codes`}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
