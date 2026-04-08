"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Plus, Search, SlidersHorizontal, RefreshCw, User, Smartphone, Laptop, Tablet, Watch, Printer, Box, Clock } from "lucide-react";
import { ticketsApi } from "@/lib/api/tickets";
import { StatusBadge } from "@/components/tickets/StatusBadge";
import { fmtTicketId } from "@/lib/utils/ticketId";
import { InfiniteScrollObserver } from "@/components/InfiniteScrollObserver";
import { useCurrency } from "@/store/shopStore";

const STATUSES = ["RECEIVED", "IN_PROGRESS", "WAITING_PARTS", "READY", "DELIVERED", "CANCELLED"];

const STATUS_LABELS: Record<string, string> = {
    RECEIVED: "Received",
    IN_PROGRESS: "In Progress",
    WAITING_PARTS: "Waiting Parts",
    READY: "Ready",
    DELIVERED: "Delivered",
    CANCELLED: "Cancelled",
};

interface TicketRow {
    id: string;
    ticket_number: number;
    status: string;
    device_type: string;
    device_model: string | null;
    reported_issue: string;
    estimated_cost: string | null;
    final_cost: string | null;
    created_at: string;
    sla_deadline?: string | null;
    assigned_to_name?: string | null;
    customer_name?: string | null;
    customer_phone?: string | null;
}

function TicketSkeleton() {
    return (
        <div className="bg-card border border-border shadow-sm rounded-xl p-4 sm:p-5 flex flex-col gap-4 animate-pulse h-[140px] sm:h-[200px]">
            <div className="flex justify-between items-start">
                <div className="flex gap-3 items-center">
                    <div className="w-10 h-10 bg-muted rounded-lg" />
                    <div className="w-24 h-5 bg-muted rounded" />
                </div>
                <div className="w-20 h-6 bg-muted rounded-full" />
            </div>
            <div className="flex-1 space-y-2 mt-2">
                <div className="h-3 bg-muted rounded w-3/4" />
                <div className="h-3 bg-muted rounded w-1/2" />
            </div>
        </div>
    );
}

function getDeviceIcon(type: string) {
    const t = type.toLowerCase();
    if (t.includes("phone")) return Smartphone;
    if (t.includes("laptop") || t.includes("desktop") || t.includes("mac") || t.includes("pc")) return Laptop;
    if (t.includes("tablet") || t.includes("pad")) return Tablet;
    if (t.includes("watch")) return Watch;
    if (t.includes("print")) return Printer;
    return Box;
}

export default function TicketsPage() {
    const [tickets, setTickets] = useState<TicketRow[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pages, setPages] = useState(1);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<string>("");
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const currency = useCurrency();

    const load = useCallback(async () => {
        if (page === 1) setLoading(true);
        else setLoadingMore(true);

        try {
            const res = await ticketsApi.list({
                search: search || undefined,
                status: statusFilter || undefined,
                page,
                per_page: 20,
            });
            setTickets(prev => page === 1 ? res.items : [...prev, ...res.items]);
            setTotal(res.total);
            setPages(res.pages);
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    }, [search, statusFilter, page]);

    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const q = urlParams.get("q");
        const status = urlParams.get("status");
        if (q) {
            setSearch(q);
        }
        if (status) {
            setStatusFilter(status);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    return (
        <div className="p-4 sm:p-6 max-w-6xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Tickets</h1>
                    <p className="text-muted-foreground text-sm mt-1">{total} total</p>
                </div>
                <Link
                    href="/tickets/new"
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg gradient-primary text-white font-medium text-sm hover:opacity-90 transition"
                >
                    <Plus className="w-4 h-4" /> New Ticket
                </Link>
            </div>

            {/* Filters */}
            <div className="flex gap-3 mb-5 flex-wrap">
                {/* Search */}
                <div className="flex-1 min-w-64 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                        placeholder="Search customer name..."
                        className="w-full pl-9 pr-4 py-2.5 rounded-lg bg-card border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary text-sm shadow-sm"
                    />
                </div>

                {/* Status filter */}
                <select
                    value={statusFilter}
                    onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                    className="px-4 py-2.5 rounded-lg bg-card border border-border text-foreground text-sm focus:outline-none focus:border-primary shadow-sm"
                >
                    <option value="">All Statuses</option>
                    {STATUSES.map((s) => (
                        <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                    ))}
                </select>

                <button
                    onClick={() => {
                        if (page === 1) load();
                        else setPage(1);
                    }}
                    className="p-2.5 rounded-lg bg-card border border-border text-muted-foreground hover:text-foreground transition shadow-sm hover:bg-muted"
                >
                    <RefreshCw className="w-4 h-4" />
                </button>
            </div>

            {/* Ticket list */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                {loading ? (
                    Array.from({ length: 5 }).map((_, i) => <TicketSkeleton key={i} />)
                ) : tickets.length === 0 ? (
                    <div className="col-span-1 sm:col-span-2 lg:col-span-3 bg-card border border-border shadow-sm rounded-xl py-16 flex flex-col items-center justify-center text-center text-muted-foreground w-full">
                        <SlidersHorizontal className="w-10 h-10 mb-3 opacity-30 mx-auto" />
                        <p className="text-sm">No tickets found</p>
                        <Link
                            href="/tickets/new"
                            className="mt-4 px-4 py-2 rounded-lg gradient-primary text-white text-sm font-medium hover:opacity-90 transition inline-block"
                        >
                            + New Ticket
                        </Link>
                    </div>
                ) : (
                    tickets.map((ticket) => {
                        const DeviceIcon = getDeviceIcon(ticket.device_type);
                        const isOverdue = ticket.sla_deadline && new Date(ticket.sla_deadline) < new Date() && ticket.status !== 'DELIVERED';
                        
                        return (
                        <Link
                            key={ticket.id}
                            href={`/tickets/${ticket.id}`}
                            className={`bg-card shadow-sm rounded-xl p-3 sm:p-5 flex flex-col hover:-translate-y-0.5 transition-all duration-300 group gap-2 sm:gap-3 relative overflow-hidden text-left h-[140px] sm:h-[180px]
                                ${isOverdue ? 'border-2 border-danger/40 hover:shadow-[0_8px_30px_rgba(239,68,68,0.15)] glow-danger' 
                                            : 'border border-border/80 hover:border-primary/50 hover:shadow-[0_8px_30px_rgba(99,102,241,0.12)]'}`}
                        >
                            {/* Decorative background glow for desktop */}
                            <div className={`hidden sm:block absolute -top-12 -right-12 w-32 h-32 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none ${isOverdue ? 'bg-danger/10' : 'bg-primary/10'}`} />

                            {/* Top row: Icon + ID + Status */}
                            <div className="flex items-start justify-between w-full">
                                <div className="flex items-center gap-2 sm:gap-3">
                                    <div className="p-1.5 sm:p-2 rounded-lg bg-muted text-foreground border border-border shrink-0 group-hover:scale-105 transition-transform duration-300">
                                        <DeviceIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                                    </div>
                                    <div className="flex flex-col items-start lg:gap-0.5">
                                        <div className="flex items-center gap-2">
                                            <span className={`text-[10px] sm:text-[11px] font-bold font-mono px-1.5 py-0.5 sm:px-2 rounded-md leading-none ${isOverdue ? 'bg-danger/10 text-danger' : 'bg-primary/10 text-primary'}`}>
                                                {fmtTicketId(ticket.ticket_number)}
                                            </span>
                                        </div>
                                        <h3 className="text-foreground font-bold text-xs sm:text-sm hidden sm:block truncate max-w-[150px]">
                                            {ticket.device_type} {ticket.device_model && <span className="font-normal text-muted-foreground">· {ticket.device_model}</span>}
                                        </h3>
                                    </div>
                                </div>
                                <div className="shrink-0 flex items-center transform scale-90 sm:scale-100 origin-top-right">
                                    <StatusBadge status={ticket.status} />
                                </div>
                            </div>
                            
                            {/* Mobile titles (if hidden above) */}
                            <div className="sm:hidden text-foreground font-semibold text-[11px] truncate w-full">
                                {ticket.device_type} {ticket.device_model && <span className="font-normal text-muted-foreground opacity-80">· {ticket.device_model}</span>}
                            </div>

                            {/* Middle row: Issue Details & Customer */}
                            <div className="flex-1 w-full flex flex-col pt-1">
                                <p className="text-muted-foreground text-[10px] sm:text-xs line-clamp-1 sm:line-clamp-2 leading-relaxed">
                                    {ticket.reported_issue || "No issue description provided."}
                                </p>
                                
                                {(ticket.customer_name || ticket.customer_phone) && (
                                    <div className="mt-1 flex items-center gap-1.5 text-[9px] sm:text-[11px] text-muted-foreground/90 truncate bg-muted/30 px-1.5 py-0.5 rounded w-fit max-w-full">
                                        <User className="w-3 h-3 flex-shrink-0 opacity-50" />
                                        <span className="truncate">{ticket.customer_name || "Unknown"}</span>
                                        {ticket.customer_phone && (
                                            <>
                                                <span className="opacity-50">·</span>
                                                <span className="font-mono truncate">{ticket.customer_phone}</span>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                            
                            {/* Bottom row: Technician, Cost, SLA */}
                            <div className="flex flex-wrap items-end justify-between gap-y-2 gap-x-4 w-full pt-2 border-t border-border/50">
                                <div className="flex flex-col gap-1 sm:gap-1.5">
                                    {ticket.assigned_to_name ? (
                                        <div className="flex items-center gap-1 sm:gap-1.5 text-muted-foreground text-[9px] sm:text-[11px] font-medium max-w-[100px] sm:max-w-fit truncate">
                                            <span className="opacity-60">Tech:</span>
                                            <span className="truncate leading-none text-foreground/80">{ticket.assigned_to_name}</span>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-1 sm:gap-1.5 text-muted-foreground/60 text-[9px] sm:text-[11px] font-medium">
                                            <span className="truncate leading-none italic">Unassigned</span>
                                        </div>
                                    )}

                                    {ticket.sla_deadline && (
                                        <div className={`flex items-center gap-1 sm:gap-1.5 text-[9px] sm:text-[11px] font-semibold leading-none
                                            ${isOverdue ? "text-danger" : 
                                            ticket.status === 'DELIVERED' ? "text-success" : 
                                            "text-warning"}`}>
                                            <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                                            <span className="hidden sm:inline">Due:</span> {new Date(ticket.sla_deadline).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}, {new Date(ticket.sla_deadline).toLocaleDateString([], { month: 'short', day: 'numeric'})}
                                        </div>
                                    )}
                                </div>

                                <div className="flex items-center ml-auto shrink-0 pb-0.5">
                                    {(ticket.final_cost || ticket.estimated_cost) ? (
                                        <div className="flex flex-col items-end">
                                            <span className="text-[8px] sm:text-[9px] text-muted-foreground font-semibold uppercase tracking-wider mb-0.5">
                                                {ticket.final_cost ? "Final Price" : "Estimated"}
                                            </span>
                                            <span className={`text-sm sm:text-base font-black tracking-tight leading-none ${ticket.final_cost ? "text-success" : "text-foreground group-hover:text-primary transition-colors"}`}>
                                                {currency}{ticket.final_cost || ticket.estimated_cost}
                                            </span>
                                        </div>
                                    ) : (
                                        <span className="text-[10px] sm:text-xs text-muted-foreground italic mb-0.5">No cost set</span>
                                    )}
                                </div>
                            </div>
                        </Link>
                    )})
                )}
            </div>

            {/* Infinite Scroll Observer */}
            <InfiniteScrollObserver
                isFetchingNextPage={loadingMore}
                hasNextPage={page < pages}
                fetchNextPage={() => setPage(p => p + 1)}
            />
        </div>
    );
}
