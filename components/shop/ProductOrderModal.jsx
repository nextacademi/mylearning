"use client";

import { useState } from "react";
import { CalendarClock, CheckCircle2, Minus, Plus, ShoppingBag, X } from "lucide-react";
import { checkout } from "../../lib/shop-data";

const money = (value) => `$${Number(value || 0).toFixed(2)}`;
const phonePattern = /^[0-9+\-\s()]{6,20}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function formatDate(value) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// A real, single-product "Buy Now" style checkout — separate from the
// existing multi-item cart flow in Shop.jsx (CartCheckoutModal), but posts
// to the exact same /api/shop/checkout endpoint, extended to accept an
// optional variantId/customer info/collection date/notes. No second order
// system: this is the same `orders` collection, same stock-decrement
// transaction, just a second UI path into it. Kept visually consistent
// with CartCheckoutModal's compact design.
export default function ProductOrderModal({ product, profile, onClose, onViewOrders }) {
  const hasVariants = Array.isArray(product.variants) && product.variants.length > 0;
  const [variantId, setVariantId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [customerName, setCustomerName] = useState(profile?.displayName || "");
  const [customerPhone, setCustomerPhone] = useState(profile?.phone || "");
  const [customerEmail, setCustomerEmail] = useState(profile?.email || "");
  const [collectionDate, setCollectionDate] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const today = new Date().toISOString().split("T")[0];
  const selectedVariant = hasVariants ? product.variants.find((v) => v.id === variantId) : null;
  const maxQuantity = hasVariants ? (selectedVariant?.stock || 0) : (product.stock || 0);
  const outOfStock = hasVariants ? !selectedVariant : maxQuantity <= 0;
  const total = product.price * quantity;

  function adjustQuantity(delta) {
    setQuantity((current) => Math.max(1, Math.min(maxQuantity || 1, current + delta)));
  }

  async function submit(e) {
    e.preventDefault();
    if (submitting) return;
    setError("");
    if (!customerName.trim()) return setError("Enter your full name.");
    if (!customerPhone.trim()) return setError("Enter your mobile number.");
    if (!phonePattern.test(customerPhone.trim())) return setError("Enter a valid mobile number.");
    if (customerEmail.trim() && !emailPattern.test(customerEmail.trim())) return setError("Enter a valid email address.");
    if (hasVariants && !variantId) return setError("Please select a size.");
    if (maxQuantity < 1) return setError(hasVariants ? "Selected size is out of stock." : "This product is out of stock.");
    if (quantity > maxQuantity) return setError(`Only ${maxQuantity} item(s) available.`);
    if (!collectionDate) return setError("Please select a collection date.");

    setSubmitting(true);
    try {
      const response = await checkout(
        [{ productId: product.id, quantity, ...(variantId ? { variantId } : {}) }],
        {
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          customerEmail: customerEmail.trim(),
          collectionDate,
          notes: notes.trim(),
        },
      );
      setResult(response);
    } catch (err) {
      // Never a fake success — the form stays filled in exactly as the
      // user left it so they can retry without re-typing everything.
      setError(err?.message || "Unable to place order. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-3 backdrop-blur-sm" role="dialog" aria-modal="true">
        <div className="w-full max-w-sm rounded-2xl bg-card p-5 shadow-2xl">
          <div className="text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-success-soft">
              <CheckCircle2 className="h-6 w-6 text-success" />
            </div>
            <h2 className="mt-3 text-lg font-black text-ink">Order Placed</h2>
            <p className="mt-1 text-xs text-muted">Your order has been placed successfully.</p>
          </div>

          <div className="mt-5 space-y-2.5 rounded-xl bg-page p-3.5 text-xs">
            <Row label="Order" value={`#${result.orderNumber}`} strong />
            <Row label={product.name} value={`× ${quantity}`} />
            {selectedVariant && <Row label="Size" value={selectedVariant.label} />}
            <div className="my-2 border-t border-border-subtle" />
            <Row label="Collection" value={formatDate(collectionDate)} />
            <Row label="Total" value={money(total)} strong />
          </div>

          <div className="mt-4 flex gap-2">
            <button type="button" onClick={onViewOrders} className="flex-1 rounded-lg border border-border-subtle px-3 py-2 text-xs font-bold text-ink hover:bg-page">View Order</button>
            <button type="button" onClick={onClose} className="flex-1 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white hover:opacity-90">Continue</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/50 p-3 backdrop-blur-sm" role="dialog" aria-modal="true">
      <form onSubmit={submit} className="my-4 w-full max-w-md rounded-2xl bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10">
              <ShoppingBag className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-black text-ink">Place Your Order</h2>
              <p className="text-[10px] text-muted">Complete your order</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-page hover:text-ink" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <section>
            <p className="mb-2.5 text-[9px] font-black uppercase tracking-wider text-subtle">Customer Details</p>
            <div className="space-y-2.5">
              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                required
                placeholder="Full name *"
                className="w-full rounded-lg border border-border-subtle px-3 py-2.5 text-xs text-ink outline-none placeholder:text-subtle focus:border-primary focus:ring-1 focus:ring-primary/10"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  required
                  inputMode="tel"
                  placeholder="Mobile number *"
                  className="w-full rounded-lg border border-border-subtle px-3 py-2.5 text-xs text-ink outline-none placeholder:text-subtle focus:border-primary focus:ring-1 focus:ring-primary/10"
                />
                <input
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  placeholder="Email"
                  className="w-full rounded-lg border border-border-subtle px-3 py-2.5 text-xs text-ink outline-none placeholder:text-subtle focus:border-primary focus:ring-1 focus:ring-primary/10"
                />
              </div>
            </div>
          </section>

          <section>
            <p className="mb-2.5 text-[9px] font-black uppercase tracking-wider text-subtle">Product</p>
            <div className="flex items-center gap-2.5 rounded-lg bg-page p-2">
              <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-md bg-card">
                {product.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" />
                ) : (
                  <ShoppingBag className="h-4 w-4 text-subtle" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-ink">{product.name}</p>
                <p className="text-[11px] font-black text-primary">{money(product.price)}</p>
              </div>
            </div>
          </section>

          {/* The size selector is conditional on the product's REAL variant
              data — never on its name or category. A product with an empty
              `variants` array never shows this section at all. */}
          {hasVariants && (
            <section>
              <p className="mb-2.5 text-[9px] font-black uppercase tracking-wider text-subtle">Product Options — Size *</p>
              <div className="flex flex-wrap gap-1.5">
                {product.variants.map((variant) => {
                  const variantOutOfStock = (variant.stock || 0) <= 0;
                  return (
                    <button
                      key={variant.id}
                      type="button"
                      disabled={variantOutOfStock}
                      onClick={() => {
                        setVariantId(variant.id);
                        setQuantity(1);
                      }}
                      className={`rounded-lg border px-3 py-1.5 text-[11px] font-bold transition ${
                        variantId === variant.id ? "border-primary bg-primary text-white" : "border-border-subtle text-ink hover:border-primary"
                      } ${variantOutOfStock ? "cursor-not-allowed opacity-40" : ""}`}
                    >
                      {variant.label} — {variantOutOfStock ? "Out of stock" : `${variant.stock} left`}
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          <section>
            <p className="mb-2.5 text-[9px] font-black uppercase tracking-wider text-subtle">Collection Date</p>
            <div className="relative">
              <CalendarClock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
              <input
                type="date"
                value={collectionDate}
                onChange={(e) => setCollectionDate(e.target.value)}
                min={today}
                required
                className="w-full cursor-pointer rounded-lg border border-border-subtle bg-card py-2.5 pl-9 pr-3 text-xs font-semibold text-ink outline-none focus:border-primary focus:ring-1 focus:ring-primary/10"
              />
            </div>
          </section>

          <section>
            <p className="mb-2.5 text-[9px] font-black uppercase tracking-wider text-subtle">Quantity</p>
            <div className="flex items-center gap-3">
              <button type="button" disabled={quantity <= 1} onClick={() => adjustQuantity(-1)} className="grid h-8 w-8 place-items-center rounded-lg border border-border-subtle text-muted disabled:opacity-40"><Minus className="h-3.5 w-3.5" /></button>
              <span className="w-6 text-center text-sm font-black text-ink">{quantity}</span>
              <button type="button" disabled={outOfStock || quantity >= maxQuantity} onClick={() => adjustQuantity(1)} className="grid h-8 w-8 place-items-center rounded-lg border border-border-subtle text-muted disabled:opacity-40"><Plus className="h-3.5 w-3.5" /></button>
              {!outOfStock && <span className="text-[11px] text-muted">{maxQuantity} available</span>}
            </div>
          </section>

          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            maxLength={1000}
            placeholder="Notes / special instructions (optional)"
            className="w-full resize-none rounded-lg border border-border-subtle px-3 py-2.5 text-xs text-ink outline-none placeholder:text-subtle focus:border-primary focus:ring-1 focus:ring-primary/10"
          />

          <div className="flex items-center justify-between rounded-xl bg-page px-4 py-3">
            <span className="text-xs font-bold text-muted">Total</span>
            <span className="text-lg font-black text-primary">{money(total)}</span>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2">
              <p className="text-[11px] font-semibold text-red-600">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || outOfStock}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-xs font-black text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Placing Order...
              </>
            ) : (
              <>
                <ShoppingBag className="h-3.5 w-3.5" />
                PLACE ORDER · {money(total)}
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

function Row({ label, value, strong }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="truncate text-muted">{label}</span>
      <span className={strong ? "shrink-0 font-black text-ink" : "shrink-0 font-semibold text-ink"}>{value}</span>
    </div>
  );
}
