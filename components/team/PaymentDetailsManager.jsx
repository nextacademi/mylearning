"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { loadPaymentSettings, savePaymentSettings } from "../../lib/services/site-content-service";
import { PAYMENT_FIELDS, paymentConfigured } from "../../lib/training-offer";
import { useToast } from "../ui/Toast";
import PhotoField from "./PhotoField";

// Website → Payment details: what the public Training Registration form
// shows under "Payment Details & Transfer". The block (and the required
// receipt upload) stays hidden until a PayNow QR / UEN or a bank account
// is saved here.
const inputClass = "mt-1 w-full rounded-xl border border-border-subtle bg-card px-3 py-2.5 text-sm font-normal text-ink outline-none focus:ring-2 focus:ring-primary";
const EMPTY = Object.fromEntries(Object.keys(PAYMENT_FIELDS).map((key) => [key, ""]));

export default function PaymentDetailsManager() {
  const toast = useToast();
  const [form, setForm] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadPaymentSettings()
      .then((data) => setForm({ ...EMPTY, ...(data.payment || {}) }))
      .catch((err) => setError(err.message || "Unable to load."));
  }, []);

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const data = await savePaymentSettings(form);
      setForm({ ...EMPTY, ...data.payment });
      toast.success(paymentConfigured(data.payment) ? "Payment details saved. They now show on the registration form." : "Saved. Payment details are hidden on the form until you add a PayNow QR/UEN or a bank account.");
    } catch (err) {
      toast.error(err.message || "Unable to save.");
    } finally {
      setSaving(false);
    }
  }

  if (error) return <p className="rounded-xl bg-active px-4 py-3 text-sm text-primary">{error}</p>;
  if (!form) return <p className="text-sm text-muted">Loading…</p>;

  const live = paymentConfigured(form);
  const field = (key, label, placeholder) => (
    <label className="block text-xs font-bold text-muted">{label}
      <input value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} maxLength={PAYMENT_FIELDS[key]} placeholder={placeholder} className={inputClass} />
    </label>
  );

  return (
    <form onSubmit={save} className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted">Shown in the “Payment Details &amp; Transfer” box of the homepage Training Registration form.</p>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold ${live ? "bg-success-soft text-success" : "bg-page text-muted"}`}>
          {live ? <Eye className="h-3.5 w-3.5" aria-hidden="true" /> : <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />}
          {live ? "Shown on the form" : "Hidden — receipt upload is optional"}
        </span>
      </div>

      <div className="space-y-4 rounded-3xl border border-border-subtle bg-card p-5 shadow-sm">
        <h3 className="text-sm font-black text-ink">PayNow</h3>
        <PhotoField
          label="PayNow QR code"
          value={form.paynowQr}
          onChange={(paynowQr) => setForm((current) => ({ ...current, paynowQr }))}
          placeholder="Upload the QR image, or paste https://…"
          inputClassName={inputClass}
        />
        {field("paynowUen", "PayNow UEN", "e.g. 2023XXXXXA")}
      </div>

      <div className="space-y-4 rounded-3xl border border-border-subtle bg-card p-5 shadow-sm">
        <h3 className="text-sm font-black text-ink">Bank transfer</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          {field("bankName", "Bank name", "e.g. DBS Bank Singapore")}
          {field("accountName", "Account name", "e.g. NEXT ACADEMY PTE LTD")}
          {field("accountNumber", "Account number", "")}
        </div>
        <label className="block text-xs font-bold text-muted">Note under the payment details (optional)
          <textarea rows={2} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} maxLength={PAYMENT_FIELDS.note} placeholder="e.g. Please put the trainee's name in the transfer reference." className={inputClass} />
        </label>
      </div>

      <div className="flex justify-end">
        <button disabled={saving} className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60">{saving ? "Saving..." : "Save payment details"}</button>
      </div>
    </form>
  );
}
