"use client";

import { useEffect, useMemo, useState } from "react";
import { ShoppingBag, ShoppingCart, Pencil, Trash2, Plus, Minus, Search, Tag, Eye, EyeOff, ArrowUpDown } from "lucide-react";
import {
  subscribeProducts, subscribeMyOrders, subscribeAllOrders, subscribeCategories,
  createProduct, updateProduct, deleteProduct, uploadProductImage, updateOrderStatus, updateOrderCollection,
  createCategory, updateCategory, deleteCategory, uploadCategoryImage,
} from "../../lib/shop-data";
import Spinner from "../ui/Spinner";
import ProductOrderModal from "./ProductOrderModal";
import CartCheckoutModal from "./CartCheckoutModal";
import DataTable from "../data-table/DataTable";
import { useAuth } from "../../lib/auth-context";

const managers = new Set(["Admin", "Director"]);
const dash = "—";
const money = (value) => `$${Number(value || 0).toFixed(2)}`;
function formatDate(value) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
const LOW_STOCK_THRESHOLD = 5;
const SORT_OPTIONS = [
  ["newest", "Newest"],
  ["price-asc", "Price: Low to High"],
  ["price-desc", "Price: High to Low"],
  ["name", "Name: A to Z"],
];

function Dialog({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4" role="dialog" aria-modal="true">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="text-lg font-bold text-ink">{title}</h2>
          <button onClick={onClose} className="text-xl text-muted" aria-label="Close">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const tones = {
    pending: "bg-warning-soft text-warning",
    fulfilled: "bg-success-soft text-success",
    cancelled: "bg-active text-primary",
  };
  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold capitalize ${tones[status] || "bg-page text-muted"}`}>{status || "pending"}</span>;
}

const blankProduct = { name: "", description: "", price: "", stock: "", categoryId: "", variants: [] };
const blankCategory = { name: "", description: "" };
// Client-side-only id for a not-yet-saved variant row — replaced by the
// server with its own id (or kept if it already had a real one from an
// existing product) once resolveVariants() on the API route processes it.
const newVariantId = () => `v${Date.now()}${Math.random().toString(36).slice(2, 6)}`;

function ProductForm({ form, setForm, saving, error, onCancel, onSubmit, imagePreview, onImageSelect, categories, onNewCategory }) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="grid gap-1 text-xs font-bold text-muted">
        Product name
        <input value={form.name} onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))} required maxLength={200} className="rounded-xl border border-border-subtle px-3 py-2.5 text-sm font-normal" />
      </label>
      <label className="grid gap-1 text-xs font-bold text-muted">
        Description
        <textarea value={form.description} onChange={(e) => setForm((c) => ({ ...c, description: e.target.value }))} rows={3} maxLength={2000} className="rounded-xl border border-border-subtle px-3 py-2.5 text-sm font-normal" />
      </label>
      <div className="grid gap-1 text-xs font-bold text-muted">
        Category
        <div className="flex gap-2">
          <select value={form.categoryId} onChange={(e) => setForm((c) => ({ ...c, categoryId: e.target.value }))} className="min-w-0 flex-1 rounded-xl border border-border-subtle px-3 py-2.5 text-sm font-normal">
            <option value="">No category</option>
            {categories.filter((c) => c.active !== false).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button type="button" onClick={onNewCategory} className="shrink-0 rounded-xl border border-border-subtle bg-page px-3 py-2.5 text-xs font-bold text-muted hover:bg-active hover:text-primary">
            + New Category
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <label className="grid gap-1 text-xs font-bold text-muted">
          Price (USD)
          <input type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm((c) => ({ ...c, price: e.target.value }))} required className="rounded-xl border border-border-subtle px-3 py-2.5 text-sm font-normal" />
        </label>
        <label className="grid gap-1 text-xs font-bold text-muted">
          Stock quantity
          <input
            type="number"
            min="0"
            step="1"
            value={form.stock}
            onChange={(e) => setForm((c) => ({ ...c, stock: e.target.value }))}
            required={!form.variants.length}
            disabled={form.variants.length > 0}
            className="rounded-xl border border-border-subtle px-3 py-2.5 text-sm font-normal disabled:bg-page disabled:text-muted"
          />
          {form.variants.length > 0 && <span className="text-[11px] font-semibold text-muted">Sum of size/variant stock below</span>}
        </label>
      </div>

      {/* Sizes/variants are entirely optional — not every product needs
          them (a mug vs. a T-shirt). There is no separate Variant model in
          this schema; each is just {id, label, stock} embedded on the
          product doc itself (see app/api/admin/shop/products/route.js's
          resolveVariants()). `label` is generic on purpose — this never
          assumes every product is clothing with sizes. */}
      <div className="rounded-xl border border-border-subtle p-3">
        <p className="text-xs font-bold text-ink">Sizes / Variants (Optional)</p>
        <p className="mt-0.5 text-[11px] text-muted">Add sizes/variants for products such as T-shirts and Hoodies. Leave empty for products like mugs or notebooks.</p>
        {form.variants.length > 0 && (
          <div className="mt-3 space-y-2">
            {form.variants.map((variant, index) => (
              <div key={variant.id} className="flex items-center gap-2">
                <input
                  value={variant.label}
                  onChange={(e) => setForm((c) => ({ ...c, variants: c.variants.map((v, i) => (i === index ? { ...v, label: e.target.value } : v)) }))}
                  placeholder="Size / variant name (e.g. S, M, Red)"
                  className="min-w-0 flex-1 rounded-lg border border-border-subtle px-2.5 py-2 text-sm font-normal"
                />
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={variant.stock}
                  onChange={(e) => setForm((c) => ({ ...c, variants: c.variants.map((v, i) => (i === index ? { ...v, stock: e.target.value } : v)) }))}
                  placeholder="Stock"
                  className="w-24 shrink-0 rounded-lg border border-border-subtle px-2.5 py-2 text-sm font-normal"
                />
                <button
                  type="button"
                  onClick={() => setForm((c) => ({ ...c, variants: c.variants.filter((_, i) => i !== index) }))}
                  className="shrink-0 rounded-lg border border-border-subtle px-2.5 py-2 text-xs font-bold text-primary hover:bg-active"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
        {!form.variants.length && <p className="mt-2 text-xs text-muted">No variants added.</p>}
        <button
          type="button"
          onClick={() => setForm((c) => ({ ...c, variants: [...c.variants, { id: newVariantId(), label: "", stock: "" }] }))}
          className="mt-3 rounded-lg border border-border-subtle bg-page px-3 py-1.5 text-xs font-bold text-muted hover:bg-active hover:text-primary"
        >
          + Add Size / Variant
        </button>
      </div>

      <div>
        <p className="mb-1 text-xs font-bold text-muted">Product image</p>
        <label className="relative flex h-32 w-full cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-border-subtle bg-page">
          {imagePreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imagePreview} alt="Product preview" className="h-full w-full object-cover" />
          ) : (
            <span className="text-xs font-bold text-muted">Click to upload an image</span>
          )}
          <input type="file" accept="image/*" onChange={(e) => onImageSelect(e.target.files?.[0] || null)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
        </label>
      </div>
      {error && <p className="rounded-xl bg-active px-3 py-2 text-sm text-primary">{error}</p>}
      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel} disabled={saving} className="rounded-xl px-4 py-2.5 text-sm font-bold text-muted">Cancel</button>
        <button disabled={saving} className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60">{saving ? "Saving..." : "Save product"}</button>
      </div>
    </form>
  );
}

function CategoryForm({ form, setForm, saving, error, onCancel, onSubmit, imagePreview, onImageSelect }) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="grid gap-1 text-xs font-bold text-muted">
        Category Name
        <input value={form.name} onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))} required maxLength={100} placeholder="T-Shirts" className="rounded-xl border border-border-subtle px-3 py-2.5 text-sm font-normal" />
      </label>
      <div>
        <p className="mb-1 text-xs font-bold text-muted">Category image (optional)</p>
        <label className="relative flex h-28 w-full cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-border-subtle bg-page">
          {imagePreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imagePreview} alt="Category preview" className="h-full w-full object-cover" />
          ) : (
            <span className="text-xs font-bold text-muted">Click to upload an image</span>
          )}
          <input type="file" accept="image/*" onChange={(e) => onImageSelect(e.target.files?.[0] || null)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
        </label>
      </div>
      <label className="grid gap-1 text-xs font-bold text-muted">
        Description (optional)
        <textarea value={form.description} onChange={(e) => setForm((c) => ({ ...c, description: e.target.value }))} rows={2} maxLength={500} placeholder="Academy T-Shirts" className="rounded-xl border border-border-subtle px-3 py-2.5 text-sm font-normal" />
      </label>
      {error && <p className="rounded-xl bg-active px-3 py-2 text-sm text-primary">{error}</p>}
      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel} disabled={saving} className="rounded-xl px-4 py-2.5 text-sm font-bold text-muted">Cancel</button>
        <button disabled={saving} className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60">{saving ? "Saving..." : "Create Category"}</button>
      </div>
    </form>
  );
}

function PickupEditor({ order, saving, onSave, onCancel }) {
  const [date, setDate] = useState(order.collectionDate || "");
  return (
    <div>
      <p className="mb-3 text-sm text-muted">Order <b className="font-mono">#{order.orderNumber || order.id}</b></p>
      <label className="grid gap-1 text-xs font-bold text-muted">
        Collection Date
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={saving} className="rounded-xl border border-border-subtle px-3 py-2.5 text-sm font-normal" />
      </label>
      <div className="mt-5 flex justify-end gap-3">
        <button type="button" onClick={onCancel} disabled={saving} className="rounded-xl px-4 py-2.5 text-sm font-bold text-muted">Cancel</button>
        <button type="button" onClick={() => onSave(date)} disabled={saving} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60">{saving ? "Saving..." : "Save"}</button>
      </div>
    </div>
  );
}

export default function Shop({ role, uid }) {
  const { profile } = useAuth();
  const canManage = managers.has(role);
  const [tab, setTab] = useState("Shop");
  const [orderingProduct, setOrderingProduct] = useState(null);
  const [products, setProducts] = useState([]);
  const [productsLoaded, setProductsLoaded] = useState(false);
  const [categories, setCategories] = useState([]);
  const [categoriesLoaded, setCategoriesLoaded] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [myOrders, setMyOrders] = useState([]);
  const [allOrders, setAllOrders] = useState([]);
  const [cart, setCart] = useState({});
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("newest");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [showCartCheckout, setShowCartCheckout] = useState(false);
  const [showCartDrawer, setShowCartDrawer] = useState(false);

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blankProduct);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);

  // Category management (Admin/Director only) — a separate small dialog
  // from the product one, reused both from "+ New Category" inside the
  // product form and from the Categories management tab below.
  const [addingCategory, setAddingCategory] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [categoryForm, setCategoryForm] = useState(blankCategory);
  const [categoryImageFile, setCategoryImageFile] = useState(null);
  const [categoryImagePreview, setCategoryImagePreview] = useState("");
  const [categorySaving, setCategorySaving] = useState(false);
  const [categoryFormError, setCategoryFormError] = useState("");
  const [confirmDeleteCategory, setConfirmDeleteCategory] = useState(null);
  // When "+ New Category" is opened from inside the product form, creating
  // one should return straight back to that product form with the new
  // category already selected — not just close everything.
  const [returnToProductForm, setReturnToProductForm] = useState(false);

  // Admin/Director "Change Pickup" — reassign an order's collection date.
  const [editingPickupOrder, setEditingPickupOrder] = useState(null);
  const [pickupSaving, setPickupSaving] = useState(false);

  useEffect(() => subscribeProducts((rows) => { setProducts(rows); setProductsLoaded(true); }, () => setProductsLoaded(true)), []);
  useEffect(() => subscribeCategories((rows) => { setCategories(rows); setCategoriesLoaded(true); }, () => setCategoriesLoaded(true)), []);
  useEffect(() => {
    if (!uid) return undefined;
    return subscribeMyOrders(uid, setMyOrders, () => {});
  }, [uid]);
  useEffect(() => {
    if (!canManage) return undefined;
    return subscribeAllOrders(setAllOrders, () => {});
  }, [canManage]);

  useEffect(() => {
    if (!notice && !error) return undefined;
    const timer = setTimeout(() => { setNotice(""); setError(""); }, 4000);
    return () => clearTimeout(timer);
  }, [notice, error]);

  const categoryMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const categoryCounts = useMemo(() => {
    const counts = new Map();
    products.forEach((p) => {
      if (p.categoryId) counts.set(p.categoryId, (counts.get(p.categoryId) || 0) + 1);
    });
    return counts;
  }, [products]);

  const visibleProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    const base = (canManage ? products : products.filter((p) => p.active !== false))
      .filter((p) => !term || `${p.name} ${p.description || ""}`.toLowerCase().includes(term))
      .filter((p) => categoryFilter === "all" || p.categoryId === categoryFilter);
    const sorted = [...base];
    if (sort === "price-asc") sorted.sort((a, b) => a.price - b.price);
    else if (sort === "price-desc") sorted.sort((a, b) => b.price - a.price);
    else if (sort === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
    else sorted.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    return sorted;
  }, [products, canManage, search, sort, categoryFilter]);
  const cartItems = useMemo(
    () => Object.entries(cart).filter(([, qty]) => qty > 0).map(([productId, qty]) => {
      const product = products.find((p) => p.id === productId);
      return product ? { product, quantity: qty } : null;
    }).filter(Boolean),
    [cart, products],
  );
  const cartTotal = cartItems.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  function setQuantity(productId, quantity, maxStock) {
    setCart((current) => ({ ...current, [productId]: Math.max(0, Math.min(quantity, maxStock)) }));
  }

  function handleCheckout() {
    if (!cartItems.length) return;
    setShowCartCheckout(true);
  }

  function openAdd() {
    setForm(blankProduct);
    setImageFile(null);
    setImagePreview("");
    setEditing(null);
    setAdding(true);
    setFormError("");
  }
  function openEdit(product) {
    setForm({
      name: product.name,
      description: product.description || "",
      price: product.price,
      stock: product.stock,
      categoryId: product.categoryId || "",
      variants: Array.isArray(product.variants) ? product.variants.map((v) => ({ ...v })) : [],
    });
    setImageFile(null);
    setImagePreview(product.imageUrl || "");
    setEditing(product);
    setAdding(false);
    setFormError("");
  }
  function closeForm() {
    setAdding(false);
    setEditing(null);
    setImageFile(null);
    setImagePreview("");
  }
  function selectImage(file) {
    setImageFile(file);
    setImagePreview(file ? URL.createObjectURL(file) : editing?.imageUrl || "");
  }

  async function submitProduct(e) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setFormError("");
    try {
      if (editing) {
        let imageUrl = editing.imageUrl || "";
        if (imageFile) ({ imageUrl } = await uploadProductImage(editing.id, imageFile));
        await updateProduct({ id: editing.id, ...form, imageUrl });
        setNotice("Product updated.");
      } else {
        const created = await createProduct(form);
        if (imageFile) {
          const { imageUrl } = await uploadProductImage(created.id, imageFile);
          await updateProduct({ id: created.id, imageUrl });
        }
        setNotice("Product added.");
      }
      closeForm();
    } catch (e) {
      setFormError(e.message || "Unable to save this product.");
    } finally {
      setSaving(false);
    }
  }

  // "+ New Category" from inside the product form: remembers to reopen the
  // product form (with the just-created category selected) once done,
  // instead of just closing back to the product list.
  function openNewCategoryFromProduct() {
    setReturnToProductForm(true);
    setAdding(false);
    setEditing(null);
    openAddCategory();
  }
  function openAddCategory() {
    setCategoryForm(blankCategory);
    setCategoryImageFile(null);
    setCategoryImagePreview("");
    setEditingCategory(null);
    setAddingCategory(true);
    setCategoryFormError("");
  }
  function openEditCategory(category) {
    setCategoryForm({ name: category.name, description: category.description || "" });
    setCategoryImageFile(null);
    setCategoryImagePreview(category.imageUrl || "");
    setEditingCategory(category);
    setAddingCategory(false);
    setCategoryFormError("");
  }
  function closeCategoryForm() {
    setAddingCategory(false);
    setEditingCategory(null);
    setCategoryImageFile(null);
    setCategoryImagePreview("");
    setReturnToProductForm(false);
  }
  function selectCategoryImage(file) {
    setCategoryImageFile(file);
    setCategoryImagePreview(file ? URL.createObjectURL(file) : editingCategory?.imageUrl || "");
  }

  async function submitCategory(e) {
    e.preventDefault();
    if (categorySaving) return;
    setCategorySaving(true);
    setCategoryFormError("");
    try {
      let newCategoryId = editingCategory?.id;
      if (editingCategory) {
        let imageUrl = editingCategory.imageUrl || "";
        if (categoryImageFile) ({ imageUrl } = await uploadCategoryImage(editingCategory.id, categoryImageFile));
        await updateCategory({ id: editingCategory.id, ...categoryForm, imageUrl });
        setNotice("Category updated.");
      } else {
        const created = await createCategory(categoryForm);
        newCategoryId = created.id;
        if (categoryImageFile) {
          const { imageUrl } = await uploadCategoryImage(created.id, categoryImageFile);
          await updateCategory({ id: created.id, imageUrl });
        }
        setNotice("Category created.");
      }
      const shouldReturn = returnToProductForm;
      closeCategoryForm();
      if (shouldReturn) {
        // Reopen the product form with the new category already selected —
        // never a fake, frontend-only category: by this point it's already
        // persisted via createCategory() above.
        setForm((current) => ({ ...current, categoryId: newCategoryId }));
        setAdding(true);
      }
    } catch (e) {
      setCategoryFormError(e.message || "Unable to save this category.");
    } finally {
      setCategorySaving(false);
    }
  }

  async function toggleCategoryActive(category) {
    try {
      await updateCategory({ id: category.id, active: category.active === false });
      setNotice(category.active === false ? "Category listed." : "Category unlisted.");
    } catch (e) {
      setError(e.message || "Unable to update this category.");
    }
  }
  async function confirmDeleteCategoryAction() {
    if (!confirmDeleteCategory) return;
    try {
      await deleteCategory(confirmDeleteCategory.id);
      setNotice("Category deleted.");
      setConfirmDeleteCategory(null);
    } catch (e) {
      setError(e.message || "Unable to delete this category.");
      setConfirmDeleteCategory(null);
    }
  }

  async function toggleActive(product) {
    try {
      await updateProduct({ id: product.id, active: product.active === false });
      setNotice(product.active === false ? "Product listed." : "Product unlisted.");
    } catch (e) {
      setError(e.message || "Unable to update this product.");
    }
  }
  async function confirmDeleteProduct() {
    if (!confirmDelete) return;
    try {
      await deleteProduct(confirmDelete.id);
      setNotice("Product deleted.");
      setConfirmDelete(null);
    } catch (e) {
      setError(e.message || "Unable to delete this product.");
    }
  }
  async function markOrder(order, status) {
    try {
      await updateOrderStatus(order.id, status);
      setNotice(`Order marked ${status}.`);
    } catch (e) {
      setError(e.message || "Unable to update this order.");
    }
  }

  async function savePickup(dateValue) {
    if (!editingPickupOrder || pickupSaving) return;
    setPickupSaving(true);
    try {
      await updateOrderCollection(editingPickupOrder.id, dateValue);
      setNotice("Pickup date updated.");
      setEditingPickupOrder(null);
    } catch (e) {
      setError(e.message || "Unable to update the pickup date.");
    } finally {
      setPickupSaving(false);
    }
  }

  const tabs = ["Shop", "Orders", ...(canManage ? ["Manage Products", "Categories"] : [])];
  const ordersToShow = canManage ? allOrders : myOrders;
  const pendingOrderCount = (canManage ? allOrders : myOrders).filter((order) => (order.status || "pending") === "pending").length;

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-[#f3aaaa] bg-[linear-gradient(120deg,#fff0f0_0%,#fff7f7_45%,#ffffff_100%)] p-6 text-ink shadow-xl">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-active p-3"><ShoppingBag className="h-7 w-7 text-primary" aria-hidden="true" /></div>
          <div>
            <h2 className="text-3xl font-black">My Shop</h2>
            <p className="mt-1 text-sm text-muted">Browse products, place orders, and {canManage ? "manage stock" : "track your orders"}.</p>
          </div>
        </div>
        {canManage && (
          <button type="button" onClick={openAdd} className="rounded-xl bg-primary px-4 py-3 text-xs font-bold text-white">Add Product</button>
        )}
      </section>

      {notice && <p className="rounded-xl bg-success-soft p-4 text-sm text-success">{notice}</p>}
      {error && <p className="rounded-xl bg-active p-4 text-sm text-primary">{error}</p>}

      <div className="flex gap-2">
        {tabs.map((item) => (
          <button key={item} type="button" onClick={() => setTab(item)} className={`flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition ${tab === item ? "bg-primary text-white" : "bg-page text-muted hover:bg-active hover:text-primary"}`}>
            {item}
            {item === "Orders" && pendingOrderCount > 0 && (
              <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${tab === item ? "bg-white text-primary" : "bg-primary text-white"}`}>{pendingOrderCount}</span>
            )}
          </button>
        ))}
      </div>

      {tab === "Shop" && (
        <>
          <section>
            {/* Category navigation — dynamically generated from real
                productCategories docs, never hardcoded. "All" is a
                UI-only filter, not a database category. Horizontal
                scroll (not wrapping) keeps a long category list from
                ever causing page-level overflow. Storefront-style pills
                with an optional real category thumbnail, deliberately
                visually distinct from the Shop/Orders/Manage Products
                admin tab row above. */}
            {categoriesLoaded && categories.some((c) => c.active !== false) && (
              <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
                <button
                  type="button"
                  onClick={() => setCategoryFilter("all")}
                  className={`shrink-0 rounded-full px-5 py-2.5 text-sm font-bold transition ${categoryFilter === "all" ? "bg-ink text-white shadow-sm" : "border border-border-subtle bg-white text-muted hover:border-ink hover:text-ink"}`}
                >
                  All
                </button>
                {categories.filter((c) => c.active !== false).map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => setCategoryFilter(category.id)}
                    className={`flex shrink-0 items-center gap-2 rounded-full py-1.5 pl-1.5 pr-5 text-sm font-bold transition ${categoryFilter === category.id ? "bg-ink text-white shadow-sm" : "border border-border-subtle bg-white text-muted hover:border-ink hover:text-ink"}`}
                  >
                    {category.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={category.imageUrl} alt="" className="h-7 w-7 rounded-full object-cover" />
                    ) : (
                      <span className={`grid h-7 w-7 place-items-center rounded-full ${categoryFilter === category.id ? "bg-white/20" : "bg-page"}`}>
                        <Tag className="h-3.5 w-3.5" aria-hidden="true" />
                      </span>
                    )}
                    {category.name}
                  </button>
                ))}
              </div>
            )}

            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <label className="relative min-w-56 flex-1">
                <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products..." className="w-full rounded-xl border border-border-subtle bg-white py-2.5 pl-10 pr-3 text-sm shadow-sm" />
              </label>
              <div className="flex shrink-0 items-center gap-3">
                <label className="flex items-center gap-2 text-xs font-bold text-muted">
                  <ArrowUpDown className="h-3.5 w-3.5" aria-hidden="true" />
                  Sort by
                  <select value={sort} onChange={(e) => setSort(e.target.value)} className="rounded-xl border border-border-subtle bg-white px-3 py-2.5 text-xs font-bold text-ink shadow-sm">
                    {SORT_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                {!canManage && (
                  <button
                    type="button"
                    onClick={() => setShowCartDrawer(true)}
                    className="relative flex items-center gap-2 rounded-xl border border-border-subtle bg-white px-3.5 py-2.5 text-xs font-bold text-ink shadow-sm transition hover:border-primary hover:text-primary"
                  >
                    <ShoppingCart className="h-4 w-4" aria-hidden="true" />
                    Cart
                    {cartCount > 0 && (
                      <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[10px] font-black text-white">{cartCount}</span>
                    )}
                  </button>
                )}
              </div>
            </div>

            {!productsLoaded ? (
              <Spinner label="Loading products..." />
            ) : !visibleProducts.length ? (
              <div className="rounded-3xl border border-dashed border-border-subtle bg-white py-16 text-center">
                {search || categoryFilter !== "all" ? (
                  <>
                    <p className="font-bold text-ink">No products found</p>
                    <p className="mt-1 text-sm text-muted">Try another search or category.</p>
                  </>
                ) : (
                  <>
                    <p className="font-bold text-ink">No products available yet.</p>
                    {canManage && (
                      <button type="button" onClick={openAdd} className="mt-4 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-white">+ Add Product</button>
                    )}
                  </>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
                {visibleProducts.map((product) => {
                  const inCart = cart[product.id] || 0;
                  const outOfStock = (product.stock || 0) <= 0;
                  const lowStock = !outOfStock && product.stock <= LOW_STOCK_THRESHOLD;
                  return (
                    <article
                      key={product.id}
                      className="group flex flex-col overflow-hidden rounded-xl border border-border-subtle/60 bg-white shadow-sm ring-1 ring-transparent transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-border-subtle hover:shadow-md focus-within:ring-primary/40"
                    >
                      <div className={`relative aspect-square w-full overflow-hidden bg-page ${outOfStock ? "grayscale" : ""}`}>
                        {product.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-105" />
                        ) : (
                          <div className="grid h-full w-full place-items-center text-subtle"><ShoppingBag className="h-7 w-7" aria-hidden="true" /></div>
                        )}
                        {product.active === false && (
                          <span className="absolute left-1.5 top-1.5 rounded-md bg-slate-900/75 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">Unlisted</span>
                        )}
                        {/* Exactly one stock indicator ever shows on the
                            card face — the overlay/badge here when stock is
                            zero/low, otherwise plain "N in stock" text below,
                            never both at once. */}
                        {outOfStock ? (
                          <div className="absolute inset-0 grid place-items-center bg-slate-950/40">
                            <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-primary shadow-sm">Sold out</span>
                          </div>
                        ) : lowStock ? (
                          <span className="absolute right-1.5 top-1.5 rounded-md bg-warning px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white shadow-sm">Only {product.stock} left</span>
                        ) : null}
                      </div>
                      <div className="flex flex-1 flex-col p-2.5 sm:p-3">
                        {product.categoryId && categoryMap.get(product.categoryId) && (
                          <span className="mb-0.5 truncate text-[9px] font-bold uppercase tracking-wider text-subtle">{categoryMap.get(product.categoryId).name}</span>
                        )}
                        <b className="line-clamp-1 text-[13px] leading-tight text-ink sm:text-sm">{product.name}</b>
                        <p className="mt-0.5 line-clamp-1 text-[11px] leading-tight text-muted">{product.description || " "}</p>
                        <div className="mt-1.5 flex items-baseline justify-between gap-2">
                          <span className="tabular-nums text-sm font-black text-ink sm:text-base">{money(product.price)}</span>
                          {!outOfStock && !lowStock && <span className="truncate text-[10px] font-semibold text-subtle">{product.stock} in stock</span>}
                        </div>
                        {canManage ? (
                          <div className="mt-2.5 flex items-center justify-between gap-0.5 border-t border-border-subtle pt-2.5">
                            <button type="button" onClick={() => openEdit(product)} title="Edit" aria-label="Edit product" className="flex items-center gap-1 rounded-lg px-1.5 py-1 text-[10px] font-bold text-muted transition-colors hover:bg-page hover:text-ink"><Pencil className="h-3.5 w-3.5" aria-hidden="true" /><span className="hidden sm:inline">Edit</span></button>
                            <button type="button" onClick={() => toggleActive(product)} title={product.active === false ? "List" : "Unlist"} aria-label={product.active === false ? "List product" : "Unlist product"} className="flex items-center gap-1 rounded-lg px-1.5 py-1 text-[10px] font-bold text-muted transition-colors hover:bg-page hover:text-info">
                              {product.active === false ? <Eye className="h-3.5 w-3.5" aria-hidden="true" /> : <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />}
                              <span className="hidden sm:inline">{product.active === false ? "List" : "Unlist"}</span>
                            </button>
                            <button type="button" onClick={() => setConfirmDelete(product)} title="Delete" aria-label="Delete product" className="flex items-center gap-1 rounded-lg px-1.5 py-1 text-[10px] font-bold text-muted transition-colors hover:bg-active hover:text-primary"><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /><span className="hidden sm:inline">Delete</span></button>
                          </div>
                        ) : (
                          <div className="mt-2.5 space-y-1.5 border-t border-border-subtle pt-2.5">
                            <div className="flex items-center justify-between gap-1.5">
                              <div className="flex items-center gap-1.5">
                                <button type="button" disabled={inCart <= 0} onClick={() => setQuantity(product.id, inCart - 1, product.stock)} aria-label="Decrease quantity" className="grid h-6 w-6 place-items-center rounded-md border border-border-subtle text-muted transition-colors hover:border-primary hover:text-primary disabled:opacity-40 disabled:hover:border-border-subtle disabled:hover:text-muted"><Minus className="h-3 w-3" /></button>
                                <span className="w-4 text-center text-xs font-bold tabular-nums">{inCart}</span>
                                <button type="button" disabled={outOfStock || inCart >= product.stock} onClick={() => setQuantity(product.id, inCart + 1, product.stock)} aria-label="Increase quantity" className="grid h-6 w-6 place-items-center rounded-md border border-border-subtle text-muted transition-colors hover:border-primary hover:text-primary disabled:opacity-40 disabled:hover:border-border-subtle disabled:hover:text-muted"><Plus className="h-3 w-3" /></button>
                              </div>
                              <button
                                type="button"
                                disabled={outOfStock}
                                onClick={() => setQuantity(product.id, inCart <= 0 ? 1 : inCart, product.stock)}
                                className="rounded-md bg-primary px-2.5 py-1 text-[11px] font-bold text-white transition-colors hover:bg-primary-hover disabled:opacity-40"
                              >
                                {inCart > 0 ? "In cart" : "Add"}
                              </button>
                            </div>
                            {/* "Order Now" is a separate, immediate single-
                                product checkout (customer info, real
                                size/variant selection, real collection
                                session, notes) — it bypasses the cart above
                                entirely but posts through the exact same
                                /api/shop/checkout endpoint. */}
                            <button
                              type="button"
                              disabled={outOfStock}
                              onClick={() => setOrderingProduct(product)}
                              className="w-full rounded-md border border-border-subtle py-1 text-[11px] font-bold text-ink transition-colors hover:border-primary hover:text-primary disabled:opacity-40"
                            >
                              Order Now
                            </button>
                          </div>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}

      {tab === "Orders" && (
        <section className="rounded-3xl border border-border-subtle bg-white p-5 shadow-sm md:p-6">
          <h3 className="mb-1 font-bold text-ink">{canManage ? "All orders" : "My orders"}</h3>
          <p className="mb-4 text-xs text-muted">{canManage ? "Every order placed across the shop." : "Your own order history."}</p>
          <DataTable
            title="orders"
            name="shop-orders"
            enableExport={canManage}
            columns={[
              { key: "orderNumber", header: "Order #", sortable: true, accessor: (o) => o.orderNumber || o.id, render: (o) => <span className="font-mono text-xs text-muted">{o.orderNumber || dash}</span> },
              ...(canManage ? [{ key: "customerName", header: "Buyer", sortable: true, accessor: (o) => `${o.customerName || o.buyerName || ""} ${o.customerEmail || o.buyerEmail || ""}`, render: (o) => <span><b className="block text-ink">{o.customerName || o.buyerName || dash}</b><span className="block text-[11px] text-muted">{o.customerPhone || ""}</span><span className="text-[11px] text-muted">{o.customerEmail || o.buyerEmail}</span></span>, exportValue: (o) => o.customerName || o.buyerName || "" }] : []),
              { key: "items", header: "Items", accessor: (o) => (o.items || []).map((i) => `${i.name}${i.variantLabel ? ` (${i.variantLabel})` : ""} × ${i.quantity}`).join("; "), render: (o) => <span className="text-xs text-muted">{(o.items || []).map((i) => <span key={i.productId} className="block">{i.name}{i.variantLabel ? ` (${i.variantLabel})` : ""} × {i.quantity}</span>)}</span> },
              { key: "collectionDate", header: "Collection", sortable: true, accessor: (o) => o.collectionDate || "", render: (o) => <span className="text-xs text-muted">{o.collectionDate ? formatDate(o.collectionDate) : dash}</span> },
              { key: "totalAmount", header: "Total", align: "right", sortable: true, accessor: (o) => Number(o.totalAmount || 0), render: (o) => <b className="text-ink">{money(o.totalAmount)}</b>, exportValue: (o) => Number(o.totalAmount || 0) },
              { key: "status", header: "Status", sortable: true, filter: {}, accessor: (o) => o.status || "pending", render: (o) => <StatusBadge status={o.status} /> },
            ]}
            rows={[...ordersToShow].sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))}
            initialSort={null}
            pageSize={10}
            emptyLabel="No orders yet."
            rowActions={canManage ? (order) => (
              <>
                {order.status !== "fulfilled" && <button type="button" onClick={() => markOrder(order, "fulfilled")} className="rounded-lg border border-border-subtle px-2.5 py-1.5 text-[11px] font-bold text-success hover:bg-page">Fulfil</button>}
                {order.status !== "cancelled" && <button type="button" onClick={() => markOrder(order, "cancelled")} className="rounded-lg border border-border-subtle px-2.5 py-1.5 text-[11px] font-bold text-primary hover:bg-page">Cancel</button>}
                <button type="button" onClick={() => setEditingPickupOrder(order)} className="rounded-lg border border-border-subtle px-2.5 py-1.5 text-[11px] font-bold text-info hover:bg-page">Pickup</button>
              </>
            ) : undefined}
          />
        </section>
      )}

      {tab === "Manage Products" && canManage && (
        <section className="rounded-3xl border border-border-subtle bg-white p-5 shadow-sm md:p-6">
          <h3 className="mb-4 font-bold text-ink">All products</h3>
          {!products.length ? (
            <p className="py-10 text-center text-sm text-muted">No products yet. Click &quot;Add Product&quot; to create the first one.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b text-[10px] uppercase tracking-wider text-subtle">
                  <tr>{["Product", "Category", "Price", "Stock", "Status", "Actions"].map((label) => <th key={label} className="p-3">{label}</th>)}</tr>
                </thead>
                <tbody>
                  {products.map((product) => (
                    <tr key={product.id} className="border-b border-border-subtle">
                      <td className="p-3 font-semibold text-ink">
                        {product.name}
                        {Array.isArray(product.variants) && product.variants.length > 0 && (
                          <span className="ml-2 rounded-full bg-active px-2 py-0.5 text-[10px] font-bold text-primary">{product.variants.length} sizes</span>
                        )}
                      </td>
                      <td className="p-3 text-muted">{product.categoryId ? (categoryMap.get(product.categoryId)?.name || "—") : "Uncategorized"}</td>
                      <td className="p-3 text-muted">{money(product.price)}</td>
                      <td className="p-3 text-muted">{product.stock}</td>
                      <td className="p-3">
                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${product.active === false ? "bg-page text-muted" : "bg-success-soft text-success"}`}>
                          {product.active === false ? "Unlisted" : "Listed"}
                        </span>
                      </td>
                      <td className="space-x-3 whitespace-nowrap p-3 text-xs font-bold">
                        <button type="button" onClick={() => openEdit(product)} className="text-muted hover:text-primary">Edit</button>
                        <button type="button" onClick={() => toggleActive(product)} className="text-info hover:underline">{product.active === false ? "List" : "Unlist"}</button>
                        <button type="button" onClick={() => setConfirmDelete(product)} className="text-primary hover:underline">Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === "Categories" && canManage && (
        <section className="rounded-3xl border border-border-subtle bg-white p-5 shadow-sm md:p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-bold text-ink">Categories</h3>
            <button type="button" onClick={openAddCategory} className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white">+ Add Category</button>
          </div>
          {!categoriesLoaded ? (
            <Spinner label="Loading categories..." />
          ) : !categories.length ? (
            <p className="py-10 text-center text-sm text-muted">No categories yet. Click &quot;Add Category&quot; to create the first one.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b text-[10px] uppercase tracking-wider text-subtle">
                  <tr>{["Image", "Category", "Products", "Status", "Actions"].map((label) => <th key={label} className="p-3">{label}</th>)}</tr>
                </thead>
                <tbody>
                  {categories.map((category) => (
                    <tr key={category.id} className="border-b border-border-subtle">
                      <td className="p-3">
                        {category.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={category.imageUrl} alt={category.name} className="h-10 w-10 rounded-lg object-cover" />
                        ) : (
                          <div className="grid h-10 w-10 place-items-center rounded-lg bg-page text-subtle"><Tag className="h-4 w-4" aria-hidden="true" /></div>
                        )}
                      </td>
                      <td className="p-3 font-semibold text-ink">{category.name}</td>
                      <td className="p-3 text-muted">{categoryCounts.get(category.id) || 0}</td>
                      <td className="p-3">
                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${category.active === false ? "bg-page text-muted" : "bg-success-soft text-success"}`}>
                          {category.active === false ? "Inactive" : "Active"}
                        </span>
                      </td>
                      <td className="space-x-3 whitespace-nowrap p-3 text-xs font-bold">
                        <button type="button" onClick={() => openEditCategory(category)} className="text-muted hover:text-primary">Edit</button>
                        <button type="button" onClick={() => toggleCategoryActive(category)} className="text-info hover:underline">{category.active === false ? "Activate" : "Deactivate"}</button>
                        <button type="button" onClick={() => setConfirmDeleteCategory(category)} className="text-primary hover:underline">Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {(adding || editing) && (
        <Dialog title={editing ? "Edit product" : "Add product"} onClose={closeForm}>
          <ProductForm form={form} setForm={setForm} saving={saving} error={formError} onCancel={closeForm} onSubmit={submitProduct} imagePreview={imagePreview} onImageSelect={selectImage} categories={categories} onNewCategory={openNewCategoryFromProduct} />
        </Dialog>
      )}

      {(addingCategory || editingCategory) && (
        <Dialog title={editingCategory ? "Edit category" : "Create Category"} onClose={closeCategoryForm}>
          <CategoryForm form={categoryForm} setForm={setCategoryForm} saving={categorySaving} error={categoryFormError} onCancel={closeCategoryForm} onSubmit={submitCategory} imagePreview={categoryImagePreview} onImageSelect={selectCategoryImage} />
        </Dialog>
      )}

      {editingPickupOrder && (
        <Dialog title="Change Pickup Date" onClose={() => setEditingPickupOrder(null)}>
          <PickupEditor order={editingPickupOrder} saving={pickupSaving} onSave={savePickup} onCancel={() => setEditingPickupOrder(null)} />
        </Dialog>
      )}

      {confirmDelete && (
        <Dialog title="Delete product" onClose={() => setConfirmDelete(null)}>
          <p className="text-sm text-muted">Delete <b>{confirmDelete.name}</b>? This cannot be undone.</p>
          <div className="mt-5 flex justify-end gap-3">
            <button type="button" onClick={() => setConfirmDelete(null)} className="rounded-xl px-4 py-2.5 text-sm font-bold text-muted">Cancel</button>
            <button type="button" onClick={confirmDeleteProduct} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white">Delete</button>
          </div>
        </Dialog>
      )}

      {confirmDeleteCategory && (
        <Dialog title="Delete category" onClose={() => setConfirmDeleteCategory(null)}>
          <p className="text-sm text-muted">Delete <b>{confirmDeleteCategory.name}</b>? This cannot be undone.</p>
          <div className="mt-5 flex justify-end gap-3">
            <button type="button" onClick={() => setConfirmDeleteCategory(null)} className="rounded-xl px-4 py-2.5 text-sm font-bold text-muted">Cancel</button>
            <button type="button" onClick={confirmDeleteCategoryAction} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white">Delete</button>
          </div>
        </Dialog>
      )}

      {/* Cart lives in a right-hand slide-over now (not a column beside the
          product grid) so the storefront grid is full-width and matches the
          Admin/Director Shop tab. Managers never see this — they don't buy. */}
      {showCartDrawer && !canManage && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/50" role="dialog" aria-modal="true" onClick={() => setShowCartDrawer(false)}>
          <div className="flex h-full w-full max-w-sm flex-col bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border-subtle p-5">
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 text-primary" aria-hidden="true" />
                <b className="text-sm text-ink">Your cart{cartCount > 0 ? ` (${cartCount})` : ""}</b>
              </div>
              <button type="button" onClick={() => setShowCartDrawer(false)} className="text-xl text-muted" aria-label="Close cart">×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {!cartItems.length ? (
                <p className="text-sm text-muted">Your cart is empty. Add products from the shop to get started.</p>
              ) : (
                <div className="space-y-4">
                  {cartItems.map(({ product, quantity }) => (
                    <div key={product.id} className="flex gap-3">
                      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-page">
                        {product.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={product.imageUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="grid h-full w-full place-items-center text-subtle"><ShoppingBag className="h-5 w-5" aria-hidden="true" /></div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <b className="block truncate text-sm text-ink">{product.name}</b>
                        <span className="text-xs text-muted">{money(product.price)}</span>
                        <div className="mt-1.5 flex items-center gap-2">
                          <button type="button" onClick={() => setQuantity(product.id, quantity - 1, product.stock)} className="grid h-6 w-6 place-items-center rounded border border-border-subtle text-muted"><Minus className="h-3 w-3" /></button>
                          <span className="w-5 text-center text-xs font-bold">{quantity}</span>
                          <button type="button" disabled={quantity >= product.stock} onClick={() => setQuantity(product.id, quantity + 1, product.stock)} className="grid h-6 w-6 place-items-center rounded border border-border-subtle text-muted disabled:opacity-40"><Plus className="h-3 w-3" /></button>
                          <button type="button" onClick={() => setQuantity(product.id, 0, product.stock)} className="ml-auto text-[11px] font-bold text-primary hover:underline">Remove</button>
                        </div>
                      </div>
                      <span className="shrink-0 text-sm font-bold text-ink">{money(product.price * quantity)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {cartItems.length > 0 && (
              <div className="border-t border-border-subtle p-5">
                <div className="mb-3 flex items-center justify-between text-sm font-bold text-ink">
                  <span>Total</span>
                  <span>{money(cartTotal)}</span>
                </div>
                <button type="button" onClick={() => { setShowCartDrawer(false); handleCheckout(); }} className="w-full rounded-xl bg-primary py-3 text-sm font-bold text-white">Checkout</button>
              </div>
            )}
          </div>
        </div>
      )}

      {orderingProduct && (
        <ProductOrderModal
          product={orderingProduct}
          uid={uid}
          profile={profile}
          role={role}
          onClose={() => setOrderingProduct(null)}
          onViewOrders={() => {
            setOrderingProduct(null);
            setTab("Orders");
          }}
        />
      )}

      {showCartCheckout && (
        <CartCheckoutModal
          cartItems={cartItems}
          cartTotal={cartTotal}
          uid={uid}
          profile={profile}
          role={role}
          onClose={() => setShowCartCheckout(false)}
          onOrdered={() => setCart({})}
          onViewOrders={() => {
            setShowCartCheckout(false);
            setTab("Orders");
          }}
        />
      )}
    </div>
  );
}
