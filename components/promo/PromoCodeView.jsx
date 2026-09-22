"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import {
  ArrowRight, Check, Copy, LayoutGrid, List, PiggyBank, Plus, QrCode as QrCodeIcon,
  Search, Tag, TicketPercent, Trash2, TrendingUp, Truck, Users, UsersRound, Wallet,
} from "lucide-react";
import StatCard from "../finance/StatCard";
import { formatDate, formatMoney } from "../training/PaymentHistoryTable";
import {
  bulkGeneratePromoCodes, createPromoCode, deletePromoCode, loadPromoCodes, redeemPromoCode,
} from "../../lib/services/promo-service";
import { PROMO_TYPES } from "../../lib/promo-shared";
import { useToast } from "../ui/Toast";
import { useConfirm } from "../ui/ConfirmDialog";
import { SkeletonGrid } from "../ui/Skeleton";

const TYPE_META = {
  percentage: { icon: TicketPercent, tone: "bg-active text-primary", label: (promo) => `${promo.value}% OFF` },
  fixed: { icon: Wallet, tone: "bg-success-soft text-success", label: (promo) => `${formatMoney(promo.value)} OFF` },
  shipping: { icon: Truck, tone: "bg-warning-soft text-warning", label: () => "FREE SHIPPING" },
};
const STATUS_TONE = { Active: "bg-success-soft text-success", Expired: "bg-active text-primary", "Used up": "bg-page text-muted" };
const today = () => new Date().toISOString().slice(0, 10);

function promoStatus(promo) {
  if (promo.expiry && promo.expiry < today()) return "Expired";
  if (promo.limit && promo.used >= promo.limit) return "Used up";
  return "Active";
}

function TypeBadge({ promo }) {
  const meta = TYPE_META[promo.type] || TYPE_META.percentage;
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${meta.tone}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {meta.label(promo)}
    </span>
  );
}

function CopyButton({ code }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked (insecure origin, permissions) — nothing useful to show.
    }
  }
  return (
    <button type="button" onClick={copy} className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline">
      {copied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function PromoCard({ promo, onViewQr, onDelete }) {
  const status = promoStatus(promo);
  const percent = promo.limit ? Math.min(100, Math.round((promo.used / promo.limit) * 100)) : 0;
  return (
    <article className="flex flex-col justify-between rounded-2xl border border-border-subtle bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
      <div>
        <div className="mb-3 flex items-center justify-between gap-2">
          <TypeBadge promo={promo} />
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => onViewQr(promo)} title="View QR & details" className="rounded-lg p-1.5 text-subtle hover:bg-active hover:text-primary">
              <QrCodeIcon className="h-4 w-4" aria-hidden="true" />
            </button>
            <button type="button" onClick={() => onDelete(promo)} title="Delete coupon" className="rounded-lg p-1.5 text-subtle hover:bg-active hover:text-primary">
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h4 className="font-mono text-lg font-bold tracking-wide text-ink">{promo.code}</h4>
          <CopyButton code={promo.code} />
        </div>
        <p className="mb-4 line-clamp-2 text-xs text-muted">{promo.description || "No additional description provided."}</p>
      </div>
      <div className="space-y-3 border-t border-border-subtle pt-4">
        <div className="flex justify-between text-xs font-medium text-muted">
          <span>Usage Limit</span>
          <span>{promo.used} / {promo.limit} used</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-page" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Usage">
          <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-subtle">Expires: {formatDate(promo.expiry)}</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_TONE[status]}`}>{status}</span>
        </div>
      </div>
    </article>
  );
}

function PromoRow({ promo, onViewQr, onDelete }) {
  const status = promoStatus(promo);
  const percent = promo.limit ? Math.min(100, Math.round((promo.used / promo.limit) * 100)) : 0;
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 p-4 hover:bg-page">
      <div className="w-36 shrink-0"><TypeBadge promo={promo} /></div>
      <div className="min-w-[180px] flex-1">
        <div className="flex items-center gap-3">
          <b className="font-mono text-sm tracking-wide text-ink">{promo.code}</b>
          <CopyButton code={promo.code} />
        </div>
        <p className="mt-0.5 line-clamp-1 text-xs text-muted">{promo.description || "No additional description provided."}</p>
      </div>
      <div className="w-40 shrink-0 space-y-1.5">
        <span className="text-[11px] font-medium text-muted">{promo.used} / {promo.limit} used</span>
        <div className="h-2 w-full overflow-hidden rounded-full bg-page" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Usage">
          <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
        </div>
      </div>
      <span className="w-28 shrink-0 text-xs text-subtle">Expires {formatDate(promo.expiry)}</span>
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_TONE[status]}`}>{status}</span>
      <div className="ml-auto flex shrink-0 items-center gap-1">
        <button type="button" onClick={() => onViewQr(promo)} title="View QR & details" className="rounded-lg p-1.5 text-subtle hover:bg-active hover:text-primary">
          <QrCodeIcon className="h-4 w-4" aria-hidden="true" />
        </button>
        <button type="button" onClick={() => onDelete(promo)} title="Delete coupon" className="rounded-lg p-1.5 text-subtle hover:bg-active hover:text-primary">
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

const VIEW_MODES = [
  { id: "grid", label: "Grid", icon: LayoutGrid },
  { id: "list", label: "List", icon: List },
];

const blankPromo = { code: "", type: "percentage", value: "20", limit: "100", expiry: "", description: "" };
const blankBulk = { type: "percentage", orgName: "Org Member Batch", expiry: "" };

// Real, Firestore-backed promo code manager — Director "Promo Codes" tab.
// No mock data anywhere: every stat, code, and redemption below is read
// from / written to /api/admin/promo-codes (lib/server/promo-core.js).
// Deliberately grid-only (no list/table view).
export default function PromoCodeView() {
  const toast = useToast();
  const confirm = useConfirm();
  const [promos, setPromos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [view, setView] = useState("grid");

  const load = () => {
    setLoading(true);
    loadPromoCodes()
      .then((data) => {
        setPromos(data.promos || []);
        setError("");
      })
      .catch((err) => setError(err.message || "Unable to load promo codes."))
      .finally(() => setLoading(false));
  };
  useEffect(() => { void Promise.resolve().then(load); }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return promos.filter((promo) => {
      const matchesQuery = !query || promo.code.toLowerCase().includes(query) || promo.description.toLowerCase().includes(query);
      const matchesType = typeFilter === "all" || promo.type === typeFilter;
      return matchesQuery && matchesType;
    });
  }, [promos, search, typeFilter]);

  const stats = useMemo(() => {
    const active = promos.filter((promo) => promoStatus(promo) === "Active").length;
    const totalUsed = promos.reduce((sum, promo) => sum + (promo.used || 0), 0);
    const totalLimit = promos.reduce((sum, promo) => sum + (promo.limit || 0), 0);
    const totalSaved = promos.reduce((sum, promo) => sum + (promo.totalSaved || 0), 0);
    return {
      active,
      totalUsed,
      totalSaved,
      // Real usage-of-capacity rate — how much of the granted redemption
      // limit has actually been used — not a fabricated constant.
      conversion: totalLimit ? (totalUsed / totalLimit) * 100 : 0,
    };
  }, [promos]);

  // ---- Live redemption simulator ----
  const [simCode, setSimCode] = useState("");
  const [simAmount, setSimAmount] = useState("");
  const [simBusy, setSimBusy] = useState(false);
  const [simFeedback, setSimFeedback] = useState(null);

  async function applyCode() {
    const code = simCode.trim();
    if (!code) return setSimFeedback({ ok: false, message: "Please enter a coupon code to test." });
    setSimBusy(true);
    setSimFeedback(null);
    try {
      const result = await redeemPromoCode({ code, orderAmount: simAmount === "" ? undefined : simAmount });
      const savedText = result.type === "shipping" ? "Free shipping applied!" : `${formatMoney(result.discount)} saved!`;
      setSimFeedback({ ok: true, message: `Coupon "${result.code}" verified. ${savedText}` });
      setSimCode("");
      load();
    } catch (err) {
      setSimFeedback({ ok: false, message: err.message || "Unable to apply this code." });
    } finally {
      setSimBusy(false);
    }
  }

  // ---- Create promo ----
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState(blankPromo);
  const [savingCreate, setSavingCreate] = useState(false);
  const [createMessage, setCreateMessage] = useState("");

  function openCreate() {
    setCreateForm(blankPromo);
    setCreateMessage("");
    setCreating(true);
  }
  async function submitCreate(event) {
    event.preventDefault();
    setSavingCreate(true);
    setCreateMessage("");
    try {
      await createPromoCode(createForm);
      toast.success("Promotion created successfully");
      setCreating(false);
      load();
    } catch (err) {
      setCreateMessage(err.message || "Unable to create this promotion.");
    } finally {
      setSavingCreate(false);
    }
  }

  // ---- Bulk generate ----
  const [bulking, setBulking] = useState(false);
  const [bulkForm, setBulkForm] = useState(blankBulk);
  const [savingBulk, setSavingBulk] = useState(false);
  const [bulkMessage, setBulkMessage] = useState("");

  function openBulk() {
    setBulkForm(blankBulk);
    setBulkMessage("");
    setBulking(true);
  }
  async function submitBulk() {
    setSavingBulk(true);
    setBulkMessage("");
    try {
      const result = await bulkGeneratePromoCodes(bulkForm);
      toast.success(`Generated ${result.count} individual codes successfully`);
      setBulking(false);
      load();
    } catch (err) {
      setBulkMessage(err.message || "Unable to generate codes.");
    } finally {
      setSavingBulk(false);
    }
  }

  // ---- Delete ----
  function remove(promo) {
    return confirm({
      title: "Delete coupon",
      message: `Delete coupon "${promo.code}"? This cannot be undone.`,
      tone: "danger",
      confirmLabel: "Delete",
      onConfirm: async () => {
        await deletePromoCode(promo.id);
        toast.success("Coupon deleted successfully");
        load();
      },
    });
  }

  // ---- QR / details modal ----
  const [viewing, setViewing] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  useEffect(() => {
    if (!viewing) return;
    let cancelled = false;
    QRCode.toDataURL(viewing.code, { margin: 1, width: 220 })
      .then((url) => { if (!cancelled) setQrDataUrl(url); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [viewing]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-primary">Marketing</p>
          <h2 className="mt-1 text-2xl font-black text-ink">Promo Codes</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={openBulk} className="inline-flex items-center gap-2 rounded-xl bg-success px-4 py-2.5 text-xs font-bold text-white shadow-sm">
            <UsersRound className="h-4 w-4" aria-hidden="true" />
            Generate Bulk (100)
          </button>
          <button type="button" onClick={openCreate} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-white shadow-sm">
            <Plus className="h-4 w-4" aria-hidden="true" />
            Create Promo
          </button>
        </div>
      </div>

      {error && <p className="rounded-xl bg-active p-4 text-sm text-primary">{error}</p>}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active Promos" value={stats.active} icon={Tag} iconBg="bg-success-soft" iconColor="text-success" loading={loading} />
        <StatCard label="Total Redemptions" value={stats.totalUsed} icon={Users} iconBg="bg-active" iconColor="text-primary" loading={loading} />
        <StatCard label="Total Revenue Saved" value={stats.totalSaved} format={formatMoney} icon={PiggyBank} iconBg="bg-warning-soft" iconColor="text-warning" loading={loading} />
        <StatCard label="Capacity Used" value={stats.conversion} format={(v) => `${v.toFixed(1)}%`} icon={TrendingUp} iconBg="bg-purple-soft" iconColor="text-purple" loading={loading} />
      </section>

      <section className="relative overflow-hidden rounded-3xl border border-[#f3aaaa] bg-[linear-gradient(120deg,#fff0f0_0%,#fff7f7_45%,#ffffff_100%)] p-6 text-ink shadow-xl sm:p-8">
        <div className="relative z-10 max-w-2xl">
          <span className="mb-3 inline-block rounded-full bg-active px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">Live Checkout Simulator</span>
          <h3 className="text-xl font-bold text-ink sm:text-2xl">Test &amp; Redeem a Promo Code</h3>
          <p className="mt-1 text-sm text-muted">Apply a real order amount to see the exact discount a percentage code would give — nothing here is estimated.</p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <input
              value={simCode}
              onChange={(e) => setSimCode(e.target.value)}
              placeholder="Enter coupon code (e.g. WELCOME20)"
              className="flex-1 rounded-xl border border-border-subtle bg-card px-4 py-3 text-sm uppercase text-ink outline-none focus:ring-2 focus:ring-primary"
            />
            <input
              value={simAmount}
              onChange={(e) => setSimAmount(e.target.value)}
              type="number"
              min="0"
              step="0.01"
              placeholder="Order amount (for % codes)"
              className="w-full rounded-xl border border-border-subtle bg-card px-4 py-3 text-sm text-ink outline-none focus:ring-2 focus:ring-primary sm:w-56"
            />
            <button type="button" onClick={applyCode} disabled={simBusy || !simCode.trim()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-white shadow-md disabled:opacity-60">
              {simBusy ? "Applying…" : "Apply Code"}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          {simFeedback && (
            <p className={`mt-3 rounded-xl border px-3 py-2 text-sm ${simFeedback.ok ? "border-success/30 bg-success-soft text-success" : "border-[#f3aaaa] bg-active text-primary"}`}>
              {simFeedback.message}
            </p>
          )}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <h3 className="text-lg font-bold text-ink">Active &amp; Scheduled Promotions</h3>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <label className="relative min-w-[180px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-subtle" aria-hidden="true" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search codes…" className="w-full rounded-xl border border-border-subtle bg-card py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary" />
            </label>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="rounded-xl border border-border-subtle bg-card px-3 py-2 text-sm">
              <option value="all">All Types</option>
              <option value="percentage">Percentage (%)</option>
              <option value="fixed">Fixed Amount</option>
              <option value="shipping">Free Shipping</option>
            </select>
            <div role="group" aria-label="View mode" className="inline-flex rounded-xl border border-border-subtle bg-card p-1">
              {VIEW_MODES.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={view === id}
                  onClick={() => setView(id)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold ${view === id ? "bg-primary text-white" : "text-muted hover:bg-active"}`}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading ? (
          <SkeletonGrid count={6} className="grid gap-5 md:grid-cols-2 lg:grid-cols-3" />
        ) : !filtered.length ? (
          <p className="rounded-2xl border border-dashed border-border-subtle bg-card p-8 text-center text-sm text-muted">No promotional codes found matching your criteria.</p>
        ) : view === "grid" ? (
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((promo) => <PromoCard key={promo.id} promo={promo} onViewQr={setViewing} onDelete={remove} />)}
          </div>
        ) : (
          <div className="divide-y divide-border-subtle overflow-hidden rounded-2xl border border-border-subtle bg-card shadow-sm">
            {filtered.map((promo) => <PromoRow key={promo.id} promo={promo} onViewQr={setViewing} onDelete={remove} />)}
          </div>
        )}
      </section>

      {creating && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 py-8">
          <div className="w-full max-w-lg rounded-3xl bg-card p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-ink">Create New Promotion</h3>
              <button type="button" onClick={() => setCreating(false)} className="text-xl text-muted" aria-label="Close">×</button>
            </div>
            <form onSubmit={submitCreate} className="space-y-4">
              <label className="grid gap-1 text-xs font-bold text-muted">
                Coupon Code
                <input required value={createForm.code} onChange={(e) => setCreateForm({ ...createForm, code: e.target.value })} placeholder="e.g. SUMMER50" className="rounded-xl border border-border-subtle bg-page px-3 py-2.5 text-sm font-mono uppercase text-ink outline-none focus:ring-2 focus:ring-primary" />
              </label>
              <div className="grid grid-cols-2 gap-4">
                <label className="grid gap-1 text-xs font-bold text-muted">
                  Discount Type
                  <select value={createForm.type} onChange={(e) => setCreateForm({ ...createForm, type: e.target.value })} className="rounded-xl border border-border-subtle bg-page px-3 py-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-primary">
                    {PROMO_TYPES.map((type) => <option key={type} value={type}>{type === "percentage" ? "Percentage Off (%)" : type === "fixed" ? "Fixed Amount" : "Free Shipping"}</option>)}
                  </select>
                </label>
                <label className="grid gap-1 text-xs font-bold text-muted">
                  {createForm.type === "percentage" ? "Discount Percentage" : createForm.type === "fixed" ? "Discount Amount" : "Value (N/A)"}
                  <input type="number" min="1" disabled={createForm.type === "shipping"} required={createForm.type !== "shipping"} value={createForm.value} onChange={(e) => setCreateForm({ ...createForm, value: e.target.value })} className="rounded-xl border border-border-subtle bg-page px-3 py-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-primary disabled:opacity-50" />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <label className="grid gap-1 text-xs font-bold text-muted">
                  Usage Limit
                  <input type="number" min="1" required value={createForm.limit} onChange={(e) => setCreateForm({ ...createForm, limit: e.target.value })} className="rounded-xl border border-border-subtle bg-page px-3 py-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-primary" />
                </label>
                <label className="grid gap-1 text-xs font-bold text-muted">
                  Expiration Date
                  <input type="date" required value={createForm.expiry} onChange={(e) => setCreateForm({ ...createForm, expiry: e.target.value })} className="rounded-xl border border-border-subtle bg-page px-3 py-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-primary" />
                </label>
              </div>
              <label className="grid gap-1 text-xs font-bold text-muted">
                Description / Tag
                <input value={createForm.description} onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })} placeholder="e.g. Summer sale special for all users" className="rounded-xl border border-border-subtle bg-page px-3 py-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-primary" />
              </label>
              {createMessage && <p className="text-xs text-primary">{createMessage}</p>}
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setCreating(false)} disabled={savingCreate} className="rounded-xl border border-border-subtle px-5 py-2.5 text-sm font-medium text-ink">Cancel</button>
                <button type="submit" disabled={savingCreate} className="rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-white shadow-md disabled:opacity-60">{savingCreate ? "Saving…" : "Save Promotion"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {bulking && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 py-8">
          <div className="w-full max-w-md rounded-3xl bg-card p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-lg font-bold text-ink"><UsersRound className="h-5 w-5 text-success" aria-hidden="true" /> Generate 100 Org Promos</h3>
              <button type="button" onClick={() => setBulking(false)} className="text-xl text-muted" aria-label="Close">×</button>
            </div>
            <p className="mb-4 text-xs text-muted">
              Batch-generates <b>100 unique 8-character promo codes</b> (format <code className="rounded bg-page px-1.5 py-0.5 font-mono text-success">NEXTXXXX</code>) for team members or clients — one use each.
            </p>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <label className="grid gap-1 text-xs font-bold text-muted">
                  Discount Type
                  <select value={bulkForm.type} onChange={(e) => setBulkForm({ ...bulkForm, type: e.target.value })} className="rounded-xl border border-border-subtle bg-page px-3 py-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-success">
                    <option value="percentage">Percentage Off (25%)</option>
                    <option value="fixed">Fixed Amount ({formatMoney(20)})</option>
                    <option value="shipping">Free Shipping</option>
                  </select>
                </label>
                <label className="grid gap-1 text-xs font-bold text-muted">
                  Organization Name
                  <input value={bulkForm.orgName} onChange={(e) => setBulkForm({ ...bulkForm, orgName: e.target.value })} placeholder="e.g. Enterprise Partner" className="rounded-xl border border-border-subtle bg-page px-3 py-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-success" />
                </label>
              </div>
              <label className="grid gap-1 text-xs font-bold text-muted">
                Expiration Date
                <input type="date" value={bulkForm.expiry} onChange={(e) => setBulkForm({ ...bulkForm, expiry: e.target.value })} className="rounded-xl border border-border-subtle bg-page px-3 py-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-success" />
              </label>
              {bulkMessage && <p className="text-xs text-primary">{bulkMessage}</p>}
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setBulking(false)} disabled={savingBulk} className="rounded-xl border border-border-subtle px-5 py-2.5 text-sm font-medium text-ink">Cancel</button>
                <button type="button" onClick={submitBulk} disabled={savingBulk} className="inline-flex items-center gap-2 rounded-xl bg-success px-5 py-2.5 text-sm font-medium text-white shadow-md disabled:opacity-60">{savingBulk ? "Generating…" : "Generate 100 Codes"}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {viewing && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-sm space-y-4 rounded-3xl bg-card p-6 text-center shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-ink">Promo Details &amp; QR</h3>
              <button type="button" onClick={() => { setViewing(null); setQrDataUrl(""); }} className="text-lg text-muted" aria-label="Close">×</button>
            </div>
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-page p-6">
              <div className="inline-block rounded-xl bg-white p-3 shadow-inner">
                {qrDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={qrDataUrl} alt={`QR code for ${viewing.code}`} className="h-40 w-40" />
                ) : (
                  <div className="grid h-40 w-40 place-items-center text-subtle"><QrCodeIcon className="h-10 w-10" aria-hidden="true" /></div>
                )}
              </div>
              <span className="font-mono text-lg font-bold tracking-wider text-primary">{viewing.code}</span>
            </div>
            <p className="text-xs text-muted">{viewing.description || "No additional description provided."}</p>
            <button type="button" onClick={() => { navigator.clipboard?.writeText(viewing.code).catch(() => {}); setViewing(null); setQrDataUrl(""); }} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-medium text-white shadow-sm">
              <Copy className="h-4 w-4" aria-hidden="true" /> Copy Promo Code
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
