"use client";

import { useState } from "react";
import { createPromoCode } from "../../lib/services/promo-service";
import { PROMO_TYPES } from "../../lib/promo-shared";

const blankPromo = { code: "", type: "percentage", value: "20", limit: "100", expiry: "", description: "" };
const FIELD = "rounded-xl border border-border-subtle bg-page px-3 py-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-primary";

// "Create New Promotion" modal — a single hand-made promo code. Mounted only
// while open, so its state starts fresh every time.
export default function PromoCreateForm({ onClose, onCreated }) {
  const [form, setForm] = useState(blankPromo);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const set = (key) => (e) => setForm((current) => ({ ...current, [key]: e.target.value }));

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      await createPromoCode(form);
      onCreated();
    } catch (err) {
      setMessage(err.message || "Unable to create this promotion.");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 py-8">
      <div className="w-full max-w-lg rounded-3xl bg-card p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-ink">Create New Promotion</h3>
          <button type="button" onClick={onClose} className="text-xl text-muted" aria-label="Close">×</button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <label className="grid gap-1 text-xs font-bold text-ink">
            Coupon Code
            <input required value={form.code} onChange={set("code")} placeholder="e.g. SUMMER50" className={`${FIELD} font-mono uppercase`} />
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="grid gap-1 text-xs font-bold text-ink">
              Discount Type
              <select value={form.type} onChange={set("type")} className={FIELD}>
                {PROMO_TYPES.map((type) => <option key={type} value={type}>{type === "percentage" ? "Percentage Off (%)" : type === "fixed" ? "Fixed Amount" : "Free Shipping"}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-bold text-ink">
              {form.type === "percentage" ? "Discount Percentage" : form.type === "fixed" ? "Discount Amount" : "Value (N/A)"}
              <input type="number" min="1" disabled={form.type === "shipping"} required={form.type !== "shipping"} value={form.value} onChange={set("value")} className={`${FIELD} disabled:opacity-50`} />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <label className="grid gap-1 text-xs font-bold text-ink">
              Usage Limit
              <input type="number" min="1" required value={form.limit} onChange={set("limit")} className={FIELD} />
            </label>
            <label className="grid gap-1 text-xs font-bold text-ink">
              Expiration Date
              <input type="date" required value={form.expiry} onChange={set("expiry")} className={FIELD} />
            </label>
          </div>
          <label className="grid gap-1 text-xs font-bold text-ink">
            Description / Tag
            <input value={form.description} onChange={set("description")} placeholder="e.g. Summer sale special for all users" className={FIELD} />
          </label>
          {message && <p className="text-xs text-primary">{message}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} disabled={saving} className="rounded-xl border border-border-subtle px-5 py-2.5 text-sm font-medium text-ink">Cancel</button>
            <button type="submit" disabled={saving} className="rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-white shadow-md disabled:opacity-60">{saving ? "Saving…" : "Save Promotion"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
