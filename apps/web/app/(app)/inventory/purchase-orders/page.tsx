"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Search, RefreshCw, X, Loader2, FileText, CheckCircle2, ChevronRight } from "lucide-react";
import { purchaseOrdersApi, vendorsApi, inventoryApi, CreatePOPayload, CreatePOItemPayload } from "@/lib/api/inventory";
import { PurchaseOrder, Vendor, InventoryItem } from "@/types";
import clsx from "clsx";

// ── Create PO Modal ────────────────────────────────────────────────────────────
function POModal({
    onClose,
    onSave,
}: {
    onClose: () => void;
    onSave: () => void;
}) {
    const [form, setForm] = useState<Partial<CreatePOPayload>>({
        vendor_id: "",
        po_number: `PO-${Math.floor(Date.now() / 1000).toString().slice(-6)}`,
        status: "DRAFT",
        notes: "",
        items: []
    });

    const [vendors, setVendors] = useState<Vendor[]>([]);
    const [inventory, setInventory] = useState<InventoryItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [fetchingDeps, setFetchingDeps] = useState(true);
    const [error, setError] = useState<null | string>(null);

    // Line item state
    const [selectedItem, setSelectedItem] = useState("");
    const [qty, setQty] = useState(1);
    const [cost, setCost] = useState("");

    useEffect(() => {
        Promise.all([
            vendorsApi.list(),
            inventoryApi.list({ per_page: 1000 }) // Fetch all parts for simplicity
        ]).then(([vRes, iRes]) => {
            setVendors(vRes);
            setInventory(iRes.items);
            if (vRes.length > 0) setForm(f => ({ ...f, vendor_id: vRes[0].id }));
            if (iRes.items.length > 0) {
                setSelectedItem(iRes.items[0].id);
                setCost(iRes.items[0].purchase_price);
            }
        }).catch(() => {
            setError("Failed to load vendors or inventory.");
        }).finally(() => {
            setFetchingDeps(false);
        });
    }, []);

    const handleAddLine = () => {
        if (!selectedItem || !qty || !cost) return;
        const target = inventory.find(i => i.id === selectedItem);
        if (!target) return;

        setForm(f => ({
            ...f,
            items: [...(f.items || []), { inventory_item_id: selectedItem, quantity: qty, unit_cost: cost }]
        }));
    };

    const handleRemoveLine = (idx: number) => {
        setForm(f => ({
            ...f,
            items: (f.items || []).filter((_, i) => i !== idx)
        }));
    };

    const handleSave = async () => {
        if (!form.vendor_id || !form.po_number || (form.items || []).length === 0) {
            setError("Please fill all required fields and add at least one item.");
            return;
        }

        setLoading(true);
        setError(null);
        try {
            await purchaseOrdersApi.create(form as CreatePOPayload);
            onSave();
        } catch (e: any) {
            setError(e?.response?.data?.detail || "Failed to create Purchase Order");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="bg-card border border-border shadow-md rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-5">
                    <h2 className="text-lg font-semibold text-foreground">Create Purchase Order</h2>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {fetchingDeps ? (
                    <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
                ) : (
                    <>
                        {error && (
                            <div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-800 text-red-300 text-sm">
                                {error}
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-4 mb-6">
                            <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-1">Vendor *</label>
                                <select
                                    className="w-full px-3 py-2 rounded-lg bg-background border border-border focus:border-primary text-sm shadow-sm"
                                    value={form.vendor_id}
                                    onChange={(e) => setForm({ ...form, vendor_id: e.target.value })}
                                >
                                    {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-1">PO Number *</label>
                                <input
                                    type="text"
                                    value={form.po_number}
                                    onChange={(e) => setForm({ ...form, po_number: e.target.value })}
                                    className="w-full px-3 py-2 rounded-lg bg-background border border-border focus:border-primary text-sm shadow-sm font-mono uppercase"
                                />
                            </div>
                            <div className="col-span-2">
                                <label className="block text-xs font-medium text-muted-foreground mb-1">Notes (Optional)</label>
                                <textarea
                                    value={form.notes || ""}
                                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                                    className="w-full px-3 py-2 rounded-lg bg-background border border-border focus:border-primary text-sm shadow-sm resize-none h-16"
                                    placeholder="Expected delivery, shipping method, etc."
                                />
                            </div>
                        </div>

                        {/* Line Items */}
                        <div className="mb-6 border border-border rounded-xl overflow-hidden">
                            <div className="bg-muted p-3 border-b border-border flex items-end gap-2">
                                <div className="flex-1">
                                    <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Part</label>
                                    <select
                                        className="w-full px-2 py-1.5 rounded-md bg-background border border-border text-sm"
                                        value={selectedItem}
                                        onChange={(e) => {
                                            setSelectedItem(e.target.value);
                                            const t = inventory.find(i => i.id === e.target.value);
                                            if (t) setCost(t.purchase_price);
                                        }}
                                    >
                                        {inventory.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                                    </select>
                                </div>
                                <div className="w-20">
                                    <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Qty</label>
                                    <input type="number" min="1" value={qty} onChange={e => setQty(Number(e.target.value))} className="w-full px-2 py-1.5 rounded-md bg-background border border-border text-sm" />
                                </div>
                                <div className="w-24">
                                    <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Unit Cst (₹)</label>
                                    <input type="number" step="0.01" value={cost} onChange={e => setCost(e.target.value)} className="w-full px-2 py-1.5 rounded-md bg-background border border-border text-sm" />
                                </div>
                                <button onClick={handleAddLine} className="px-3 py-1.5 bg-primary text-white rounded-md text-sm font-medium hover:bg-primary/90 transition shadow-sm h-[34px]">
                                    Add
                                </button>
                            </div>

                            <div className="p-3 bg-card min-h-[100px]">
                                {(form.items || []).length === 0 ? (
                                    <p className="text-center text-muted-foreground text-sm py-4">No items added to this order.</p>
                                ) : (form.items || []).map((line, idx) => {
                                    const part = inventory.find(i => i.id === line.inventory_item_id);
                                    return (
                                        <div key={idx} className="flex justify-between items-center py-2 border-b border-border/50 last:border-0">
                                            <div>
                                                <p className="font-medium text-sm text-foreground">{part?.name || "Unknown Part"}</p>
                                                <p className="text-xs text-muted-foreground">{line.quantity} units @ ₹{line.unit_cost}</p>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <span className="font-bold text-sm text-foreground">₹{(Number(line.unit_cost) * line.quantity).toFixed(2)}</span>
                                                <button onClick={() => handleRemoveLine(idx)} className="text-red-500 hover:text-red-400 p-1">
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="bg-muted p-3 flex justify-between items-center border-t border-border">
                                <span className="text-sm font-bold text-foreground">Total:</span>
                                <span className="text-lg font-black text-primary">
                                    ₹{(form.items || []).reduce((acc, curr) => acc + (Number(curr.unit_cost) * curr.quantity), 0).toFixed(2)}
                                </span>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 mt-4">
                            <button onClick={onClose} className="px-4 py-2 rounded-lg border border-border hover:bg-muted font-medium text-sm transition">Cancel</button>
                            <button onClick={handleSave} disabled={loading || (form.items || []).length === 0} className="flex items-center gap-2 px-6 py-2 rounded-lg gradient-primary text-white font-medium text-sm disabled:opacity-50 transition shadow-sm">
                                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                                Create PO
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

// ── Main Purchase Orders Page ──────────────────────────────────────────────────
export default function PurchaseOrdersPage() {
    const [pos, setPos] = useState<PurchaseOrder[]>([]);
    const [vendors, setVendors] = useState<Record<string, Vendor>>({});
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [showModal, setShowModal] = useState(false);
    const [updating, setUpdating] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [poData, vData] = await Promise.all([
                purchaseOrdersApi.list(),
                vendorsApi.list()
            ]);
            setPos(poData);

            const vMap: Record<string, Vendor> = {};
            vData.forEach(v => vMap[v.id] = v);
            setVendors(vMap);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const handleReceivePO = async (id: string) => {
        if (!confirm("Mark this PO as Received? This will securely restock your inventory.")) return;
        setUpdating(id);
        try {
            await purchaseOrdersApi.updateStatus(id, "RECEIVED");
            await load();
        } catch (e: any) {
            alert(e?.response?.data?.detail || "Failed to receive PO");
        } finally {
            setUpdating(null);
        }
    };

    const StatusBadge = ({ status }: { status: string }) => {
        switch (status) {
            case "DRAFT": return <span className="px-2 py-0.5 rounded-md bg-muted text-muted-foreground text-[10px] font-bold tracking-wider uppercase">Draft</span>;
            case "ORDERED": return <span className="px-2 py-0.5 rounded-md bg-blue-900/30 text-blue-400 border border-blue-800 text-[10px] font-bold tracking-wider uppercase">Ordered</span>;
            case "RECEIVED": return <span className="px-2 py-0.5 rounded-md bg-success/20 text-success border border-success/30 text-[10px] font-bold tracking-wider uppercase">Received</span>;
            case "CANCELLED": return <span className="px-2 py-0.5 rounded-md bg-destructive/20 text-destructive border border-destructive/30 text-[10px] font-bold tracking-wider uppercase">Cancelled</span>;
            default: return null;
        }
    };

    const filtered = pos.filter(po =>
        po.po_number.toLowerCase().includes(search.toLowerCase()) ||
        (vendors[po.vendor_id]?.name || "").toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="p-6 max-w-5xl mx-auto w-full">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-lg font-bold text-foreground">Purchase Orders</h2>
                    <p className="text-muted-foreground font-medium text-sm mt-1">{pos.length} total orders</p>
                </div>
                <button
                    onClick={() => setShowModal(true)}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg gradient-primary text-white font-medium text-sm hover:opacity-90 transition shadow-sm"
                >
                    <Plus className="w-4 h-4" /> Create PO
                </button>
            </div>

            <div className="flex gap-3 mb-5">
                <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search by PO Number or Vendor..."
                        className="w-full pl-9 pr-4 py-2.5 rounded-lg bg-card border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary text-sm shadow-sm"
                    />
                </div>
                <button onClick={load} className="p-2.5 rounded-lg bg-card border border-border text-muted-foreground hover:text-foreground shadow-sm hover:bg-muted transition">
                    <RefreshCw className="w-4 h-4" />
                </button>
            </div>

            {loading ? (
                <div className="flex justify-center p-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-12 bg-card border border-border rounded-xl shadow-sm">
                    <p className="text-muted-foreground text-sm">No Purchase Orders found.</p>
                </div>
            ) : (
                <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-muted/50 border-b border-border">
                            <tr>
                                <th className="px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Number</th>
                                <th className="px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Vendor</th>
                                <th className="px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Status</th>
                                <th className="px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Total</th>
                                <th className="px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Date</th>
                                <th className="px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50">
                            {filtered.map(po => (
                                <tr key={po.id} className="hover:bg-muted/30 transition">
                                    <td className="px-4 py-4 font-mono font-bold text-foreground">
                                        <div className="flex items-center gap-2">
                                            <FileText className="w-4 h-4 text-muted-foreground" />
                                            {po.po_number}
                                        </div>
                                    </td>
                                    <td className="px-4 py-4 font-medium text-foreground">
                                        {vendors[po.vendor_id]?.name || "Unknown"}
                                    </td>
                                    <td className="px-4 py-4">
                                        <StatusBadge status={po.status} />
                                    </td>
                                    <td className="px-4 py-4 font-bold text-foreground">
                                        ₹{po.total_amount}
                                    </td>
                                    <td className="px-4 py-4 text-muted-foreground">
                                        {new Date(po.created_at).toLocaleDateString()}
                                    </td>
                                    <td className="px-4 py-4 text-right">
                                        {po.status !== "RECEIVED" && po.status !== "CANCELLED" && (
                                            <button
                                                onClick={() => handleReceivePO(po.id)}
                                                disabled={updating === po.id}
                                                className="inline-flex items-center justify-center h-8 px-3 rounded-md bg-muted border border-border hover:bg-muted/80 text-xs font-semibold text-foreground transition disabled:opacity-50"
                                            >
                                                {updating === po.id ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <CheckCircle2 className="w-3 h-3 mr-1 text-success" />}
                                                Receive
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {showModal && (
                <POModal onClose={() => setShowModal(false)} onSave={() => { setShowModal(false); load(); }} />
            )}
        </div>
    );
}
