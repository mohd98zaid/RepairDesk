"use client";

import { useState, useEffect } from "react";
import { Loader2, Plus, X, Search, PackageMinus } from "lucide-react";
import { ticketsApi } from "@/lib/api/tickets";
import { inventoryApi } from "@/lib/api/inventory";
import type { TicketDetail, InventoryItem } from "@/types";

export function PartsSelector({
    ticket,
    onUpdate
}: {
    ticket: TicketDetail;
    onUpdate: (updatedTicket: TicketDetail) => void;
}) {
    const [search, setSearch] = useState("");
    const [results, setResults] = useState<InventoryItem[]>([]);
    const [searching, setSearching] = useState(false);
    const [addingPart, setAddingPart] = useState<string | null>(null);
    const [removingPart, setRemovingPart] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [focus, setFocus] = useState(false);

    useEffect(() => {
        if (!search.trim()) {
            setResults([]);
            return;
        }

        const timer = setTimeout(async () => {
            setSearching(true);
            try {
                const data = await inventoryApi.list({ search, per_page: 5 });
                setResults(data.items);
            } catch (e) {
                // ignore search error
            } finally {
                setSearching(false);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [search]);

    const handleAdd = async (itemId: string) => {
        setAddingPart(itemId);
        setError(null);
        try {
            await ticketsApi.addPart(ticket.id, itemId, 1);
            const updated = await ticketsApi.get(ticket.id);
            onUpdate(updated);
            setSearch("");
            setResults([]);
        } catch (err: unknown) {
            const e = err as { response?: { data?: { detail?: string } } };
            setError(e.response?.data?.detail || "Failed to add part");
        } finally {
            setAddingPart(null);
        }
    };

    const handleRemove = async (partId: string) => {
        setRemovingPart(partId);
        setError(null);
        try {
            await ticketsApi.removePart(ticket.id, partId);
            const updated = await ticketsApi.get(ticket.id);
            onUpdate(updated);
        } catch (err: unknown) {
            const e = err as { response?: { data?: { detail?: string } } };
            setError(e.response?.data?.detail || "Failed to remove part");
        } finally {
            setRemovingPart(null);
        }
    };

    return (
        <div className="glass rounded-xl p-5">
            <h2 className="text-sm font-semibold text-foreground/90 mb-3 flex items-center gap-2">
                <PackageMinus className="w-4 h-4" /> Parts Used
            </h2>

            {error && (
                <p className="text-red-400 text-xs mb-3 p-2 bg-red-900/20 rounded-lg border border-red-800">
                    {error}
                </p>
            )}

            {/* Parts List */}
            <div className="space-y-2 mb-4">
                {ticket.parts.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No parts added yet.</p>
                ) : (
                    ticket.parts.map((p) => (
                        <div key={p.id} className="flex items-center justify-between p-2 rounded bg-muted border border-border">
                            <div>
                                <p className="text-sm text-foreground">{p.name}</p>
                                <p className="text-xs text-muted-foreground">
                                    {p.quantity} x ₹{p.cost}
                                </p>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="text-sm font-medium text-foreground">
                                    ₹{(p.quantity * parseFloat(p.cost || "0")).toFixed(2)}
                                </span>
                                <button
                                    onClick={() => handleRemove(p.id)}
                                    disabled={removingPart === p.id}
                                    className="p-1 rounded text-red-400 hover:bg-muted/80 transition disabled:opacity-50"
                                    title="Remove part"
                                >
                                    {removingPart === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Parts Search */}
            <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="w-4 h-4 text-muted-foreground" />
                </div>
                <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onFocus={() => setFocus(true)}
                    onBlur={() => setTimeout(() => setFocus(false), 200)}
                    placeholder="Search and add parts..."
                    className="w-full pl-9 pr-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-indigo-500"
                />

                {focus && search.trim() && (
                    <div className="absolute z-10 w-full mt-1 bg-muted border border-border rounded-lg shadow-lg overflow-hidden max-h-48 overflow-y-auto">
                        {searching ? (
                            <div className="p-3 text-center text-muted-foreground text-sm flex items-center justify-center gap-2">
                                <Loader2 className="w-4 h-4 animate-spin" /> Searching...
                            </div>
                        ) : results.length === 0 ? (
                            <div className="p-3 text-center text-muted-foreground text-sm">No parts found matching &quot;{search}&quot;</div>
                        ) : (
                            results.map((item) => (
                                <button
                                    key={item.id}
                                    onClick={() => handleAdd(item.id)}
                                    disabled={addingPart === item.id || item.quantity <= 0}
                                    className="w-full flex items-center justify-between p-2 hover:bg-muted/80 transition disabled:opacity-50 text-left"
                                >
                                    <div>
                                        <p className="text-sm text-foreground">{item.name}</p>
                                        <p className="text-xs text-muted-foreground">In stock: {item.quantity}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium text-foreground/90">₹{item.selling_price}</span>
                                        <Plus className="w-4 h-4 text-indigo-400" />
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
