"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { loadPaymentMethods, savePaymentMethods } from "../../lib/services/payment-methods-service";
import { stopEnterSubmit } from "../../lib/ui/keyboard";
import { useToast } from "../ui/Toast";
import { SkeletonList } from "../ui/Skeleton";

// Finance → Payment Methods: the one editable list every payment dropdown
// in the app uses (Income, Expenses, Invoice payments, Collect Payment).
// Removing a method only stops it being picked for NEW records — existing
// records keep whatever they were saved with.
export default function PaymentMethodsTab() {
  const toast = useToast();
  const [methods, setMethods] = useState(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    loadPaymentMethods()
      .then((list) => setMethods([...list]))
      .catch((err) => { setMethods([]); setError(err.message || "Unable to load payment methods."); });
  }, []);

  function rename(index, value) {
    setMethods((list) => list.map((item, i) => (i === index ? value : item)));
  }
  function move(index, delta) {
    setMethods((list) => {
      const next = [...list];
      const target = index + delta;
      if (target < 0 || target >= next.length) return list;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }
  function remove(index) {
    setMethods((list) => list.filter((_, i) => i !== index));
  }
  function add() {
    const name = draft.trim();
    if (!name) return;
    if (methods.some((item) => item.trim().toLowerCase() === name.toLowerCase())) {
      setError(`"${name}" is already on the list.`);
      return;
    }
    setMethods((list) => [...list, name]);
    setDraft("");
    setError("");
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const saved = await savePaymentMethods(methods);
      setMethods([...saved]);
      toast.success("Payment methods saved.");
    } catch (err) {
      setError(err.message || "Unable to save payment methods.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="max-w-2xl rounded-3xl border border-border-subtle bg-card p-5 shadow-sm md:p-6">
      <h3 className="font-bold text-ink">Payment Methods</h3>
      <p className="mt-1 text-xs text-muted">
        The options shown in every payment dropdown — Income, Expenses, Invoices and Collect Payment. The order here is the order in the dropdowns.
        Removing one only hides it for new records; existing records keep their method.
      </p>

      {methods === null ? (
        <div className="mt-4"><SkeletonList count={5} /></div>
      ) : (
        <>
          <ul className="mt-4 space-y-2">
            {methods.map((method, index) => (
              <li key={index} className="flex items-center gap-2 rounded-xl border border-border-subtle bg-page p-2">
                <input
                  value={method}
                  onChange={(event) => rename(index, event.target.value)}
                  onKeyDown={stopEnterSubmit}
                  maxLength={40}
                  aria-label={`Payment method ${index + 1}`}
                  className="min-w-0 flex-1 rounded-lg border border-border-subtle bg-card px-3 py-2 text-sm text-ink outline-none focus:ring-2 focus:ring-primary"
                />
                <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label="Move up" className="rounded-lg p-2 text-muted hover:bg-card disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                <button type="button" onClick={() => move(index, 1)} disabled={index === methods.length - 1} aria-label="Move down" className="rounded-lg p-2 text-muted hover:bg-card disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
                <button type="button" onClick={() => remove(index)} disabled={methods.length <= 1} aria-label={`Remove ${method}`} className="rounded-lg p-2 text-primary hover:bg-active disabled:opacity-30"><Trash2 className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>

          <div className="mt-3 flex gap-2">
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); add(); } }}
              maxLength={40}
              placeholder="Add a method, e.g. GrabPay"
              className="min-w-0 flex-1 rounded-xl border border-border-subtle bg-card px-3 py-2 text-sm text-ink outline-none focus:ring-2 focus:ring-primary"
            />
            <button type="button" onClick={add} disabled={!draft.trim()} className="inline-flex items-center gap-1 rounded-xl border border-border-subtle px-3 py-2 text-xs font-bold text-ink hover:bg-page disabled:opacity-40">
              <Plus className="h-4 w-4" /> Add
            </button>
          </div>

          {error && <p className="mt-3 rounded-xl bg-active p-3 text-xs text-primary">{error}</p>}

          <div className="mt-4 flex justify-end">
            <button type="button" onClick={save} disabled={saving || !methods.some((item) => item.trim())} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60">
              {saving ? "Saving..." : "Save Payment Methods"}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
