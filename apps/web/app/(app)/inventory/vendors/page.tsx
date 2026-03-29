"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Search, RefreshCw, X, Loader2 } from "lucide-react";
import { vendorsApi, CreateVendorPayload } from "@/lib/api/inventory";
import { Vendor } from "@/types";

// ── Add / Edit Modal ───────────────────────────────────────────────────────────
function VendorModal({
    vendor,
    onClose,
    onSave,
}: {
    vendor?: Vendor;
    onClose: () => void;
    onSave: () => void;
}) {
    const [form, setForm] = useState<Partial<CreateVendorPayload>>({
        name: vendor?.name ?? "",
        contact_name: vendor?.contact_name ?? "",
        email: vendor?.email ?? "",
        phone: vendor?.phone ?? "",
        website: vendor?.website ?? "",
        notes: vendor?.notes ?? "",
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<null | string>(null);

    const handleSave = async () => {
        setLoading(true);
        setError(null);
        try {
            if (vendor) {
                await vendorsApi.update(vendor.id, form);
            } else {
                await vendorsApi.create(form as CreateVendorPayload);
            }
            onSave();
        } catch (e: any) {
            setError(e?.response?.data?.detail || "Failed to save vendor");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="bg-card border border-border shadow-md rounded-2xl p-6 w-full max-w-lg">
                <div className="flex items-center justify-between mb-5">
                    <h2 className="text-lg font-semibold text-foreground">
                        {vendor ? "Edit Vendor" : "Add Vendor"}
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

                <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Company Name *</label>
                        <input
                            required
                            type="text"
                            value={form.name}
                            onChange={(e) => setForm({ ...form, name: e.target.value })}
                            className="w-full px-3 py-2 rounded-lg bg-background border border-border focus:border-primary text-sm shadow-sm"
                            placeholder="e.g. iFixit Wholesale"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Contact Name</label>
                        <input
                            type="text"
                            value={form.contact_name || ""}
                            onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
                            className="w-full px-3 py-2 rounded-lg bg-background border border-border focus:border-primary text-sm shadow-sm"
                            placeholder="e.g. John Doe"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Phone</label>
                        <input
                            type="text"
                            value={form.phone || ""}
                            onChange={(e) => setForm({ ...form, phone: e.target.value })}
                            className="w-full px-3 py-2 rounded-lg bg-background border border-border focus:border-primary text-sm shadow-sm"
                            placeholder="+1 (555) 000-0000"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Email</label>
                        <input
                            type="email"
                            value={form.email || ""}
                            onChange={(e) => setForm({ ...form, email: e.target.value })}
                            className="w-full px-3 py-2 rounded-lg bg-background border border-border focus:border-primary text-sm shadow-sm"
                            placeholder="sales@vendor.com"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Website</label>
                        <input
                            type="url"
                            value={form.website || ""}
                            onChange={(e) => setForm({ ...form, website: e.target.value })}
                            className="w-full px-3 py-2 rounded-lg bg-background border border-border focus:border-primary text-sm shadow-sm"
                            placeholder="https://vendor.com"
                        />
                    </div>
                    <div className="col-span-2">
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Notes</label>
                        <textarea
                            value={form.notes || ""}
                            onChange={(e) => setForm({ ...form, notes: e.target.value })}
                            className="w-full px-3 py-2 rounded-lg bg-background border border-border focus:border-primary text-sm shadow-sm h-20 resize-none"
                            placeholder="Terms: Net 30, free shipping over $500..."
                        />
                    </div>
                </div>

                <div className="flex justify-end gap-3 mt-6">
                    <button onClick={onClose} className="px-4 py-2 rounded-lg border border-border hover:bg-muted font-medium text-sm transition">
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={loading || !form.name}
                        className="flex items-center gap-2 px-5 py-2 rounded-lg gradient-primary text-white font-medium text-sm disabled:opacity-50 transition shadow-sm"
                    >
                        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                        Save Vendor
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Main Vendors Page ────────────────────────────────────────────────────────
export default function VendorsPage() {
    const [vendors, setVendors] = useState<Vendor[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [modalVendor, setModalVendor] = useState<Vendor | null | "new">(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const data = await vendorsApi.list();
            setVendors(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const filtered = vendors.filter(v =>
        v.name.toLowerCase().includes(search.toLowerCase()) ||
        (v.contact_name && v.contact_name.toLowerCase().includes(search.toLowerCase()))
    );

    return (
        <div className="p-6 max-w-5xl mx-auto w-full">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-lg font-bold text-foreground">Supplier Network</h2>
                    <p className="text-muted-foreground font-medium text-sm mt-1">{vendors.length} registered vendors</p>
                </div>
                <button
                    onClick={() => setModalVendor("new")}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg gradient-primary text-white font-medium text-sm hover:opacity-90 transition shadow-sm"
                >
                    <Plus className="w-4 h-4" /> Add Vendor
                </button>
            </div>

            {/* Filters */}
            <div className="flex gap-3 mb-5">
                <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search vendors by name or contact..."
                        className="w-full pl-9 pr-4 py-2.5 rounded-lg bg-card border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary text-sm shadow-sm"
                    />
                </div>
                <button onClick={load} className="p-2.5 rounded-lg bg-card border border-border text-muted-foreground hover:text-foreground shadow-sm hover:bg-muted transition">
                    <RefreshCw className="w-4 h-4" />
                </button>
            </div>

            {/* List */}
            {loading ? (
                <div className="flex justify-center p-12">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-12 bg-card border border-border rounded-xl shadow-sm">
                    <p className="text-muted-foreground text-sm">No vendors found.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filtered.map(vendor => (
                        <div key={vendor.id} className="bg-card border border-border rounded-xl p-5 shadow-sm hover:border-border/80 transition flex flex-col justify-between">
                            <div>
                                <h3 className="font-bold text-foreground text-base tracking-tight mb-1">{vendor.name}</h3>
                                {vendor.contact_name && <p className="text-sm font-medium text-muted-foreground mb-3">{vendor.contact_name}</p>}

                                <div className="space-y-1 text-sm text-foreground">
                                    {vendor.email && <p>✉️ <a href={`mailto:${vendor.email}`} className="hover:underline">{vendor.email}</a></p>}
                                    {vendor.phone && <p>📞 <a href={`tel:${vendor.phone}`} className="hover:underline">{vendor.phone}</a></p>}
                                    {vendor.website && <p>🔗 <a href={vendor.website} target="_blank" rel="noreferrer" className="text-primary hover:underline">{new URL(vendor.website).hostname}</a></p>}
                                </div>
                            </div>

                            <button
                                onClick={() => setModalVendor(vendor)}
                                className="mt-4 w-full py-2 bg-muted text-foreground text-sm font-medium rounded-lg border border-border hover:bg-muted/80 transition"
                            >
                                Edit Details
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {modalVendor && (
                <VendorModal
                    vendor={modalVendor === "new" ? undefined : modalVendor}
                    onClose={() => setModalVendor(null)}
                    onSave={() => { setModalVendor(null); load(); }}
                />
            )}
        </div>
    );
}
