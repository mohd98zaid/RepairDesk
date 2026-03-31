"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Plus, Search, SlidersHorizontal, RefreshCw } from "lucide-react";
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
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-4">
                {loading ? (
                    Array.from({ length: 5 }).map((_, i) => <TicketSkeleton key={i} />)
                ) : tickets.length === 0 ? (
                    <div className="md:col-span-2 lg:col-span-1 bg-card border border-border shadow-sm rounded-xl py-16 flex flex-col items-center justify-center text-center text-muted-foreground w-full">
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
                            className="bg-card border border-border shadow-sm rounded-xl p-3 sm:p-4 flex flex-col hover:border-primary/40 hover:shadow-md transition relative group"
                        >
                            <div className="flex flex-col xl:flex-row xl:justify-between items-start gap-1.5 w-full">
                                {/* Ticket # */}
                                <span className="text-primary text-xs sm:text-sm font-bold font-mono px-1.5 py-0.5 sm:px-2 sm:py-1 bg-primary/10 rounded-md shrink-0">
                                    {fmtTicketId(ticket.ticket_number)}
                                </span>
                                {/* Mobile Status Badge (now shows inline in the grid) */}
                                <div className="transform scale-90 origin-left xl:origin-right shrink-0">
                                    <StatusBadge status={ticket.status} />
                                </div>
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0 mt-2">
                                <p className="text-foreground font-semibold text-xs sm:text-sm truncate">
                                    {ticket.device_type}
                                    {ticket.device_model && (
                                        <span className="text-muted-foreground font-normal"> · {ticket.device_model}</span>
                                    )}
                                </p>
                                <p className="text-muted-foreground opacity-80 text-[10px] sm:text-xs truncate mt-0.5 w-full">{ticket.reported_issue}</p>
                            </div>

                            {/* Bottom Container */}
                            <div className="flex items-end justify-between w-full mt-3 pt-2 border-t border-border">
                                {/* Cost */}
                                <div className="text-left flex-shrink-0">
                                    {ticket.final_cost ? (
                                        <div>
                                            <p className="text-success font-bold text-xs sm:text-sm">₹{ticket.final_cost}</p>
                                            <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Final</p>
                                        </div>
                                    ) : ticket.estimated_cost ? (
                                        <div>
                                            <p className="text-foreground font-medium text-xs sm:text-sm">~₹{ticket.estimated_cost}</p>
                                            <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Est.</p>
                                        </div>
                                    ) : (
                                        <p className="text-muted-foreground opacity-50 text-xs sm:text-sm">—</p>
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
