"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Search, X, Ticket, User, Package, Loader2, QrCode } from "lucide-react";
import { api } from "@/lib/api/client";
import { QRScannerModal } from "@/components/QRScanner";
import Link from "next/link";
import { clsx } from "clsx";
import { useCurrency } from "@/store/shopStore";

interface SearchResult {
    tickets: any[];
    customers: any[];
    inventory: any[];
}

export function GlobalSearch({ onSearch }: { onSearch?: () => void }) {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<SearchResult | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const [isScannerOpen, setIsScannerOpen] = useState(false);
    const router = useRouter();
    const containerRef = useRef<HTMLDivElement>(null);
    const currency = useCurrency();

    // Close when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Debounced Search API call
    useEffect(() => {
        if (!query.trim() || query.length < 2) {
            setResults(null);
            setIsLoading(false);
            return;
        }

        const timer = setTimeout(async () => {
            setIsLoading(true);
            try {
                const res = await api.get(`/search?query=${encodeURIComponent(query)}`);
                setResults(res.data);
                setIsOpen(true);
            } catch (err) {
                console.error("Search failed", err);
            } finally {
                setIsLoading(false);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [query]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (query.trim()) {
            router.push(`/tickets?q=${encodeURIComponent(query.trim())}`);
            setIsOpen(false);
            onSearch?.();
        }
    };

    const handleClear = () => {
        setQuery("");
        setResults(null);
        setIsOpen(false);
    };

    const handleResultClick = () => {
        setIsOpen(false);
        onSearch?.();
    };

    const hasResults = results && (results.tickets.length > 0 || results.customers.length > 0 || results.inventory.length > 0);

    return (
        <div ref={containerRef} className="relative w-full">
            <form onSubmit={handleSubmit} className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                    type="text"
                    placeholder="Search tickets, customers, items..."
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setIsOpen(true);
                    }}
                    onFocus={() => {
                        if (query.length >= 2) setIsOpen(true);
                    }}
                    className="w-full pl-9 pr-8 py-2 rounded-lg bg-muted text-sm text-foreground placeholder-muted-foreground border border-border focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-sm transition"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    {query && (
                        <button type="button" onClick={handleClear} className="p-1.5 text-muted-foreground hover:text-foreground">
                            {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                        </button>
                    )}
                    <button type="button" onClick={() => setIsScannerOpen(true)} className="p-1.5 text-muted-foreground hover:text-primary transition" title="Scan QR Code">
                        <QrCode className="w-4 h-4" />
                    </button>
                </div>
            </form>

            {isScannerOpen && (
                <QRScannerModal onClose={() => setIsScannerOpen(false)} />
            )}

            {/* Results Dropdown */}
            {isOpen && query.length >= 2 && (
                <div className="absolute top-12 left-0 right-0 w-full min-w-[320px] bg-card border border-border rounded-xl shadow-2xl z-50 overflow-hidden flex flex-col max-h-[70vh]">
                    {isLoading && !results ? (
                        <div className="p-4 text-center text-sm text-muted-foreground">Searching...</div>
                    ) : !hasResults && !isLoading ? (
                        <div className="p-4 text-center text-sm text-muted-foreground">No results found for "{query}"</div>
                    ) : (
                        <div className="overflow-y-auto">
                            {/* Tickets */}
                            {results?.tickets && results.tickets.length > 0 && (
                                <div className="p-2">
                                    <div className="px-2 py-1 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                                        <Ticket className="w-3.5 h-3.5" /> Tickets
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        {results.tickets.map((t) => (
                                            <Link
                                                key={t.id}
                                                href={`/tickets/${t.id}`}
                                                onClick={handleResultClick}
                                                className="flex flex-col px-3 py-2 rounded-md hover:bg-muted transition"
                                            >
                                                <div className="flex justify-between items-center mb-0.5">
                                                    <span className="text-sm font-medium text-foreground">{t.device_type}</span>
                                                    <span className="text-xs text-muted-foreground">#{t.id.split('-')[0]}</span>
                                                </div>
                                                <span className="text-xs text-muted-foreground truncate">{t.customer?.name} • {t.issue_description}</span>
                                            </Link>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Customers */}
                            {results?.customers && results.customers.length > 0 && (
                                <div className="p-2 border-t border-border">
                                    <div className="px-2 py-1 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                                        <User className="w-3.5 h-3.5" /> Customers
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        {results.customers.map((c) => (
                                            <Link
                                                key={c.id}
                                                href={`/customers/${c.id}`}
                                                onClick={handleResultClick}
                                                className="flex flex-col px-3 py-2 rounded-md hover:bg-muted transition"
                                            >
                                                <span className="text-sm font-medium text-foreground">{c.name}</span>
                                                <span className="text-xs text-muted-foreground truncate">{c.email || c.phone}</span>
                                            </Link>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Inventory */}
                            {results?.inventory && results.inventory.length > 0 && (
                                <div className="p-2 border-t border-border">
                                    <div className="px-2 py-1 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                                        <Package className="w-3.5 h-3.5" /> Inventory
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        {results.inventory.map((i) => (
                                            <Link
                                                key={i.id}
                                                href={`/inventory?q=${i.name}`}
                                                onClick={handleResultClick}
                                                className="flex flex-col px-3 py-2 rounded-md hover:bg-muted transition"
                                            >
                                                <div className="flex justify-between items-center mb-0.5">
                                                    <span className="text-sm font-medium text-foreground">{i.name}</span>
                                                    <span className="text-xs font-medium text-foreground">{currency}{i.selling_price}</span>
                                                </div>
                                                <div className="flex justify-between text-xs text-muted-foreground">
                                                    <span>{i.sku}</span>
                                                    <span className={clsx(i.quantity <= (i.low_stock_threshold || 5) && "text-danger font-medium")}>
                                                        {i.quantity} in stock
                                                    </span>
                                                </div>
                                            </Link>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* View All */}
                            <div className="p-2 border-t border-border bg-muted/30">
                                <button
                                    onClick={handleSubmit}
                                    className="w-full text-center py-1.5 text-sm text-primary font-medium hover:text-primary/80 transition"
                                >
                                    Press Enter to search tickets
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
