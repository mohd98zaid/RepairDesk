"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Plus, Search, SlidersHorizontal, RefreshCw, User } from "lucide-react";
import { ticketsApi } from "@/lib/api/tickets";
import { StatusBadge } from "@/components/tickets/StatusBadge";
import { fmtTicketId } from "@/lib/utils/ticketId";
import { InfiniteScrollObserver } from "@/components/InfiniteScrollObserver";

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
}

function TicketSkeleton() {
    return (
        <div className="bg-card border border-border shadow-sm rounded-xl p-4 flex gap-4 animate-pulse">
            <div className="w-8 h-4 bg-muted rounded" />
            <div className="flex-1 space-y-2">
                <div className="h-3 bg-muted rounded w-1/3" />
                <div className="h-3 bg-muted rounded w-1/2" />
            </div>
            <div className="w-20 h-5 bg-muted rounded-full" />
        </div>
    );
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
                    tickets.map((ticket) => (
                        <Link
                            key={ticket.id}
                            href={`/tickets/${ticket.id}`}
                            className="bg-card border border-border/80 shadow-[0_1px_2px_rgba(0,0,0,0.05)] rounded-lg p-2.5 flex flex-col hover:border-primary/40 hover:bg-muted/10 transition-colors group gap-1.5"
                        >
                            <div className="flex items-center justify-between w-full">
                                <div className="flex items-center gap-2 min-w-0">
                                    <span className="text-primary text-[10px] font-bold font-mono px-1.5 py-0.5 bg-primary/10 rounded shrink-0 leading-none">
                                        {fmtTicketId(ticket.ticket_number)}
                                    </span>
                                    <span className="text-foreground font-semibold text-[11px] sm:text-xs truncate">
                                        {ticket.device_type} {ticket.device_model && <span className="font-normal text-muted-foreground opacity-80">· {ticket.device_model}</span>}
                                    </span>
                                </div>
                                <div className="shrink-0 transform scale-[0.75] origin-right ml-2 -my-2 flex items-center">
                                    <StatusBadge status={ticket.status} />
                                </div>
                            </div>
                            
                            <div className="flex flex-wrap items-center justify-between gap-x-2 w-full mt-0.5">
                                <div className="text-muted-foreground opacity-90 text-[10px] truncate max-w-[50%] xs:max-w-[65%] leading-tight pr-2 border-r border-border/40">
                                    {ticket.reported_issue || "No details"}
                                </div>
                                
                                <div className="flex items-center gap-1.5 ml-auto shrink-0">
                                    {ticket.assigned_to_name && (
                                        <div className="flex items-center gap-1 text-muted-foreground bg-muted/60 px-1 py-0.5 rounded border border-border/50 text-[9px] font-medium max-w-[65px] truncate">
                                            <User className="w-2.5 h-2.5 opacity-70 flex-shrink-0" />
                                            <span className="truncate leading-none">{ticket.assigned_to_name}</span>
                                        </div>
                                    )}
                                    {(ticket.final_cost || ticket.estimated_cost) && (
                                        <span className={`text-[10px] font-bold tracking-tight px-1 ${ticket.final_cost ? "text-success" : "text-foreground"}`}>
                                            {ticket.final_cost ? `₹${ticket.final_cost}` : `~₹${ticket.estimated_cost}`}
                                        </span>
                                    )}
                                    {ticket.sla_deadline && (
                                        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded leading-none ${new Date(ticket.sla_deadline) < new Date() ? "text-danger bg-danger/10" : ticket.status === 'DELIVERED' ? "text-success bg-success/10" : "text-warning bg-warning/10"}`}>
                                           {new Date(ticket.sla_deadline).toLocaleDateString(undefined, { month: 'short', day: 'numeric'})}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </Link>
                    ))
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
