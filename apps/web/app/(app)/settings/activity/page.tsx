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
            const res = await api.get("/activity?per_page=100");
            const entries: LogEntry[] = (res.data?.items || []).map((t: any) => ({
                id: t.id,
                action: t.action,
                entity: t.entity_type,
                entity_id: t.entity_id,
                changed_by: t.user_name || "Unknown",
                changed_at: t.created_at,
                notes: t.details?.old_status ? `${t.details.old_status} → ${t.details.new_status}` : t.details?.notes || `${t.action.replace(/_/g, " ")} on ${t.entity_type}`,
            }));
            setLogs(entries);
        } catch { /* silent */ }
        finally { setLoading(false); }
    }

    const filtered = filter === "ALL" ? logs : logs.filter(l => l.action === filter);
    const filters = ["ALL", ...Array.from(new Set(logs.map(l => l.action)))].slice(0, 8);

    return (
        <div className="p-6 max-w-3xl mx-auto">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <Activity className="w-6 h-6 text-primary" /> Activity Log
                    </h1>
                    <p className="text-muted-foreground text-sm mt-1">Recent actions and authentications in your repair shop</p>
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
                        {f.replace(/_/g, " ")}
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
                        let color = "text-muted-foreground bg-muted border-border";
                        if (log.action.includes("CREATE")) color = "text-success bg-success/10 border-success/20";
                        else if (log.action.includes("UPDATE")) color = "text-primary bg-primary/10 border-primary/20";
                        else if (log.action.includes("DELETE")) color = "text-danger bg-danger/10 border-danger/20";
                        else if (log.action.includes("ASSIGN")) color = "text-indigo-500 bg-indigo-500/10 border-indigo-500/20";
                        else if (log.action.includes("LOGIN")) color = "text-emerald-500 bg-emerald-500/10 border-emerald-500/20";
                        else if (log.action.includes("STATUS")) color = "text-warning bg-warning/10 border-warning/20";
                        
                        return (
                            <div key={log.id} className="bg-card border border-border shadow-sm rounded-xl p-4 flex items-start gap-4 hover:shadow-md transition">
                                <div className={`w-8 h-8 rounded-lg border flex items-center justify-center flex-shrink-0 ${color}`}>
                                    <Icon className="w-4 h-4" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm text-foreground font-medium">{log.notes || `${log.action} on ${log.entity}`}</p>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        <span className="font-medium text-foreground opacity-80">{log.changed_by}</span>
                                        {" · "}{new Date(log.changed_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'medium' })} ({timeAgo(log.changed_at)})
                                    </p>
                                </div>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex-shrink-0 ${color}`}>
                                    {log.action.replace(/_/g, " ")}
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
