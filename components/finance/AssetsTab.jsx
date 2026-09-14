"use client";

import { useEffect, useMemo, useState } from "react";
import { stopEnterSubmit } from "../../lib/ui/keyboard";
import { createAsset, deleteAsset as deleteAssetRequest, loadAssets, updateAsset } from "../../lib/services/finance-service";
import { formatDate, formatMoney } from "../training/PaymentHistoryTable";
import { useConfirm } from "../ui/ConfirmDialog";
import DataTable, { StatusBadge } from "../data-table/DataTable";

const categories = ["Furniture", "Equipment", "Technology", "Deposit", "Renovation", "Other"];
const statuses = ["Active", "Disposed"];
const statusTone = { Active: "green", Disposed: "gray" };

function Dialog({ title, children, close }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4" role="dialog" aria-modal="true">
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-card p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold">{title}</h3>
          <button type="button" onClick={close} className="text-xl text-muted" aria-label="Close">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function AssetForm({ initial, saving, onCancel, onSubmit }) {
  const [form, setForm] = useState(
    initial || { itemName: "", category: "", quantity: "1", unitCost: "", purchaseDate: new Date().toISOString().slice(0, 10), status: "Active", description: "", reference: "" },
  );
  const [error, setError] = useState("");
  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value });

  const quantityNum = form.quantity === "" ? null : Number(form.quantity);
  const unitCostNum = form.unitCost === "" ? null : Number(form.unitCost);
  const quantityError = quantityNum !== null && quantityNum <= 0 ? "Quantity must be greater than zero." : null;
  const unitCostError = unitCostNum !== null && unitCostNum < 0 ? "Unit cost cannot be negative." : null;
  const totalValue = quantityNum && unitCostNum !== null ? quantityNum * unitCostNum : null;

  async function submit(event) {
    event.preventDefault();
    if (!form.itemName.trim()) return setError("Item name is required.");
    if (!form.category) return setError("Choose an asset category.");
    if (quantityNum === null || quantityError) return setError(quantityError || "Enter a quantity.");
    if (unitCostNum === null || unitCostError) return setError(unitCostError || "Enter a unit cost.");
    if (!form.purchaseDate) return setError("Purchase date is required.");
    setError("");
    try {
      await onSubmit({ ...form, quantity: quantityNum, unitCost: unitCostNum });
    } catch (err) {
      setError(err.message || "Unable to save this asset.");
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="grid gap-1 text-xs font-bold text-muted">
        Item Name
        <input value={form.itemName} onChange={set("itemName")} onKeyDown={stopEnterSubmit} placeholder="e.g. Tables, Projector, 2-Month Deposit" className="rounded-xl border border-border-subtle px-3 py-2.5 text-sm font-normal" />
      </label>
      <label className="grid gap-1 text-xs font-bold text-muted">
        Category
        <select value={form.category} onChange={set("category")} className="rounded-xl border border-border-subtle px-3 py-2.5 text-sm">
          <option value="">Choose a category</option>
          {categories.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="grid gap-1 text-xs font-bold text-muted">
          Quantity
          <input type="number" min="1" step="1" value={form.quantity} onChange={set("quantity")} onKeyDown={stopEnterSubmit} className={`rounded-xl border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary ${quantityError ? "border-primary" : "border-border-subtle"}`} />
          {quantityError && <span className="text-[11px] font-semibold text-primary">{quantityError}</span>}
        </label>
        <label className="grid gap-1 text-xs font-bold text-muted">
          Unit Cost
          <span className="relative block">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-subtle">S$</span>
            <input type="number" min="0" step="0.01" value={form.unitCost} onChange={set("unitCost")} onKeyDown={stopEnterSubmit} className={`w-full rounded-xl border px-3 py-2.5 pl-8 text-sm outline-none focus:ring-2 focus:ring-primary ${unitCostError ? "border-primary" : "border-border-subtle"}`} />
          </span>
          {unitCostError && <span className="text-[11px] font-semibold text-primary">{unitCostError}</span>}
        </label>
      </div>
      {totalValue !== null && !quantityError && !unitCostError && (
        <p className="rounded-xl bg-page px-3 py-2 text-xs font-bold text-muted">Total value: <span className="text-ink">{formatMoney(totalValue)}</span></p>
      )}
      <label className="grid gap-1 text-xs font-bold text-muted">
        Purchase Date
        <input type="date" value={form.purchaseDate} onChange={set("purchaseDate")} className="rounded-xl border border-border-subtle px-3 py-2.5 text-sm" />
      </label>
      <label className="grid gap-1 text-xs font-bold text-muted">
        Status
        <select value={form.status} onChange={set("status")} className="rounded-xl border border-border-subtle px-3 py-2.5 text-sm">
          {statuses.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-xs font-bold text-muted">
        Description (optional)
        <textarea value={form.description} onChange={set("description")} rows={2} className="rounded-xl border border-border-subtle px-3 py-2.5 text-sm font-normal" />
      </label>
      <label className="grid gap-1 text-xs font-bold text-muted">
        Reference (optional)
        <input value={form.reference} onChange={set("reference")} onKeyDown={stopEnterSubmit} className="rounded-xl border border-border-subtle px-3 py-2.5 text-sm font-normal" />
      </label>
      {error && <p className="rounded-xl bg-active p-3 text-xs text-primary">{error}</p>}
      <div className="flex justify-end gap-3">
        <button type="button" onClick={onCancel} disabled={saving} className="px-4 py-2 text-sm font-bold text-muted">Cancel</button>
        <button disabled={saving || Boolean(quantityError) || Boolean(unitCostError)} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
          {saving ? "Saving..." : "Save Asset"}
        </button>
      </div>
    </form>
  );
}

// Finance → Assets: a register of what the academy owns and what it's
// worth (furniture, equipment, deposits, renovation) — distinct from the
// Expenses ledger. Self-fetches (like Outstanding Due / Profit & Loss)
// rather than riding the shared Finance overview, since an owned asset's
// value isn't part of the Income/Expense P&L calculation.
export default function AssetsTab() {
  const confirm = useConfirm();
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function load() {
    setLoading(true);
    loadAssets()
      .then((result) => { setAssets(result.assets || []); setError(""); })
      .catch((err) => setError(err.message || "Unable to load assets."))
      .finally(() => setLoading(false));
  }

  useEffect(() => { void Promise.resolve().then(load); }, []);

  const totalValue = useMemo(
    () => assets.filter((item) => item.status !== "Disposed").reduce((sum, item) => sum + (Number(item.totalValue) || 0), 0),
    [assets],
  );
  const activeCount = useMemo(() => assets.filter((item) => item.status !== "Disposed").length, [assets]);

  const columns = useMemo(() => [
    { key: "itemName", header: "Item", sortable: true, accessor: (a) => a.itemName || "", render: (a) => <b className="text-ink">{a.itemName}</b> },
    { key: "category", header: "Category", sortable: true, filter: {}, accessor: (a) => a.category || "", render: (a) => <StatusBadge tone="purple">{a.category}</StatusBadge> },
    { key: "quantity", header: "Qty", align: "right", sortable: true, accessor: (a) => Number(a.quantity || 0) },
    { key: "unitCost", header: "Unit Cost", align: "right", sortable: true, accessor: (a) => Number(a.unitCost || 0), render: (a) => formatMoney(a.unitCost), exportValue: (a) => Number(a.unitCost || 0) },
    { key: "totalValue", header: "Total Value", align: "right", sortable: true, accessor: (a) => Number(a.totalValue || 0), render: (a) => <b className="text-warning">{formatMoney(a.totalValue)}</b>, exportValue: (a) => Number(a.totalValue || 0) },
    { key: "purchaseDate", header: "Purchased", sortable: true, accessor: (a) => a.purchaseDate || "", exportValue: (a) => a.purchaseDate || "", render: (a) => <span className="text-xs">{formatDate(a.purchaseDate)}</span> },
    { key: "status", header: "Status", sortable: true, filter: {}, accessor: (a) => a.status || "", render: (a) => <StatusBadge tone={statusTone[a.status] || "gray"}>{a.status}</StatusBadge> },
    { key: "recordedByName", header: "Recorded By", sortable: true, accessor: (a) => a.recordedByName || "" },
  ], []);

  async function handleCreate(values) {
    setSaving(true);
    try {
      await createAsset(values);
      setMessage("Asset added.");
      setAdding(false);
      load();
    } finally {
      setSaving(false);
    }
  }
  async function handleUpdate(values) {
    setSaving(true);
    try {
      await updateAsset(editing.id, values);
      setMessage("Asset updated.");
      setEditing(null);
      load();
    } finally {
      setSaving(false);
    }
  }
  async function handleDelete(asset) {
    if (!(await confirm({
      title: "Delete asset",
      message: `Delete "${asset.itemName}" from the asset register? This cannot be undone.`,
      tone: "danger",
      confirmLabel: "Delete",
    }))) return;
    setError("");
    try {
      await deleteAssetRequest(asset.id);
      setMessage("Asset deleted.");
      load();
    } catch (err) {
      setError(err.message || "Unable to delete this asset.");
    }
  }

  return (
    <section className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-3xl border border-border-subtle bg-card p-5 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted">Total Asset Value</p>
          <p className="mt-1 text-2xl font-black text-ink">{formatMoney(totalValue)}</p>
        </div>
        <div className="rounded-3xl border border-border-subtle bg-card p-5 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted">Active Assets</p>
          <p className="mt-1 text-2xl font-black text-ink">{activeCount}</p>
        </div>
      </div>

      <div className="rounded-3xl border border-border-subtle bg-card p-5 shadow-sm md:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-bold text-ink">What we own and what it&apos;s worth</p>
          <button type="button" onClick={() => setAdding(true)} className="rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-white">
            + Add Asset
          </button>
        </div>

        {message && <p className="mb-3 rounded-xl bg-success-soft p-3 text-xs text-success">{message}</p>}
        {error && <p className="mb-3 rounded-xl bg-active p-3 text-xs text-primary">{error}</p>}

        <DataTable
          title="assets"
          name="assets"
          columns={columns}
          rows={assets}
          loading={loading}
          initialSort={{ key: "purchaseDate", dir: "desc" }}
          pageSize={10}
          emptyLabel="No assets recorded yet."
          rowActions={(item) => (
            <>
              <button type="button" onClick={() => setEditing(item)} className="rounded-lg border border-border-subtle px-2.5 py-1.5 text-[11px] font-bold text-ink hover:bg-page">Edit</button>
              <button type="button" onClick={() => handleDelete(item)} className="rounded-lg border border-border-subtle px-2.5 py-1.5 text-[11px] font-bold text-primary hover:bg-page">Delete</button>
            </>
          )}
        />
      </div>

      {adding && (
        <Dialog title="Add Asset" close={() => setAdding(false)}>
          <AssetForm saving={saving} onCancel={() => setAdding(false)} onSubmit={handleCreate} />
        </Dialog>
      )}
      {editing && (
        <Dialog title="Edit Asset" close={() => setEditing(null)}>
          <AssetForm initial={editing} saving={saving} onCancel={() => setEditing(null)} onSubmit={handleUpdate} />
        </Dialog>
      )}
    </section>
  );
}
