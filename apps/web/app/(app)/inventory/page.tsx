"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
    Package, Plus, Search, AlertTriangle, RefreshCw,
    ChevronUp, ChevronDown, X, Loader2, TrendingUp
} from "lucide-react";
import { inventoryApi, CreateItemPayload } from "@/lib/api/inventory";
import clsx from "clsx";
import { InfiniteScrollObserver } from "@/components/InfiniteScrollObserver";
import { api } from "@/lib/api/client";

interface ItemRow {
    id: string;
    name: string;
    sku: string | null;
    description: string | null;
    purchase_price: string;
    selling_price: string;
    quantity: number;
    low_stock_threshold: number;
    is_low_stock: boolean;
}

// ── Add / Edit Modal ───────────────────────────────────────────────────────────
function ItemModal({
    item,
    onClose,
    onSave,
}: {
    item?: ItemRow;
    onClose: () => void;
    onSave: () => void;
}) {
    const [form, setForm] = useState<Partial<CreateItemPayload>>({
        name: item?.name ?? "",
        sku: item?.sku ?? "",
        description: item?.description ?? "",
        purchase_price: item?.purchase_price ?? "",
        selling_price: item?.selling_price ?? "",
        quantity: item?.quantity ?? 0,
        low_stock_threshold: item?.low_stock_threshold ?? 5,
    });
    const [loading, setLoading] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();

    useEffect(() => {
        api.get("/shops/me").then(r => {
            if (!r.data?.address) {
                router.push("/onboarding?from=inventory");
            }
        }).catch(() => {});
    }, [router]);

    const handleSave = async () => {
        setLoading(true);
        setError(null);
        try {
            if (item) {
                await inventoryApi.update(item.id, form);
            } else {
                await inventoryApi.create(form as CreateItemPayload);
            }
            onSave();
        } catch (e: unknown) {
            const err = e as { response?: { data?: { detail?: string | Array<{ msg: string }> } } };
            const detail = err.response?.data?.detail;
            if (Array.isArray(detail)) {
                setError(detail[0]?.msg || "Validation error");
            } else {
                setError(detail || "Failed to save item.");
            }
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!item) return;
        if (!window.confirm("Are you sure you want to delete this item?")) return;

        setDeleting(true);
        setError(null);
        try {
            await inventoryApi.delete(item.id);
            onSave(); // Trigger refresh and close
        } catch (e: unknown) {
            const err = e as { response?: { data?: { detail?: string } } };
            setError(err.response?.data?.detail || "Failed to delete item.");
            setDeleting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="bg-card border border-border shadow-md rounded-2xl p-6 w-full max-w-md">
                <div className="flex items-center justify-between mb-5">
                    <h2 className="text-lg font-semibold text-foreground">
                        {item ? "Edit Item" : "Add Inventory Item"}
                    </h2>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {error && (
                    <div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-800 text-red-300 text-sm">
                        {error}
                    </div>
                )}

                <div className="space-y-3">
                    {[
                        { key: "name", label: "Name *", type: "text", placeholder: "e.g. iPhone 14 Screen" },
                        { key: "sku", label: "SKU", type: "text", placeholder: "e.g. IPH14-SCR" },
                        { key: "purchase_price", label: "Purchase Price (₹) *", type: "number", placeholder: "0.00" },
                        { key: "selling_price", label: "Selling Price (₹) *", type: "number", placeholder: "0.00" },
                        { key: "quantity", label: "Initial Quantity", type: "number", placeholder: "0" },
                        { key: "low_stock_threshold", label: "Low Stock Alert", type: "number", placeholder: "5" },
                    ].map(({ key, label, type, placeholder }) => (
                        <div key={key}>
                            <label className="block text-xs font-medium text-muted-foreground mb-1">{label}</label>
                            <input
                                type={type}
                                value={(form as Record<string, string | number>)[key] ?? ""}
                                onChange={(e) =>
                                    setForm((f) => ({
                                        ...f,
                                        [key]: ["quantity", "low_stock_threshold"].includes(key) ? Number(e.target.value) : e.target.value,
                                    }))
                                }
                                placeholder={placeholder}
                                className="w-full px-3 py-2 rounded-lg bg-card border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary text-sm shadow-sm"
                            />
                        </div>
                    ))}
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Description</label>
                        <textarea
                            value={form.description ?? ""}
                            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                            rows={2}
                            placeholder="Optional notes..."
                            className="w-full px-3 py-2 rounded-lg bg-card border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary text-sm resize-none shadow-sm"
                        />
                    </div>
                </div>

                <div className="flex gap-3 mt-5">
                    {item && (
                        <button
                            onClick={handleDelete}
                            disabled={loading || deleting}
                            className="flex-1 py-2 rounded-lg bg-red-900/20 border border-red-900/50 text-red-500 hover:bg-red-900/40 hover:text-red-400 text-sm font-medium transition disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete"}
                        </button>
                    )}
                    <button
                        onClick={onClose}
                        disabled={loading || deleting}
                        className="flex-1 py-2 rounded-lg bg-muted border border-border text-foreground text-sm hover:bg-muted/80 shadow-sm transition disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={loading || deleting}
                        className="flex-1 py-2 rounded-lg gradient-primary text-white text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        {item ? "Save Changes" : "Add Item"}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Stock Adjustment Modal ─────────────────────────────────────────────────────
function StockModal({
    item,
    onClose,
    onSave,
}: {
    item: ItemRow;
    onClose: () => void;
    onSave: () => void;
}) {
    const [delta, setDelta] = useState(0);
    const [notes, setNotes] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleAdjust = async () => {
        if (delta === 0) return;
        setLoading(true);
        setError(null);
        try {
            await inventoryApi.adjustStock(item.id, delta, notes || undefined);
            onSave();
        } catch (e: unknown) {
            const err = e as { response?: { data?: { detail?: string } } };
            setError(err.response?.data?.detail || "Failed to adjust stock.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm shadow-md">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-foreground">Adjust Stock</h2>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <p className="text-muted-foreground text-sm mb-4">
                    <span className="text-foreground font-medium">{item.name}</span> — current qty:{" "}
                    <span className="text-foreground font-bold">{item.quantity}</span>
                </p>
                {error && (
                    <div className="mb-3 p-2 rounded-lg bg-red-900/30 border border-red-800 text-red-300 text-xs">
                        {error}
                    </div>
                )}
                <div className="mb-3">
                    <label className="block text-xs font-medium text-muted-foreground mb-1">
                        Quantity change (positive = restock, negative = deduct)
                    </label>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setDelta((d) => d - 1)}
                            className="p-2 rounded-lg bg-muted border border-border hover:bg-muted/80 text-foreground transition"
                        >
                            <ChevronDown className="w-4 h-4" />
                        </button>
                        <input
                            type="number"
                            value={delta}
                            onChange={(e) => setDelta(Number(e.target.value))}
                            className="flex-1 text-center px-3 py-2 rounded-lg bg-card border border-border text-foreground font-bold focus:outline-none focus:border-primary shadow-sm"
                        />
                        <button
                            onClick={() => setDelta((d) => d + 1)}
                            className="p-2 rounded-lg bg-muted border border-border hover:bg-muted/80 text-foreground transition"
                        >
                            <ChevronUp className="w-4 h-4" />
                        </button>
                    </div>
                    {delta !== 0 && (
                        <p className="text-xs text-muted-foreground mt-1 text-center">
                            New qty: {item.quantity + delta}
                        </p>
                    )}
                </div>
                <input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Notes (optional)"
                    className="w-full px-3 py-2 rounded-lg bg-card border border-border text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:border-primary mb-4 shadow-sm"
                />
                <div className="flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 py-2 rounded-lg bg-muted border border-border text-foreground shadow-sm text-sm hover:bg-muted/80 transition"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleAdjust}
                        disabled={loading || delta === 0}
                        className="flex-1 py-2 rounded-lg gradient-primary text-white text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        Confirm
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Main Inventory Page ────────────────────────────────────────────────────────
export default function InventoryPage() {
    const [items, setItems] = useState<ItemRow[]>([]);
    const [total, setTotal] = useState(0);
    const [pages, setPages] = useState(1);
    const [page, setPage] = useState(1);
    const [lowStockCount, setLowStockCount] = useState(0);
    const [search, setSearch] = useState("");
    const [lowStockOnly, setLowStockOnly] = useState(false);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [addModal, setAddModal] = useState(false);
    const [editItem, setEditItem] = useState<ItemRow | null>(null);
    const [stockItem, setStockItem] = useState<ItemRow | null>(null);

    const load = useCallback(async () => {
        if (page === 1) setLoading(true);
        else setLoadingMore(true);

        try {
            const res = await inventoryApi.list({
                search: search || undefined,
                low_stock_only: lowStockOnly || undefined,
                page,
                per_page: 20,
            });
            setItems(prev => page === 1 ? res.items : [...prev, ...res.items]);
            setTotal(res.total);
            setPages(res.pages);
            setLowStockCount(res.low_stock_count);
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    }, [search, lowStockOnly, page]);

    useEffect(() => { load(); }, [load]);

    const margin = (item: ItemRow) => {
        const buy = parseFloat(item.purchase_price);
        const sell = parseFloat(item.selling_price);
        if (buy <= 0) return null;
        return (((sell - buy) / buy) * 100).toFixed(0);
    };

    return (
        <div className="p-6 max-w-6xl mx-auto">
            {/* Header / Stats */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-lg font-bold text-foreground">Parts List</h2>
                    <p className="text-muted-foreground font-medium text-sm mt-1">{total} items total</p>
                </div>
                <div className="flex items-center gap-3">
                    {lowStockCount > 0 && (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-900/40 border border-amber-800 text-amber-300 text-sm">
                            <AlertTriangle className="w-4 h-4" />
                            {lowStockCount} low stock
                        </div>
                    )}
                    <button
                        onClick={() => setAddModal(true)}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-lg gradient-primary text-white font-medium text-sm hover:opacity-90 transition"
                    >
                        <Plus className="w-4 h-4" /> Add Item
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="flex gap-3 mb-5">
                <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                        placeholder="Search by name..."
                        className="w-full pl-9 pr-4 py-2.5 rounded-lg bg-card border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary text-sm shadow-sm"
                    />
                </div>
                <button
                    onClick={() => { setLowStockOnly((v) => !v); setPage(1); }}
                    className={clsx(
                        "px-4 py-2.5 rounded-lg border text-sm font-medium transition shadow-sm",
                        lowStockOnly
                            ? "bg-warning/10 border-warning/30 text-warning"
                            : "bg-card border-border text-muted-foreground hover:text-foreground"
                    )}
                >
                    <AlertTriangle className="w-4 h-4 inline mr-1.5" />
                    Low Stock
                </button>
                <button
                    onClick={() => {
                        if (page === 1) load();
                        else setPage(1);
                    }}
                    className="p-2.5 rounded-lg bg-card border border-border text-muted-foreground hover:text-foreground shadow-sm hover:bg-muted transition"
                >
                    <RefreshCw className="w-4 h-4" />
                </button>
            </div>

            {/* Table */}
            <div className="bg-card border border-border shadow-sm rounded-xl overflow-hidden">
                {/* Desktop Table Header */}
                <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-border bg-muted/50">
                                {["Item", "SKU", "Buy Price", "Sell Price", "Margin", "Qty", ""].map((h) => (
                                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                Array.from({ length: 5 }).map((_, i) => (
                                    <tr key={i} className="border-b border-border">
                                        {Array.from({ length: 7 }).map((_, j) => (
                                            <td key={j} className="px-4 py-3">
                                                <div className="h-3 bg-muted rounded animate-pulse" />
                                            </td>
                                        ))}
                                    </tr>
                                ))
                            ) : items.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-4 py-16 text-center text-muted-foreground">
                                        <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
                                        <p className="text-sm">No inventory items yet</p>
                                        <button
                                            onClick={() => setAddModal(true)}
                                            className="mt-4 px-4 py-2 rounded-lg gradient-primary text-white text-sm"
                                        >
                                            + Add First Item
                                        </button>
                                    </td>
                                </tr>
                            ) : items.map((item) => (
                                <tr
                                    key={item.id}
                                    className={clsx(
                                        "border-b border-border hover:bg-muted/40 transition",
                                        item.is_low_stock && "bg-warning/5"
                                    )}
                                >
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            {item.is_low_stock && (
                                                <AlertTriangle className="w-3.5 h-3.5 text-warning flex-shrink-0" />
                                            )}
                                            <span className="text-foreground font-medium">{item.name}</span>
                                        </div>
                                        {item.description && (
                                            <p className="text-muted-foreground opacity-80 text-xs mt-0.5 truncate max-w-xs">{item.description}</p>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{item.sku || "—"}</td>
                                    <td className="px-4 py-3 text-muted-foreground">₹{item.purchase_price}</td>
                                    <td className="px-4 py-3 text-foreground font-medium">₹{item.selling_price}</td>
                                    <td className="px-4 py-3">
                                        {margin(item) !== null && (
                                            <span className="flex items-center gap-1 text-success text-xs">
                                                <TrendingUp className="w-3.5 h-3.5" />{margin(item)}%
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={clsx(
                                            "font-bold",
                                            item.is_low_stock ? "text-warning" : "text-foreground"
                                        )}>
                                            {item.quantity}
                                        </span>
                                        <span className="text-muted-foreground opacity-60 text-xs ml-1">/ {item.low_stock_threshold}</span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2 justify-end">
                                            <button
                                                onClick={() => setStockItem(item)}
                                                className="px-2.5 py-1 rounded-lg bg-muted border border-border shadow-sm hover:bg-muted/80 text-foreground font-medium text-xs transition"
                                            >
                                                Stock
                                            </button>
                                            <button
                                                onClick={() => setEditItem(item)}
                                                className="px-2.5 py-1 rounded-lg bg-muted border border-border shadow-sm hover:bg-muted/80 text-foreground font-medium text-xs transition"
                                            >
                                                Edit
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Mobile Cards View */}
                <div className="md:hidden flex flex-col divide-y divide-border">
                    {loading ? (
                        Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className="p-4 flex gap-4 animate-pulse">
                                <div className="w-10 h-10 rounded-full bg-muted" />
                                <div className="flex-1 space-y-2">
                                    <div className="h-3 bg-muted rounded w-2/3" />
                                    <div className="h-3 bg-muted rounded w-1/4" />
                                </div>
                            </div>
                        ))
                    ) : items.length === 0 ? (
                        <div className="px-4 py-16 text-center text-muted-foreground">
                            <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
                            <p className="text-sm">No inventory items yet</p>
                            <button
                                onClick={() => setAddModal(true)}
                                className="mt-4 px-4 py-2 rounded-lg gradient-primary text-white text-sm hover:opacity-90 transition"
                            >
                                + Add First Item
                            </button>
                        </div>
                    ) : items.map((item) => (
                        <div
                            key={item.id}
                            className={clsx(
                                "p-4 flex flex-col gap-3 transition hover:bg-muted/30",
                                item.is_low_stock && "bg-warning/5"
                            )}
                        >
                            <div className="flex justify-between items-start">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        {item.is_low_stock && (
                                            <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0" />
                                        )}
                                        <span className="text-foreground font-bold text-sm tracking-tight leading-none">{item.name}</span>
                                    </div>
                                    <p className="text-muted-foreground font-mono text-xs">{item.sku || "No SKU"}</p>
                                </div>
                                <div className="flex flex-col items-end">
                                    <span className="text-foreground font-bold text-sm">₹{item.selling_price}</span>
                                    {margin(item) !== null && (
                                        <span className="text-success text-[10px] font-medium flex items-center gap-0.5 uppercase tracking-wider">
                                            <TrendingUp className="w-3 h-3" /> {margin(item)}% MRG
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div className="flex items-center justify-between mt-1">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Stock:</span>
                                    <span className={clsx(
                                        "px-2 py-0.5 rounded-md text-xs font-bold",
                                        item.is_low_stock ? "bg-warning/20 text-warning" : "bg-muted text-foreground"
                                    )}>
                                        {item.quantity} / {item.low_stock_threshold}
                                    </span>
                                </div>

                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setStockItem(item)}
                                        className="h-8 px-3 rounded-lg bg-muted border border-border shadow-sm hover:bg-muted/80 text-foreground font-medium text-xs transition"
                                    >
                                        Stock
                                    </button>
                                    <button
                                        onClick={() => setEditItem(item)}
                                        className="h-8 px-3 rounded-lg bg-card border border-border shadow-sm hover:bg-muted text-muted-foreground font-medium text-xs transition"
                                    >
                                        Edit
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Infinite Scroll Observer */}
            <InfiniteScrollObserver
                isFetchingNextPage={loadingMore}
                hasNextPage={page < pages}
                fetchNextPage={() => setPage(p => p + 1)}
            />

            {/* Modals */}
            {addModal && (
                <ItemModal onClose={() => setAddModal(false)} onSave={() => { setAddModal(false); load(); }} />
            )}
            {editItem && (
                <ItemModal item={editItem} onClose={() => setEditItem(null)} onSave={() => { setEditItem(null); load(); }} />
            )}
            {stockItem && (
                <StockModal item={stockItem} onClose={() => setStockItem(null)} onSave={() => { setStockItem(null); load(); }} />
            )}
        </div>
    );
}
