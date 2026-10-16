"use client";

import { useMemo, useState } from "react";
import {
  ArrowRight, Ban, CalendarDays, Check, ChevronLeft, ChevronRight, ChevronsUpDown, ChevronDown, ChevronUp,
  FileSpreadsheet, FileText, Filter, Loader2, PackageCheck, Pencil, Plus, Search, ShieldCheck, SlidersHorizontal,
  Trash2, Warehouse, X, BadgeDollarSign,
} from "lucide-react";
import ShopAnalytics, { money, quantityOf, statusOf } from "./ShopAnalytics";
import ExportMenu from "../data-table/ExportMenu";
import { useDataTable } from "../../lib/data-table/useDataTable";
import { runExport } from "../../lib/data-table/export";
import { checkout, deleteOrder, updateOrderDetails, updateOrderStatus, updateProduct } from "../../lib/shop-data";
import { usePaymentMethods } from "../../lib/services/payment-methods-service";
import { useToast } from "../ui/Toast";
import { useConfirm } from "../ui/ConfirmDialog";

const LOW_STOCK = 5;
export const ORDER_STATUS = {
  pending: { label: "Pending pickup", className: "border-warning/30 bg-warning-soft text-warning" },
  fulfilled: { label: "Delivered", className: "border-success/30 bg-success-soft text-success" },
  cancelled: { label: "Cancelled", className: "border-red-line bg-active text-primary" },
};
const input = "w-full rounded-xl border border-border-subtle bg-page px-3 py-2 text-xs text-ink placeholder:text-subtle focus:border-primary focus:outline-none";
const todayLocal = () => new Date().toLocaleDateString("en-CA");
const itemText = (item) => `${item.name}${item.variantLabel ? ` (${item.variantLabel})` : ""} × ${item.quantity}`;
const customerName = (order) => order.customerName || order.buyerName || "";
const customerEmail = (order) => order.customerEmail || order.buyerEmail || "";

function formatDate(value) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function OrderStatusPill({ status }) {
  const meta = ORDER_STATUS[status || "pending"] || ORDER_STATUS.pending;
  return <span className={`whitespace-nowrap rounded-full border px-2.5 py-1 text-[10px] font-semibold ${meta.className}`}>{meta.label}</span>;
}

function Modal({ title, icon: Icon, iconClass, subtitle, onClose, children, footer, wide }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={title}>
      <div className={`relative flex max-h-[90vh] w-full flex-col rounded-2xl border border-border-subtle bg-card shadow-2xl ${wide ? "max-w-2xl" : "max-w-lg"}`}>
        <button type="button" onClick={onClose} className="absolute right-4 top-4 rounded-lg p-1 text-subtle hover:bg-page hover:text-ink" aria-label="Close">
          <X className="h-5 w-5" />
        </button>
        <div className="px-6 pt-6">
          <h3 className="flex items-center gap-2 pr-8 text-lg font-bold text-ink"><Icon className={`h-5 w-5 ${iconClass}`} aria-hidden="true" />{title}</h3>
          {subtitle && <p className="mt-1 text-xs text-muted">{subtitle}</p>}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
        <div className="flex justify-end gap-3 border-t border-border-subtle px-6 py-4">{footer}</div>
      </div>
    </div>
  );
}

const secondaryButton = "rounded-xl border border-border-subtle bg-page px-4 py-2 text-xs font-semibold text-ink hover:bg-active disabled:opacity-60";

// ---- Manage Inventory Stock ----------------------------------------------
function InventoryModal({ products, onClose }) {
  const toast = useToast();
  // Draft stock per product (plain) or per variant id (sized products).
  const [draft, setDraft] = useState(() => Object.fromEntries(products.map((product) => [
    product.id,
    Array.isArray(product.variants) && product.variants.length
      ? Object.fromEntries(product.variants.map((variant) => [variant.id, String(variant.stock ?? 0)]))
      : String(product.stock ?? 0),
  ])));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const sorted = useMemo(() => [...products].sort((a, b) => (a.stock || 0) - (b.stock || 0) || a.name.localeCompare(b.name)), [products]);

  async function save() {
    const updates = [];
    for (const product of products) {
      const value = draft[product.id];
      if (typeof value === "string") {
        const stock = Number(value);
        if (!Number.isInteger(stock) || stock < 0) return setError(`Enter a whole number of 0 or more for ${product.name}.`);
        if (stock !== (product.stock || 0)) updates.push({ id: product.id, stock });
      } else {
        let changed = false;
        const variants = product.variants.map((variant) => {
          const stock = Number(value[variant.id]);
          if (stock !== (variant.stock || 0)) changed = true;
          return { ...variant, stock };
        });
        const bad = variants.find((variant) => !Number.isInteger(variant.stock) || variant.stock < 0);
        if (bad) return setError(`Enter a whole number of 0 or more for ${product.name} (${bad.label}).`);
        if (changed) updates.push({ id: product.id, variants });
      }
    }
    if (!updates.length) return onClose();
    setSaving(true);
    setError("");
    const results = await Promise.allSettled(updates.map((update) => updateProduct(update)));
    setSaving(false);
    const failed = results.filter((result) => result.status === "rejected");
    if (failed.length) {
      setError(failed[0].reason?.message || "Some stock levels could not be saved.");
      if (failed.length < updates.length) toast.warning(`Saved ${updates.length - failed.length} of ${updates.length} products.`);
      return;
    }
    toast.success(`Stock updated for ${updates.length} product${updates.length === 1 ? "" : "s"}.`);
    onClose();
  }

  return (
    <Modal
      title="Manage Inventory Stock"
      icon={Warehouse}
      iconClass="text-deep-orange"
      subtitle="Update available stock before the next distribution round. Lowest stock is listed first."
      onClose={onClose}
      footer={(
        <>
          <button type="button" onClick={onClose} disabled={saving} className={secondaryButton}>Cancel</button>
          <button type="button" onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-deep-orange px-4 py-2 text-xs font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-60">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Save Changes
          </button>
        </>
      )}
    >
      {error && <p className="mb-4 rounded-xl bg-active p-3 text-xs text-primary">{error}</p>}
      {!sorted.length && <p className="py-6 text-center text-sm text-muted">No products yet — add one from Manage Products.</p>}
      <div className="space-y-4 text-xs">
        {sorted.map((product) => {
          const value = draft[product.id];
          const low = (product.stock || 0) <= LOW_STOCK;
          return (
            <div key={product.id}>
              <p className="mb-1 flex flex-wrap items-center gap-2 font-semibold text-ink">
                {product.name}
                <span className={`font-normal ${low ? "text-primary" : "text-muted"}`}>(Stock: {product.stock || 0} units{low ? " · low" : ""})</span>
                {product.active === false && <span className="rounded bg-page px-1.5 py-0.5 text-[10px] font-semibold text-subtle">Hidden</span>}
              </p>
              {typeof value === "string" ? (
                <input type="number" min="0" step="1" value={value} disabled={saving}
                  onChange={(event) => setDraft((current) => ({ ...current, [product.id]: event.target.value }))}
                  className={input} aria-label={`${product.name} stock`} />
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {product.variants.map((variant) => (
                    <label key={variant.id} className="flex items-center gap-2 rounded-xl border border-border-subtle bg-page px-3 py-1.5">
                      <span className="w-10 shrink-0 font-semibold text-muted">{variant.label}</span>
                      <input type="number" min="0" step="1" value={value[variant.id]} disabled={saving}
                        onChange={(event) => setDraft((current) => ({ ...current, [product.id]: { ...current[product.id], [variant.id]: event.target.value } }))}
                        className="w-full min-w-0 bg-transparent text-xs text-ink focus:outline-none" aria-label={`${product.name} ${variant.label} stock`} />
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

// ---- Create New Order (staff, on behalf of a student / walk-in) ----------
// Goes through the same /api/shop/checkout transaction as a student's own
// order, so stock is checked and decremented atomically and the order gets
// a normal ORD-###### number. Payment / "already collected" are applied
// straight after, as ordinary admin order updates.
const blankLine = () => ({ key: Math.random().toString(36).slice(2), productId: "", variantId: "", quantity: "1" });

function NewOrderModal({ products, paymentMethods, onClose }) {
  const toast = useToast();
  const available = useMemo(() => products.filter((product) => product.active !== false).sort((a, b) => a.name.localeCompare(b.name)), [products]);
  const [form, setForm] = useState({ name: "", email: "", phone: "", collectionDate: todayLocal(), paymentMethod: "", notes: "", collected: false });
  const [lines, setLines] = useState([blankLine()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.type === "checkbox" ? event.target.checked : event.target.value }));
  const setLine = (key, field, value) => setLines((current) => current.map((line) => (line.key === key ? { ...line, [field]: value, ...(field === "productId" ? { variantId: "" } : {}) } : line)));

  const productOf = (line) => available.find((product) => product.id === line.productId);
  const total = lines.reduce((sum, line) => sum + (productOf(line)?.price || 0) * (Number(line.quantity) || 0), 0);

  async function submit() {
    if (!form.name.trim()) return setError("Enter the customer's name.");
    const items = [];
    for (const line of lines) {
      const product = productOf(line);
      if (!product) return setError("Choose a product for every line, or remove the empty line.");
      const quantity = Number(line.quantity);
      if (!Number.isInteger(quantity) || quantity < 1) return setError(`Enter a quantity of 1 or more for ${product.name}.`);
      const hasVariants = Array.isArray(product.variants) && product.variants.length > 0;
      if (hasVariants && !line.variantId) return setError(`Choose a size for ${product.name}.`);
      items.push({ productId: product.id, quantity, ...(hasVariants ? { variantId: line.variantId } : {}) });
    }
    setSaving(true);
    setError("");
    try {
      const result = await checkout(items, {
        customerName: form.name.trim(),
        customerEmail: form.email.trim(),
        customerPhone: form.phone.trim(),
        collectionDate: form.collectionDate,
        notes: form.notes.trim(),
      });
      const followUps = [];
      if (form.paymentMethod) followUps.push(updateOrderDetails(result.orderId, { paymentMethod: form.paymentMethod }));
      if (form.collected) followUps.push(updateOrderStatus(result.orderId, "fulfilled"));
      await Promise.all(followUps);
      toast.success(`Order ${result.orderNumber} created${form.collected ? " and marked delivered" : ""}.`);
      onClose();
    } catch (err) {
      setError(err.message || "Unable to create this order.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      wide
      title="Create New Order"
      icon={Plus}
      iconClass="text-primary"
      subtitle="Record an order for a student or walk-in. Stock is reserved straight away."
      onClose={onClose}
      footer={(
        <>
          <span className="mr-auto self-center text-sm font-bold text-ink">Total {money(total)}</span>
          <button type="button" onClick={onClose} disabled={saving} className={secondaryButton}>Cancel</button>
          <button type="button" onClick={submit} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-primary-hover disabled:opacity-60">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Submit Order
          </button>
        </>
      )}
    >
      {error && <p className="mb-4 rounded-xl bg-active p-3 text-xs text-primary">{error}</p>}
      <div className="grid gap-4 text-xs sm:grid-cols-3">
        <label className="grid gap-1 font-semibold text-ink sm:col-span-3">Customer name<input value={form.name} onChange={set("name")} disabled={saving} placeholder="e.g. Sarah Jenkins" className={input} /></label>
        <label className="grid gap-1 font-semibold text-ink sm:col-span-2">Email<input type="email" value={form.email} onChange={set("email")} disabled={saving} placeholder="sarah@example.com" className={input} /></label>
        <label className="grid gap-1 font-semibold text-ink">Phone<input value={form.phone} onChange={set("phone")} disabled={saving} placeholder="91234567" className={input} /></label>
      </div>

      <p className="mb-2 mt-5 text-xs font-semibold text-ink">Items</p>
      <div className="space-y-2">
        {lines.map((line) => {
          const product = productOf(line);
          const variants = Array.isArray(product?.variants) ? product.variants : [];
          return (
            <div key={line.key} className="flex flex-wrap items-center gap-2 rounded-xl border border-border-subtle p-2">
              <select value={line.productId} onChange={(event) => setLine(line.key, "productId", event.target.value)} disabled={saving} className={`${input} min-w-40 flex-1`} aria-label="Product">
                <option value="">Choose product…</option>
                {available.map((item) => <option key={item.id} value={item.id} disabled={(item.stock || 0) < 1}>{item.name} ({money(item.price)}){(item.stock || 0) < 1 ? " — out of stock" : ""}</option>)}
              </select>
              {variants.length > 0 && (
                <select value={line.variantId} onChange={(event) => setLine(line.key, "variantId", event.target.value)} disabled={saving} className={`${input} w-28`} aria-label="Size">
                  <option value="">Size…</option>
                  {variants.map((variant) => <option key={variant.id} value={variant.id} disabled={(variant.stock || 0) < 1}>{variant.label}{(variant.stock || 0) < 1 ? " (0)" : ""}</option>)}
                </select>
              )}
              <input type="number" min="1" step="1" value={line.quantity} onChange={(event) => setLine(line.key, "quantity", event.target.value)} disabled={saving} className={`${input} w-20`} aria-label="Quantity" />
              {lines.length > 1 && (
                <button type="button" onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))} disabled={saving} className="rounded-lg p-2 text-subtle hover:bg-active hover:text-primary" aria-label="Remove item">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          );
        })}
      </div>
      <button type="button" onClick={() => setLines((current) => [...current, blankLine()])} disabled={saving} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
        <Plus className="h-3.5 w-3.5" /> Add another item
      </button>

      <div className="mt-5 grid gap-4 text-xs sm:grid-cols-2">
        <label className="grid gap-1 font-semibold text-ink">Collection date<input type="date" min={todayLocal()} value={form.collectionDate} onChange={set("collectionDate")} disabled={saving} className={input} /></label>
        <label className="grid gap-1 font-semibold text-ink">Payment
          <select value={form.paymentMethod} onChange={set("paymentMethod")} disabled={saving} className={input}>
            <option value="">Not paid yet</option>
            {paymentMethods.map((method) => <option key={method} value={method}>{method}</option>)}
          </select>
        </label>
        <label className="grid gap-1 font-semibold text-ink sm:col-span-2">Notes<textarea rows={2} value={form.notes} onChange={set("notes")} disabled={saving} placeholder="e.g. Size swap requested" className={input} /></label>
        <label className="flex items-center gap-2 font-semibold text-ink sm:col-span-2">
          <input type="checkbox" checked={form.collected} onChange={set("collected")} disabled={saving} className="h-4 w-4 accent-[var(--dash-primary)]" />
          Already collected — mark as delivered now
        </label>
      </div>
    </Modal>
  );
}

// ---- Edit order (collection date, payment, notes) ------------------------
function EditOrderModal({ order, paymentMethods, onClose }) {
  const toast = useToast();
  const [form, setForm] = useState({ collectionDate: order.collectionDate || "", paymentMethod: order.paymentMethod || "", notes: order.notes || "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const methods = form.paymentMethod && !paymentMethods.includes(form.paymentMethod) ? [...paymentMethods, form.paymentMethod] : paymentMethods;

  async function save() {
    setSaving(true);
    setError("");
    try {
      await updateOrderDetails(order.id, form);
      toast.success(`Order ${order.orderNumber || ""} updated.`);
      onClose();
    } catch (err) {
      setError(err.message || "Unable to update this order.");
      setSaving(false);
    }
  }

  return (
    <Modal
      title={`Edit order ${order.orderNumber || ""}`}
      icon={Pencil}
      iconClass="text-info"
      subtitle={`${customerName(order) || "Customer"} · ${(order.items || []).map(itemText).join(", ")}`}
      onClose={onClose}
      footer={(
        <>
          <button type="button" onClick={onClose} disabled={saving} className={secondaryButton}>Cancel</button>
          <button type="button" onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-hover disabled:opacity-60">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Save
          </button>
        </>
      )}
    >
      {error && <p className="mb-4 rounded-xl bg-active p-3 text-xs text-primary">{error}</p>}
      <div className="grid gap-4 text-xs sm:grid-cols-2">
        <label className="grid gap-1 font-semibold text-ink">Collection date<input type="date" value={form.collectionDate} onChange={set("collectionDate")} disabled={saving} className={input} /></label>
        <label className="grid gap-1 font-semibold text-ink">Payment
          <select value={form.paymentMethod} onChange={set("paymentMethod")} disabled={saving} className={input}>
            <option value="">Not paid yet</option>
            {methods.map((method) => <option key={method} value={method}>{method}</option>)}
          </select>
        </label>
        <label className="grid gap-1 font-semibold text-ink sm:col-span-2">Notes<textarea rows={3} value={form.notes} onChange={set("notes")} disabled={saving} className={input} /></label>
      </div>
    </Modal>
  );
}

// ---- Orders table columns (search / sort / export) -----------------------
const columns = [
  { key: "orderNumber", header: "Order ID", sortable: true, accessor: (o) => o.orderNumber || o.id },
  { key: "customer", header: "Customer Name", sortable: true, accessor: customerName },
  { key: "email", header: "Email", accessor: customerEmail },
  { key: "phone", header: "Phone", accessor: (o) => o.customerPhone || "" },
  {
    key: "items", header: "Item & Size / Spec", accessor: (o) => (o.items || []).map(itemText).join("; "),
    filter: { predicate: (o, productId) => (o.items || []).some((item) => item.productId === productId) },
  },
  { key: "qty", header: "Qty", sortable: true, align: "center", searchable: false, accessor: quantityOf },
  { key: "amount", header: "Amount", sortable: true, searchable: false, accessor: (o) => Number(o.totalAmount || 0) },
  {
    key: "collectionDate", header: "Collection Date", sortable: true, searchable: false, accessor: (o) => o.collectionDate || "",
    filter: { predicate: (o, date) => (o.collectionDate || "") === date },
  },
  { key: "notes", header: "Notes", accessor: (o) => o.notes || "" },
  {
    key: "status", header: "Status", sortable: true, searchable: false, accessor: (o) => ORDER_STATUS[statusOf(o)]?.label || statusOf(o),
    filter: { predicate: (o, status) => statusOf(o) === status },
  },
  { key: "payment", header: "Payment", sortable: true, searchable: false, accessor: (o) => o.paymentMethod || "" },
  { key: "placedAt", header: "Placed", searchable: false, accessor: (o) => (o.createdAt?.toDate ? o.createdAt.toDate().toISOString().slice(0, 10) : "") },
];
const tableColumns = columns.filter((col) => col.key !== "placedAt");

function SortHeader({ table, col, className = "" }) {
  const active = table.sort?.key === col.key;
  const Icon = !active ? ChevronsUpDown : table.sort.dir === "asc" ? ChevronUp : ChevronDown;
  return (
    <th className={`whitespace-nowrap px-4 py-3.5 font-semibold ${className}`}>
      {col.sortable ? (
        <button type="button" onClick={() => table.toggleSort(col.key)} className="inline-flex items-center gap-1 uppercase tracking-wider hover:text-ink">
          {col.header}<Icon className={`h-3 w-3 ${active ? "" : "opacity-40"}`} aria-hidden="true" />
        </button>
      ) : col.header}
    </th>
  );
}

/** Admin/Director Orders tab: KPIs + analytics, operations row and the filterable orders table. */
export default function ShopOrdersBoard({ orders, products, role }) {
  const toast = useToast();
  const confirm = useConfirm();
  const paymentMethods = usePaymentMethods();
  const [range, setRange] = useState("30D");
  const [modal, setModal] = useState(null); // "inventory" | "new" | { edit: order }
  const [busyId, setBusyId] = useState("");

  const rows = useMemo(() => [...orders].sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)), [orders]);
  const table = useDataTable({ rows, columns, pageSize: 10 });
  const filtered = table.sortedRows;

  const productOptions = useMemo(() => {
    const seen = new Map();
    orders.forEach((order) => (order.items || []).forEach((item) => seen.set(item.productId, item.name)));
    products.forEach((product) => seen.set(product.id, product.name));
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [orders, products]);
  const lowStock = products.filter((product) => product.active !== false && (product.stock || 0) <= LOW_STOCK).length;

  const filteredDelivered = filtered.filter((order) => statusOf(order) === "fulfilled");
  const filteredItems = filteredDelivered.reduce((sum, order) => sum + quantityOf(order), 0);
  const filteredRevenue = filteredDelivered.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
  const activeFilters = [
    table.search.trim() && `“${table.search.trim()}”`,
    table.filters.status && table.filters.status !== "__all__" && ORDER_STATUS[table.filters.status]?.label,
    table.filters.items && table.filters.items !== "__all__" && productOptions.find(([id]) => id === table.filters.items)?.[1],
    table.filters.collectionDate && table.filters.collectionDate !== "__all__" && `Collection ${formatDate(table.filters.collectionDate)}`,
  ].filter(Boolean);

  async function setStatus(order, status) {
    setBusyId(order.id);
    try {
      await updateOrderStatus(order.id, status);
      toast.success(`${order.orderNumber || "Order"} marked ${ORDER_STATUS[status].label.toLowerCase()}.`);
    } catch (err) {
      toast.error(err.message || "Unable to update this order.");
    } finally {
      setBusyId("");
    }
  }

  function cancelOrder(order) {
    return confirm({
      title: "Cancel order",
      message: `Cancel ${order.orderNumber || "this order"} for ${customerName(order) || "this customer"}? Its stock is not returned automatically — adjust it in Manage Inventory if the items are back on the shelf.`,
      tone: "danger",
      confirmLabel: "Cancel order",
      onConfirm: () => setStatus(order, "cancelled"),
    });
  }

  function removeOrder(order) {
    return confirm({
      title: "Delete order",
      message: `Permanently delete cancelled order ${order.orderNumber || ""}? This cannot be undone.`,
      tone: "danger",
      confirmLabel: "Delete",
      onConfirm: async () => {
        await deleteOrder(order.id);
        toast.success(`${order.orderNumber || "Order"} deleted.`);
      },
    });
  }

  const exportName = "shop-orders";
  const quickExport = (format) => {
    if (!filtered.length) return toast.info("No orders match the current filters.");
    return runExport(format, { columns, rows: filtered, name: exportName });
  };
  const selectClass = `${input} cursor-pointer`;

  return (
    <div className="space-y-6">
      <ShopAnalytics orders={orders} range={range} onRangeChange={setRange} />

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col justify-between rounded-2xl border border-border-subtle bg-card p-5 shadow-sm">
          <div>
            <h3 className="mb-1 flex items-center gap-2 text-sm font-bold text-ink"><SlidersHorizontal className="h-4 w-4 text-deep-orange" aria-hidden="true" />Operations Control</h3>
            <p className="mb-4 text-xs text-muted">
              Update inventory stock and record orders at the counter.
              {lowStock > 0 && <b className="text-primary"> {lowStock} product{lowStock === 1 ? " is" : "s are"} low on stock.</b>}
            </p>
          </div>
          <div className="space-y-3">
            <button type="button" onClick={() => setModal("inventory")} className="flex w-full items-center justify-between rounded-xl border border-border-subtle bg-page px-4 py-2.5 text-xs font-semibold text-ink transition hover:border-deep-orange/50 hover:bg-deep-orange-soft">
              <span className="flex items-center gap-2"><Warehouse className="h-4 w-4 text-deep-orange" aria-hidden="true" />Manage Inventory Stock</span>
              <ChevronRight className="h-4 w-4 text-subtle" aria-hidden="true" />
            </button>
            <button type="button" onClick={() => setModal("new")} className="flex w-full items-center justify-between rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-primary-hover">
              <span className="flex items-center gap-2"><Plus className="h-4 w-4" aria-hidden="true" />Create New Order</span>
              <ArrowRight className="h-4 w-4 opacity-80" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-2xl border border-border-subtle bg-card p-5 shadow-sm">
          <div>
            <h3 className="mb-1 flex items-center gap-2 text-sm font-bold text-ink"><ShieldCheck className="h-4 w-4 text-purple" aria-hidden="true" />Your Access</h3>
            <p className="mb-4 text-xs text-muted">Signed in as <b className="text-ink">{role}</b> — what this role can do in the shop.</p>
          </div>
          <div className="space-y-2 rounded-xl border border-border-subtle bg-page p-3 text-xs font-medium text-ink">
            <p className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-success" aria-hidden="true" />Full order management (deliver, cancel, edit, delete)</p>
            <p className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-success" aria-hidden="true" />Inventory stock and product updates</p>
            <p className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-success" aria-hidden="true" />Revenue reports and exports</p>
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-2xl border border-border-subtle bg-card p-5 shadow-sm">
          <div>
            <h3 className="mb-1 flex items-center gap-2 text-sm font-bold text-ink"><FileText className="h-4 w-4 text-primary" aria-hidden="true" />Quick Reports &amp; Export</h3>
            <p className="mb-4 text-xs text-muted">Download the orders currently shown in the table below ({filtered.length}).</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => quickExport("csv")} className="flex items-center justify-center gap-2 rounded-xl border border-border-subtle bg-page px-3 py-2 text-xs font-semibold text-ink transition hover:bg-active">
              <FileSpreadsheet className="h-4 w-4 text-success" aria-hidden="true" />Export CSV
            </button>
            <button type="button" onClick={() => quickExport("pdf")} className="flex items-center justify-center gap-2 rounded-xl border border-border-subtle bg-page px-3 py-2 text-xs font-semibold text-ink transition hover:bg-active">
              <FileText className="h-4 w-4 text-primary" aria-hidden="true" />Export PDF
            </button>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-border-subtle bg-card shadow-sm">
        <div className="space-y-4 border-b border-border-subtle p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-subtle" aria-hidden="true" />
                <input value={table.search} onChange={(event) => table.setSearch(event.target.value)} placeholder="Order ID, name, email, or phone…" className={`${input} pl-9`} aria-label="Search orders" />
              </label>
              <label className="relative">
                <CalendarDays className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-subtle" aria-hidden="true" />
                <input type="date" value={table.filters.collectionDate || ""} onChange={(event) => table.setFilter("collectionDate", event.target.value)} className={`${input} pl-9`} aria-label="Collection date" />
              </label>
              <select value={table.filters.status || "__all__"} onChange={(event) => table.setFilter("status", event.target.value)} className={selectClass} aria-label="Status">
                <option value="__all__">Status: All statuses</option>
                {Object.entries(ORDER_STATUS).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}
              </select>
              <select value={table.filters.items || "__all__"} onChange={(event) => table.setFilter("items", event.target.value)} className={selectClass} aria-label="Item">
                <option value="__all__">Item: All products</option>
                {productOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2">
              {activeFilters.length > 0 && (
                <button type="button" onClick={table.reset} className="rounded-xl px-3 py-2 text-xs font-semibold text-muted hover:bg-page hover:text-ink">Clear</button>
              )}
              <ExportMenu columns={columns} pageRows={table.pageRows} filteredRows={filtered} allRows={rows} name={exportName} />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-muted">
            <span className="flex items-center gap-1.5 rounded-lg border border-border-subtle bg-page px-3 py-1 font-medium text-ink">
              <Filter className="h-3.5 w-3.5 text-primary" aria-hidden="true" />Active filter:
              <b>{activeFilters.length ? activeFilters.join(" · ") : "All orders"}</b>
            </span>
            <span className="flex items-center gap-1.5 rounded-lg border border-red-line bg-active px-2.5 py-1 font-medium text-primary">
              <PackageCheck className="h-3.5 w-3.5" aria-hidden="true" />{filteredItems.toLocaleString()} items delivered
            </span>
            <span className="flex items-center gap-1.5 rounded-lg border border-purple/30 bg-purple-soft px-2.5 py-1 font-medium text-purple">
              <BadgeDollarSign className="h-3.5 w-3.5" aria-hidden="true" />{money(filteredRevenue)} revenue
            </span>
            <span className="ml-auto font-semibold text-muted">Showing {filtered.length.toLocaleString()} of {rows.length.toLocaleString()} orders</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-border-subtle bg-page text-[10px] uppercase tracking-wider text-muted">
                {tableColumns.map((col) => <SortHeader key={col.key} table={table} col={col} className={col.align === "center" ? "text-center" : ""} />)}
                <th className="px-4 py-3.5 text-center font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle text-ink">
              {!table.pageRows.length ? (
                <tr><td colSpan={tableColumns.length + 1} className="px-4 py-14 text-center text-sm text-muted">{rows.length ? "No orders match your search or filters." : "No orders yet."}</td></tr>
              ) : table.pageRows.map((order) => {
                const status = statusOf(order);
                const busy = busyId === order.id;
                return (
                  <tr key={order.id} className="transition hover:bg-page">
                    <td className="whitespace-nowrap px-4 py-3.5 font-mono font-semibold text-primary">{order.orderNumber || "—"}</td>
                    <td className="px-4 py-3.5 font-semibold">{customerName(order) || "—"}</td>
                    <td className="px-4 py-3.5 text-muted">{customerEmail(order) || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 font-mono text-muted">{order.customerPhone || "—"}</td>
                    <td className="px-4 py-3.5">
                      <div className="flex flex-col gap-1">
                        {(order.items || []).map((item, index) => (
                          <div key={`${item.productId}-${item.variantId || index}`} className="flex flex-wrap items-center gap-1.5">
                            <span className="rounded border border-red-line bg-active px-2 py-0.5 text-[10px] font-semibold text-primary">{item.name}</span>
                            {item.variantLabel && <span className="rounded border border-deep-orange/30 bg-deep-orange-soft px-1.5 py-0.5 text-[10px] font-medium text-deep-orange">{item.variantLabel}</span>}
                            {(order.items || []).length > 1 && <span className="text-[10px] text-subtle">× {item.quantity}</span>}
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-center font-semibold">{quantityOf(order)}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 font-bold text-success">{money(order.totalAmount)}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-muted">{order.collectionDate ? formatDate(order.collectionDate) : "—"}</td>
                    <td className="max-w-48 px-4 py-3.5 italic text-subtle"><span className="line-clamp-2" title={order.notes || ""}>{order.notes || "—"}</span></td>
                    <td className="px-4 py-3.5"><OrderStatusPill status={status} /></td>
                    <td className="px-4 py-3.5">
                      {order.paymentMethod
                        ? <span className="whitespace-nowrap rounded-full border border-border-subtle bg-page px-2.5 py-1 text-[10px] font-medium text-ink">{order.paymentMethod}</span>
                        : <span className="text-[10px] text-subtle">Not recorded</span>}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center justify-center gap-1">
                        {busy ? <Loader2 className="h-4 w-4 animate-spin text-subtle" aria-label="Updating" /> : (
                          <>
                            {status !== "fulfilled" && (
                              <button type="button" onClick={() => setStatus(order, "fulfilled")} className="rounded-lg p-1.5 text-subtle transition hover:bg-success-soft hover:text-success" title="Mark delivered" aria-label="Mark delivered">
                                <PackageCheck className="h-4 w-4" />
                              </button>
                            )}
                            <button type="button" onClick={() => setModal({ edit: order })} className="rounded-lg p-1.5 text-subtle transition hover:bg-info-soft hover:text-info" title="Edit date, payment and notes" aria-label="Edit order">
                              <Pencil className="h-4 w-4" />
                            </button>
                            {status === "pending" && (
                              <button type="button" onClick={() => cancelOrder(order)} className="rounded-lg p-1.5 text-subtle transition hover:bg-active hover:text-primary" title="Cancel order" aria-label="Cancel order">
                                <Ban className="h-4 w-4" />
                              </button>
                            )}
                            {status === "cancelled" && (
                              <button type="button" onClick={() => removeOrder(order)} className="rounded-lg p-1.5 text-subtle transition hover:bg-active hover:text-primary" title="Delete order" aria-label="Delete order">
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filtered.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle px-5 py-3 text-xs text-muted">
            <div className="flex items-center gap-2">
              <span>{(table.page - 1) * table.pageSize + 1}–{Math.min(table.page * table.pageSize, filtered.length)} of <b className="text-ink">{filtered.length}</b></span>
              <select value={table.pageSize} onChange={(event) => { table.setPageSize(Number(event.target.value)); table.setPage(1); }} className="rounded-lg border border-border-subtle bg-card px-2 py-1 text-xs" aria-label="Rows per page">
                {[10, 25, 50, 100].map((size) => <option key={size} value={size}>{size} / page</option>)}
              </select>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" disabled={table.page <= 1} onClick={() => table.setPage(table.page - 1)} className="rounded-lg border border-border-subtle bg-card p-1.5 disabled:opacity-40" aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></button>
              <span className="px-2 font-bold text-ink">{table.page} / {table.pageCount}</span>
              <button type="button" disabled={table.page >= table.pageCount} onClick={() => table.setPage(table.page + 1)} className="rounded-lg border border-border-subtle bg-card p-1.5 disabled:opacity-40" aria-label="Next page"><ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>
        )}
      </section>

      {modal === "inventory" && <InventoryModal products={products} onClose={() => setModal(null)} />}
      {modal === "new" && <NewOrderModal products={products} paymentMethods={paymentMethods} onClose={() => setModal(null)} />}
      {modal?.edit && <EditOrderModal order={modal.edit} paymentMethods={paymentMethods} onClose={() => setModal(null)} />}
    </div>
  );
}

