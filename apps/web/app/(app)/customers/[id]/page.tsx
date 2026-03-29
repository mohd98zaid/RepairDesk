"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { fmtTicketId } from "@/lib/utils/ticketId";
import {
    ArrowLeft, Phone, Mail, User, Ticket,
    CheckCircle, Clock, Package, AlertTriangle, Edit2, X, Loader2
} from "lucide-react";
import { customersApi } from "@/lib/api/tickets";
import { StatusBadge } from "@/components/tickets/StatusBadge";

interface TicketSummary {
    id: string;
    ticket_number: number;
    status: string;
    device_type: string;
    final_cost: string | null;
    created_at: string;
}

interface CustomerDetail {
    id: string;
    name: string;
    phone: string;
    email?: string;
    notes?: string;
    created_at: string;
    tickets: TicketSummary[];
}

export default function CustomerDetailPage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();
    const [customer, setCustomer] = useState<CustomerDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [activeTab, setActiveTab] = useState<"ALL" | "OPEN" | "IN_PROGRESS" | "READY" | "DELIVERED">("ALL");

    // Edit modal state
    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState({ name: "", phone: "", email: "", notes: "" });
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!id) return;
        loadCustomer();
    }, [id]);

    async function loadCustomer() {
        setLoading(true);
        setError(false);
        try {
            const data = await customersApi.get(id as string);
            setCustomer(data);
            setEditForm({
                name: data.name || "",
                phone: data.phone || "",
                email: data.email || "",
                notes: data.notes || ""
            });
        } catch {
            setError(true);
        } finally {
            setLoading(false);
        }
    }

    async function handleSaveEdit(e: React.FormEvent) {
        e.preventDefault();
        setSaving(true);
        try {
            const updated = await customersApi.update(id as string, editForm);
            setCustomer((prev) => prev ? { ...prev, ...updated } : updated);
            setIsEditing(false);
        } catch {
            alert("Failed to update customer.");
        } finally {
            setSaving(false);
        }
    }

    if (loading) return (
        <div className="p-6 max-w-3xl mx-auto space-y-4">
            <div className="h-8 w-40 bg-muted rounded-lg animate-pulse" />
            <div className="glass rounded-xl p-6 space-y-3 animate-pulse">
                <div className="h-5 w-1/3 bg-muted rounded" />
                <div className="h-4 w-1/4 bg-muted rounded" />
            </div>
            <div className="glass rounded-xl p-6 space-y-3 animate-pulse">
                {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-12 bg-muted rounded-lg" />
                ))}
            </div>
        </div>
    );

    if (error || !customer) return (
        <div className="p-6 max-w-3xl mx-auto">
            <button onClick={() => router.back()} className="flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm mb-6">
                <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <div className="glass rounded-xl py-16 flex flex-col items-center text-muted-foreground">
                <User className="w-10 h-10 mb-3 opacity-30" />
                <p className="text-sm">Customer not found.</p>
            </div>
        </div>
    );

    const totalSpent = customer.tickets
        .filter(t => t.final_cost)
        .reduce((sum, t) => sum + parseFloat(t.final_cost!), 0);

    const openCount = customer.tickets.filter(t =>
        ["RECEIVED", "IN_PROGRESS", "WAITING_PARTS", "READY"].includes(t.status)
    ).length;

    const filteredTickets = customer.tickets.filter(t => {
        if (activeTab === "ALL") return true;
        if (activeTab === "OPEN") return t.status === "RECEIVED";
        return t.status === activeTab;
    });

    return (
        <div className="p-6 max-w-3xl mx-auto">
            {/* Back */}
            <button onClick={() => router.back()} className="flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm mb-6 transition">
                <ArrowLeft className="w-4 h-4" /> Customers
            </button>

            {/* Profile Card */}
            <div className="glass rounded-xl p-6 mb-5">
                <div className="flex items-start gap-4">
                    {/* Avatar */}
                    <div className="w-14 h-14 rounded-full bg-indigo-900/50 border border-indigo-800 flex items-center justify-center flex-shrink-0">
                        <span className="text-indigo-300 font-bold text-xl">
                            {customer.name.charAt(0).toUpperCase()}
                        </span>
                    </div>
                    <div className="flex-1 min-w-0 flex items-start justify-between">
                        <div>
                            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
                                {customer.name}
                            </h1>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5">
                                <span className="flex items-center gap-1.5 text-muted-foreground text-sm">
                                    <Phone className="w-3.5 h-3.5" /> {customer.phone}
                                </span>
                                {customer.email && (
                                    <span className="flex items-center gap-1.5 text-muted-foreground text-sm">
                                        <Mail className="w-3.5 h-3.5" /> {customer.email}
                                    </span>
                                )}
                            </div>
                            {customer.notes && (
                                <p className="text-muted-foreground text-xs mt-2">{customer.notes}</p>
                            )}
                            <p className="text-muted-foreground text-xs mt-1.5">
                                Customer since {new Date(customer.created_at).toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" })}
                            </p>
                        </div>
                        <button
                            onClick={() => setIsEditing(true)}
                            className="text-xs flex items-center gap-1 text-foreground font-medium bg-muted border border-border shadow-sm hover:bg-muted/80 px-2 py-1 rounded transition"
                        >
                            <Edit2 className="w-3 h-3" /> Edit
                        </button>
                    </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-3 mt-5 pt-5 border-t border-border">
                    <div className="text-center">
                        <p className="text-muted-foreground text-xs mb-1">Total Tickets</p>
                        <p className="text-foreground font-bold text-lg">{customer.tickets.length}</p>
                    </div>
                    <div className="text-center">
                        <p className="text-muted-foreground text-xs mb-1">Open</p>
                        <p className="text-indigo-400 font-bold text-lg">{openCount}</p>
                    </div>
                    <div className="text-center">
                        <p className="text-muted-foreground text-xs mb-1">Total Revenue</p>
                        <p className="text-emerald-400 font-bold text-lg">
                            ₹{totalSpent.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                    </div>
                </div>
            </div>

            {/* Ticket History */}
            <div className="glass rounded-xl overflow-hidden">
                <div className="px-5 py-4 flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                        <Ticket className="w-5 h-5 text-indigo-400" />
                        Repair History
                    </h2>
                    <Link
                        href={`/tickets/new`}
                        className="text-xs px-3 py-1.5 rounded-lg gradient-primary text-white font-medium"
                    >
                        + New Ticket
                    </Link>
                </div>

                {/* Tabs */}
                {customer.tickets.length > 0 && (
                    <div className="px-5 border-b border-border/80 flex items-center gap-6 overflow-x-auto no-scrollbar">
                        {[
                            { id: "ALL", label: "All" },
                            { id: "OPEN", label: "Open" }, // Maps to RECEIVED
                            { id: "IN_PROGRESS", label: "In Progress" },
                            { id: "READY", label: "Ready" },
                            { id: "DELIVERED", label: "Delivered" },
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as any)}
                                className={`py-3 text-sm font-medium border-b-2 transition whitespace-nowrap ${activeTab === tab.id
                                    ? "border-indigo-500 text-indigo-400"
                                    : "border-transparent text-muted-foreground hover:text-foreground/90 hover:border-border"
                                    }`}
                            >
                                {tab.label}
                                <span className={`ml-2 text-xs py-0.5 px-1.5 rounded-full ${activeTab === tab.id ? "bg-indigo-500/20 text-indigo-300" : "bg-muted text-muted-foreground"
                                    }`}>
                                    {tab.id === "ALL"
                                        ? customer.tickets.length
                                        : customer.tickets.filter(t => (tab.id === "OPEN" ? t.status === "RECEIVED" : t.status === tab.id)).length}
                                </span>
                            </button>
                        ))}
                    </div>
                )}

                {filteredTickets.length === 0 ? (
                    <div className="py-12 text-center text-muted-foreground bg-card/20">
                        <Package className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        <p className="text-sm">
                            {customer.tickets.length === 0 ? "No tickets yet." : "No tickets match this status."}
                        </p>
                    </div>
                ) : (
                    filteredTickets.map((t) => (
                        <Link
                            key={t.id}
                            href={`/tickets/${t.id}`}
                            className="flex items-center gap-4 px-5 py-3.5 border-b border-border last:border-0 hover:bg-muted/30 transition"
                        >
                            <span className="text-muted-foreground text-xs font-mono w-24 flex-shrink-0">{fmtTicketId(t.ticket_number)}</span>
                            <p className="flex-1 text-foreground text-sm truncate">{t.device_type}</p>
                            <StatusBadge status={t.status} />
                            {t.final_cost && (
                                <span className="text-emerald-400 text-sm font-medium hidden sm:block">
                                    ₹{parseFloat(t.final_cost).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                                </span>
                            )}
                            <span className="text-muted-foreground text-xs hidden sm:block">
                                {new Date(t.created_at).toLocaleDateString()}
                            </span>
                        </Link>
                    ))
                )}
            </div>

            {/* Edit Modal */}
            {isEditing && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
                    <div className="bg-card border border-border w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-fade-in">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                            <h2 className="text-lg font-semibold text-foreground">Edit Customer</h2>
                            <button onClick={() => setIsEditing(false)} className="text-muted-foreground hover:text-foreground">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <form onSubmit={handleSaveEdit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-1">Name</label>
                                <input
                                    required
                                    type="text"
                                    value={editForm.name}
                                    onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                                    className="w-full px-4 py-2 rounded-lg bg-muted border border-border text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-1">Phone</label>
                                <input
                                    required
                                    type="tel"
                                    value={editForm.phone}
                                    onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))}
                                    className="w-full px-4 py-2 rounded-lg bg-muted border border-border text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-1">Email <span className="text-muted-foreground font-normal">(optional)</span></label>
                                <input
                                    type="email"
                                    value={editForm.email}
                                    onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                                    className="w-full px-4 py-2 rounded-lg bg-muted border border-border text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-1">Notes <span className="text-muted-foreground font-normal">(optional)</span></label>
                                <textarea
                                    value={editForm.notes}
                                    onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                                    rows={3}
                                    className="w-full px-4 py-2 rounded-lg bg-muted border border-border text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none resize-none"
                                />
                            </div>
                            <div className="flex gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setIsEditing(false)}
                                    className="flex-1 py-2.5 rounded-lg border border-border text-foreground font-medium hover:bg-muted transition"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="flex-1 py-2.5 rounded-lg gradient-primary text-white font-medium hover:opacity-90 disabled:opacity-50 transition flex items-center justify-center gap-2"
                                >
                                    {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : "Save Changes"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
