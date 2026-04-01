"use client";

import { useEffect, useState } from "react";
import { Activity, RefreshCw, Ticket, Users, Package, Store, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api/client";

interface LogEntry {
    id: string;
    action: string;
    entity: string;
    entity_id: string;
    changed_by: string;
    changed_at: string;
    notes?: string;
}

const ENTITY_ICONS: Record<string, React.ElementType> = {
    ticket: Ticket,
    customer: Users,
    inventory: Package,
    shop: Store,
    user: ShieldCheck,
};

const ACTION_COLORS: Record<string, string> = {
    CREATE: "text-success bg-success/10 border-success/20",
    UPDATE: "text-primary bg-primary/10 border-primary/20",
    DELETE: "text-danger bg-danger/10 border-danger/20",
    STATUS_CHANGE: "text-warning bg-warning/10 border-warning/20",
};

function timeAgo(dateStr: string) {
    const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export default function ActivityLogPage() {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState("ALL");

    useEffect(() => { load(); }, []);

    async function load() {
        setLoading(true);
        try {
            // Use ticket status logs + other structured activity as proxy
            const [ticketRes] = await Promise.all([
                api.get("/tickets?per_page=50"),
            ]);
            // Build activity entries from ticket data
            const entries: LogEntry[] = [];
            for (const t of (ticketRes.data?.items || [])) {
                // created_by_name is now populated by the backend with the real user name
                const creatorName = t.created_by_name || t.created_by || "Unknown";
                entries.push({
                    id: t.id + "_create",
                    action: "CREATE",
                    entity: "ticket",
                    entity_id: t.id,
                    changed_by: creatorName,
                    changed_at: t.created_at,
                    notes: `Ticket RD-${String(t.ticket_number).padStart(5, "0")} created for ${t.device_type}`,
                });
                for (const log of (t.status_logs || [])) {
                    entries.push({
                        id: t.id + "_" + log.changed_at,
                        action: "STATUS_CHANGE",
                        entity: "ticket",
                        entity_id: t.id,
                        // changed_by from status_logs is already a full_name (resolved by backend)
                        changed_by: log.changed_by || "Unknown",
                        changed_at: log.changed_at,
                        notes: `RD-${String(t.ticket_number).padStart(5, "0")}: ${(log.from_status || "NEW").replace(/_/g, " ")} → ${log.to_status.replace(/_/g, " ")}${log.notes ? ` — "${log.notes}"` : ""}`,
                    });
                }
            }
            entries.sort((a, b) => new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime());
            setLogs(entries.slice(0, 100));
        } catch { /* silent */ }
        finally { setLoading(false); }
    }

    const filtered = filter === "ALL" ? logs : logs.filter(l => l.action === filter);
    const filters = ["ALL", "CREATE", "STATUS_CHANGE", "UPDATE", "DELETE"];

    return (
        <div className="p-6 max-w-3xl mx-auto">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <Activity className="w-6 h-6 text-primary" /> Activity Log
                    </h1>
                    <p className="text-muted-foreground text-sm mt-1">Recent actions in your repair shop</p>
                </div>
                <button onClick={load} disabled={loading}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-card border border-border shadow-sm hover:bg-muted text-foreground text-sm transition disabled:opacity-50">
                    <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Refresh
                </button>
            </div>

            {/* Filter tabs */}
            <div className="flex gap-2 mb-5 flex-wrap">
                {filters.map(f => (
                    <button key={f} onClick={() => setFilter(f)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition shadow-sm ${filter === f
                            ? "bg-primary/10 text-primary border-primary/20"
                            : "bg-card text-muted-foreground border-border hover:bg-muted"
                            }`}>
                        {f.replace("_", " ")}
                        {f !== "ALL" && (
                            <span className="ml-1.5 text-muted-foreground opacity-70">
                                {logs.filter(l => l.action === f).length}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="space-y-3">
                    {Array.from({ length: 8 }).map((_, i) => (
                        <div key={i} className="bg-card border border-border shadow-sm rounded-xl p-4 h-16 animate-pulse" />
                    ))}
                </div>
            ) : filtered.length === 0 ? (
                <div className="bg-card border border-border shadow-sm rounded-xl p-12 text-center text-muted-foreground">
                    <Activity className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p>No activity found.</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {filtered.map(log => {
                        const Icon = ENTITY_ICONS[log.entity] ?? Activity;
                        const color = ACTION_COLORS[log.action] ?? "text-muted-foreground bg-muted border-border";
                        return (
                            <div key={log.id} className="bg-card border border-border shadow-sm rounded-xl p-4 flex items-start gap-4 hover:shadow-md transition">
                                <div className={`w-8 h-8 rounded-lg border flex items-center justify-center flex-shrink-0 ${color}`}>
                                    <Icon className="w-4 h-4" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm text-foreground font-medium">{log.notes || `${log.action} on ${log.entity}`}</p>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        <span className="font-medium text-foreground opacity-80">{log.changed_by}</span>
                                        {" · "}{timeAgo(log.changed_at)}
                                    </p>
                                </div>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex-shrink-0 ${color}`}>
                                    {log.action.replace("_", " ")}
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
