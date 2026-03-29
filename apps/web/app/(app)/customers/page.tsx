"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Search, UserPlus, Users, Phone } from "lucide-react";
import { customersApi } from "@/lib/api/tickets";
import { InfiniteScrollObserver } from "@/components/InfiniteScrollObserver";

interface CustomerRow {
    id: string;
    name: string;
    phone: string;
    email?: string;
    created_at: string;
    total_spent: string;
}

function CustomerSkeleton() {
    return (
        <div className="bg-card border border-border shadow-sm rounded-xl p-4 flex gap-4 animate-pulse">
            <div className="w-10 h-10 rounded-full bg-muted" />
            <div className="flex-1 space-y-2">
                <div className="h-3 bg-muted rounded w-1/3" />
                <div className="h-3 bg-muted rounded w-1/4" />
            </div>
        </div>
    );
}

export default function CustomersPage() {
    const [customers, setCustomers] = useState<CustomerRow[]>([]);
    const [total, setTotal] = useState(0);
    const [pages, setPages] = useState(1);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);

    const load = useCallback(async () => {
        if (page === 1) setLoading(true);
        else setLoadingMore(true);

        try {
            const res = await customersApi.list(search || undefined, page, 20);
            setCustomers(prev => page === 1 ? res.items : [...prev, ...res.items]);
            setTotal(res.total);
            setPages(res.pages);
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    }, [search, page]);

    useEffect(() => { load(); }, [load]);

    return (
        <div className="p-6 max-w-4xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Customers</h1>
                    <p className="text-muted-foreground font-medium text-sm mt-1">{total} registered</p>
                </div>
            </div>

            {/* Search */}
            <div className="relative mb-5">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                    placeholder="Search by name or phone…"
                    className="w-full pl-9 pr-4 py-2.5 rounded-lg bg-card border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary text-sm shadow-sm"
                />
            </div>

            {/* Customer list */}
            <div className="space-y-2">
                {loading ? (
                    Array.from({ length: 5 }).map((_, i) => <CustomerSkeleton key={i} />)
                ) : customers.length === 0 ? (
                    <div className="bg-card border border-border shadow-sm rounded-xl py-16 flex flex-col items-center text-muted-foreground">
                        <Users className="w-10 h-10 mb-3 opacity-30" />
                        <p className="text-sm">No customers yet. They appear when you create tickets.</p>
                    </div>
                ) : (
                    customers.map((c) => (
                        <Link
                            key={c.id}
                            href={`/customers/${c.id}`}
                            className="bg-card border border-border shadow-sm rounded-xl p-4 flex items-center gap-4 hover:border-primary/40 hover:shadow-md transition"
                        >
                            {/* Avatar */}
                            <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                                <span className="text-primary font-semibold text-sm">
                                    {c.name.charAt(0).toUpperCase()}
                                </span>
                            </div>
                            {/* Info */}
                            <div className="flex-1 min-w-0">
                                <p className="text-foreground font-medium text-sm">{c.name}</p>
                                <p className="text-muted-foreground text-xs flex items-center gap-1 mt-0.5">
                                    <Phone className="w-3 h-3" /> {c.phone}
                                </p>
                            </div>
                            {/* Revenue */}
                            <div className="text-right mr-4 hidden sm:block">
                                <p className="text-success font-medium text-sm">
                                    ₹{parseFloat(c.total_spent || "0").toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                                </p>
                                <p className="text-muted-foreground text-[10px] uppercase tracking-wider">Revenue</p>
                            </div>
                            {/* Date */}
                            <p className="text-muted-foreground text-xs hidden sm:block">
                                {new Date(c.created_at).toLocaleDateString()}
                            </p>
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
