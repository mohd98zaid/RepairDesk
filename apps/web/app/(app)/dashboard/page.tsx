"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fmtTicketId } from "@/lib/utils/ticketId";
import {
    Ticket, Package, IndianRupee, Users, Clock,
    CheckCircle, AlertTriangle, TrendingUp, Wrench, Activity, User
} from "lucide-react";
import { ticketsApi } from "@/lib/api/tickets";
import { inventoryApi } from "@/lib/api/inventory";
import { reportsApi } from "@/lib/api/reports";
import { StatusBadge } from "@/components/tickets/StatusBadge";
import { useAuthStore } from "@/store/authStore";

interface KPI {
    open: number;
    ready: number;
    resolved_today: number;
    total_revenue: string;
    low_stock: number;
    sla_rate: number;
}

interface LowStockItem {
    id: string;
    name: string;
    quantity: number;
    low_stock_threshold: number;
}

function KPICard({
    icon: Icon,
    label,
    value,
    sub,
    color,
    href,
}: {
    icon: any;
    label: string;
    value: string | number;
    sub?: string;
    color: string;
    href?: string;
}) {
    const inner = (
        <div
            className="relative group h-full overflow-hidden rounded-2xl bg-card border border-border p-3.5 sm:p-5 flex flex-col items-start justify-between min-h-[105px] sm:min-h-[140px]"
            style={{ boxShadow: 'var(--glass-shadow)' }}
        >
            {/* Ambient background glow — subtle on hover */}
            <div className={`absolute -top-12 -right-12 w-36 h-36 rounded-full blur-[55px] opacity-10 group-hover:opacity-25 transition-opacity duration-300 pointer-events-none ${color}`} />

            <div className="flex w-full items-start justify-between z-10 sm:mb-2">
                <div
                    className={`p-2 sm:p-3 rounded-xl shadow-inner transition-all duration-200 group-hover:scale-105 ${color}`}
                >
                    <Icon className={`w-4 h-4 sm:w-5 sm:h-5 ${color.includes('bg-') && !color.includes('bg-muted') ? 'text-white' : 'text-foreground'}`} />
                </div>
            </div>

            <div className="z-10 w-full mt-auto">
                <p className="text-xs font-medium text-muted-foreground mt-2 sm:mt-3 mb-0.5 sm:mb-1 line-clamp-1">{label}</p>
                <div className="flex flex-col items-start">
                    <p className="text-2xl sm:text-3xl font-bold tracking-tight leading-none font-mono" style={{ fontFamily: "'JetBrains Mono', 'IBM Plex Mono', ui-monospace, monospace", fontVariantNumeric: 'tabular-nums' }}>{value}</p>
                    {sub && <p className="text-muted-foreground text-[10px] sm:text-xs truncate max-w-full mt-0.5 sm:mt-1">{sub}</p>}
                </div>
            </div>
        </div>
    );
    return href ? <Link href={href} className="block h-full">{inner}</Link> : <div className="block h-full">{inner}</div>;
}

export default function DashboardPage() {
    const { user } = useAuthStore();
    const [kpi, setKpi] = useState<KPI | null>(null);
    const [lowStockItems, setLowStockItems] = useState<LowStockItem[]>([]);
    const [recentTickets, setRecentTickets] = useState<
        Array<{ id: string; ticket_number: number; status: string; device_type: string; created_at: string; assigned_to_name?: string | null; sla_deadline?: string | null }>
    >([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        loadData();
    }, []);

    async function loadData() {
        setLoading(true);
        setError(false);
        try {
            const todayDate = new Date();
            const today = todayDate.toISOString().split('T')[0];

            // Use allSettled so a single failing endpoint doesn't crash the whole dashboard.
            const [
                ticketRes,
                allTicketsRes,
                dailyRes,
                invLowRes,
                revenueRes,
            ] = await Promise.allSettled([
                ticketsApi.list({ per_page: 5 }),
                ticketsApi.list({ per_page: 100 }),
                reportsApi.daily(today),
                inventoryApi.list({ low_stock_only: true, per_page: 8 }),
                reportsApi.revenueBreakdown(),
            ]);

            // If primary ticket calls failed, surface error
            if (ticketRes.status === "rejected" && allTicketsRes.status === "rejected") {
                console.error("Critical dashboard data failed:", ticketRes, allTicketsRes);
                setError(true);
                return;
            }

            const allItems = (allTicketsRes.status === "fulfilled" ? allTicketsRes.value?.items : (ticketRes.status === "fulfilled" ? ticketRes.value?.items : [])) ?? [];
            const open = allItems.filter((t: { status: string }) =>
                ["RECEIVED", "IN_PROGRESS", "WAITING_PARTS"].includes(t.status)
            ).length;
            const ready = allItems.filter((t: { status: string }) => t.status === "READY").length;
            const resolved_today = dailyRes.status === "fulfilled"
                ? (dailyRes.value?.tickets_completed ?? 0)
                : 0;

            // Low stock items from dedicated low_stock query
            const lowItems: LowStockItem[] = invLowRes.status === "fulfilled" ? (invLowRes.value?.items || []) : [];
            setLowStockItems(lowItems);
            const lowStockCount = invLowRes.status === "fulfilled"
                ? (invLowRes.value?.total ?? lowItems.length)
                : lowItems.length;

            const rawRev = revenueRes.status === "fulfilled"
                ? Number(revenueRes.value?.total_revenue || 0)
                : (dailyRes.status === "fulfilled" ? Number(dailyRes.value?.total_revenue || 0) : 0);
            const totalRevenue = rawRev >= 100000 ? `₹${(rawRev / 1000).toFixed(0)}k` : `₹${rawRev.toLocaleString("en-IN")}`;

            let slaCount = 0;
            let slaTotal = 0;
            allItems.forEach((t: any) => {
                if (t.sla_deadline) {
                    slaTotal++;
                    const isClosed = t.status === "DELIVERED" || t.status === "READY";
                    const deadlineDate = new Date(t.sla_deadline);
                    if (isClosed) {
                        const completedAt = new Date(t.updated_at);
                        if (completedAt <= deadlineDate) slaCount++;
                    } else {
                        if (deadlineDate >= new Date()) slaCount++;
                    }
                }
            });
            const sla_rate = slaTotal > 0 ? Math.round((slaCount / slaTotal) * 100) : 100;

            setKpi({
                open,
                ready,
                resolved_today,
                total_revenue: totalRevenue,
                low_stock: lowStockCount,
                sla_rate,
            });
            
            const recentList = (ticketRes.status === "fulfilled" ? ticketRes.value?.items : allItems) ?? [];
            setRecentTickets(recentList.slice(0, 5));
        } catch (err) {
            console.error("Dashboard load failed:", err);
            setError(true);
        } finally {
            setLoading(false);
        }
    }


    if (error) return (
        <div className="p-6 flex flex-col items-center justify-center min-h-64 gap-4">
            <p className="text-muted-foreground text-sm">Could not load dashboard data.</p>
            <div className="flex items-center gap-3">
                <button
                    onClick={loadData}
                    className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm hover:opacity-90 transition"
                >
                    Retry
                </button>
                <button
                    onClick={() => {
                        useAuthStore.getState().clearAuth();
                        window.location.href = "/login";
                    }}
                    className="px-4 py-2 rounded-lg bg-muted text-foreground border border-border text-sm hover:bg-muted/80 transition"
                >
                    Re-login
                </button>
            </div>
        </div>
    );

    return (
        <div className="w-full max-w-full m-0 p-4 sm:p-6 lg:p-8" style={{ boxSizing: 'border-box' }}>
            {/* Header */}
            <div className="mb-7 mt-4">
                <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
                <p className="text-muted-foreground text-sm">
                    {new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
                </p>
            </div>

            {/* KPI Cards */}
            {loading ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4 mb-6">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="bg-muted rounded-xl p-5 h-28 sm:h-24 animate-pulse" />
                    ))}
                </div>
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4 mb-6">
                    <KPICard icon={Clock} label="Open Tickets" value={kpi?.open ?? 0}
                        sub="Active repairs" color="bg-indigo-600" href="/tickets" />
                    <KPICard icon={CheckCircle} label="Ready for Pickup" value={kpi?.ready ?? 0}
                        sub="Customer to collect" color="bg-emerald-600" href="/tickets?status=READY" />
                    <KPICard icon={Wrench} label="Resolved Today" value={kpi?.resolved_today ?? 0}
                        sub="Delivered today" color="bg-teal-600" href="/tickets?status=DELIVERED" />
                    <KPICard icon={IndianRupee} label="Total Revenue" value={kpi?.total_revenue ?? "₹0"}
                        sub="All-time earnings" color="bg-blue-600" href="/reports" />
                    <KPICard icon={Activity} label="SLA Compliance" value={`${kpi?.sla_rate ?? 100}%`}
                        sub="Meeting deadlines" color={((kpi?.sla_rate ?? 100) < 90) ? "bg-amber-600" : "bg-emerald-600"} href="/tickets" />
                    <KPICard icon={AlertTriangle} label="Low Stock Items" value={kpi?.low_stock ?? 0}
                        sub="Needs restocking" color={kpi?.low_stock ? "bg-amber-600 !text-white" : "bg-muted"} href="/inventory" />
                </div>
            )}

            {/* Low Stock Alert Panel */}
            {!loading && lowStockItems.length > 0 && (
                <div className="bg-card border border-border shadow-sm rounded-xl overflow-hidden mb-8">
                    <div className="px-5 py-3 border-b border-border flex items-center justify-between bg-warning/10">
                        <div className="flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-warning" />
                            <h2 className="text-sm font-semibold text-warning">Low Stock Alert</h2>
                            <span className="ml-1 text-xs bg-warning/20 text-warning border border-warning/30 px-2 py-0.5 rounded-full font-medium">
                                {lowStockItems.length} item{lowStockItems.length > 1 ? 's' : ''}
                            </span>
                        </div>
                        <Link href="/inventory" className="text-warning hover:opacity-80 text-xs">Manage inventory →</Link>
                    </div>
                    <div className="divide-y divide-border">
                        {lowStockItems.map((item) => (
                            <div key={item.id} className="flex items-center justify-between px-5 py-3">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-warning/10 border border-warning/20 flex items-center justify-center flex-shrink-0">
                                        <Package className="w-4 h-4 text-warning" />
                                    </div>
                                    <p className="text-sm text-foreground font-medium">{item.name}</p>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="text-xs text-muted-foreground">threshold: {item.low_stock_threshold ?? 5}</span>
                                    <span className={`text-sm font-bold px-2 py-0.5 rounded-full ${item.quantity === 0
                                        ? 'bg-danger/10 text-danger border border-danger/20'
                                        : 'bg-warning/10 text-warning border border-warning/20'
                                        }`}>
                                        {item.quantity === 0 ? 'Out of stock' : `${item.quantity} left`}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {loading && <div className="h-6 mb-8" />}

            {/* Quick Actions */}
            <div className="grid sm:grid-cols-3 gap-3 mb-8">
                {[
                    { label: "New Ticket", href: "/tickets/new", icon: Ticket, desc: "Create a repair job" },
                    { label: "Customers", href: "/customers", icon: Users, desc: "View & search customers" },
                    { label: "Inventory", href: "/inventory", icon: Package, desc: "Manage parts & stock" },
                ].map(({ label, href, icon: Icon, desc }) => (
                    <Link
                        key={href}
                        href={href}
                        className="bg-card border border-border shadow-sm rounded-xl p-4 flex items-center gap-3 hover:border-primary/40 transition"
                    >
                        <div className="p-2.5 rounded-lg bg-muted">
                            <Icon className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                            <p className="text-foreground font-medium text-sm">{label}</p>
                            <p className="text-muted-foreground text-xs">{desc}</p>
                        </div>
                    </Link>
                ))}
            </div>

            {/* Recent tickets */}
            <div className="bg-card border border-border shadow-sm rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-foreground">Recent Tickets</h2>
                    <Link href="/tickets" className="text-primary hover:opacity-80 text-xs font-medium">
                        View all →
                    </Link>
                </div>
                {loading ? (
                    <div className="p-4 space-y-3">
                        {Array.from({ length: 3 }).map((_, i) => (
                            <div key={i} className="h-12 bg-muted rounded-lg animate-pulse" />
                        ))}
                    </div>
                ) : recentTickets.length === 0 ? (
                    <div className="py-12 text-center text-muted-foreground">
                        <Ticket className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        <p className="text-sm">No tickets yet</p>
                    </div>
                ) : (
                    recentTickets.map((t) => (
                        <Link
                            key={t.id}
                            href={`/tickets/${t.id}`}
                            className="flex items-center gap-4 px-5 py-3.5 border-b border-border last:border-0 hover:bg-muted/50 transition group"
                        >
                            <span className="text-muted-foreground text-xs font-mono w-20">{fmtTicketId(t.ticket_number)}</span>
                            <div className="flex-1 min-w-0">
                                <p className="text-foreground text-sm truncate flex items-center gap-2">
                                    {t.device_type}
                                    {t.assigned_to_name && (
                                        <span className="hidden sm:inline-flex items-center gap-1 bg-muted px-1.5 rounded text-[10px] text-muted-foreground border border-border">
                                            <User className="w-3 h-3" /> {t.assigned_to_name}
                                        </span>
                                    )}
                                </p>
                                <span className="text-[10px] sm:hidden text-muted-foreground flex gap-2">
                                    {t.assigned_to_name && <span>{t.assigned_to_name}</span>}
                                </span>
                            </div>
                            <div className="flex items-center gap-2 sm:gap-4">
                                {t.sla_deadline && (
                                    <span className={`hidden sm:inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold border ${new Date(t.sla_deadline) < new Date() ? 'bg-danger/10 text-danger border-danger/20' : t.status === 'DELIVERED' ? 'bg-success/10 text-success border-success/20' : 'bg-warning/10 text-warning border-warning/20'}`}>
                                        SLA: {new Date(t.sla_deadline).toLocaleDateString([], { month: 'short', day: 'numeric'})}
                                    </span>
                                )}
                                <StatusBadge status={t.status} />
                                <span className="text-muted-foreground text-xs hidden lg:block w-24 text-right">
                                    {new Date(t.created_at).toLocaleDateString()}
                                </span>
                            </div>
                        </Link>
                    ))
                )}
            </div>
        </div>
    );
}
