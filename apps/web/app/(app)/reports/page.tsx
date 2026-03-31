"use client";

import { useEffect, useState, useCallback } from "react";
import {
    TrendingUp, IndianRupee, Ticket, Package,
    ChevronLeft, ChevronRight, BarChart2, Loader2, RefreshCw
} from "lucide-react";
import { reportsApi, DailyReportData, RangeReportData } from "@/lib/api/reports";
import clsx from "clsx";

type Mode = "daily" | "range";

function fmt(v: string | number) {
    return `₹${parseFloat(String(v)).toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;
}

function StatCard({
    icon: Icon,
    label,
    value,
    sub,
    colorClass,
}: {
    icon: React.ElementType;
    label: string;
    value: string;
    sub?: string;
    colorClass: string;
}) {
    return (
        <div className="glass rounded-xl p-5">
            <div className="flex items-start gap-3">
                <div className={`p-3 rounded-xl ${colorClass}`}>
                    <Icon className="w-5 h-5 text-white" />
                </div>
                <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-wide font-medium">{label}</p>
                    <p className="text-2xl font-bold text-foreground mt-0.5">{value}</p>
                    {sub && <p className="text-muted-foreground text-xs mt-0.5">{sub}</p>}
                </div>
            </div>
        </div>
    );
}

function MiniBarChart({ days }: { days: DailyReportData[] }) {
    const max = Math.max(...days.map((d) => parseFloat(d.total_revenue)), 1);
    return (
        <div className="glass rounded-xl p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">Daily Revenue</h3>
            <div className="flex items-end gap-1 h-28">
                {days.map((day) => {
                    const pct = (parseFloat(day.total_revenue) / max) * 100;
                    return (
                        <div key={day.date} className="flex-1 flex flex-col items-center gap-1 group relative">
                            {/* Tooltip */}
                            <div className="absolute bottom-full mb-1 hidden group-hover:block bg-card border border-border rounded-lg p-2 text-xs text-foreground whitespace-nowrap z-10 pointer-events-none">
                                <p>{new Date(day.date).toLocaleDateString()}</p>
                                <p className="text-emerald-400 font-medium">{fmt(day.total_revenue)}</p>
                                <p className="text-muted-foreground">{day.tickets_completed} completed</p>
                            </div>
                            <div
                                className={clsx(
                                    "w-full rounded-t-sm transition-all",
                                    parseFloat(day.total_revenue) > 0 ? "bg-indigo-500" : "bg-muted"
                                )}
                                style={{ height: `${Math.max(pct, 2)}%` }}
                            />
                            {days.length <= 14 && (
                                <p className="text-muted-foreground text-xs">
                                    {new Date(day.date).getDate()}
                                </p>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export default function ReportsPage() {
    const [mode, setMode] = useState<Mode>("daily");

    // Daily state
    const [dailyDate, setDailyDate] = useState(() => new Date().toISOString().split("T")[0]);
    const [daily, setDaily] = useState<DailyReportData | null>(null);

    // Range state
    const [fromDate, setFromDate] = useState(() => {
        const d = new Date();
        d.setDate(1);  // Start of month
        return d.toISOString().split("T")[0];
    });
    const [toDate, setToDate] = useState(() => new Date().toISOString().split("T")[0]);
    const [range, setRange] = useState<RangeReportData | null>(null);

    const [loading, setLoading] = useState(false);

    const loadDaily = useCallback(async () => {
        setLoading(true);
        try {
            const data = await reportsApi.daily(dailyDate);
            setDaily(data);
        } finally {
            setLoading(false);
        }
    }, [dailyDate]);

    const loadRange = useCallback(async () => {
        setLoading(true);
        try {
            const data = await reportsApi.range(fromDate, toDate);
            setRange(data);
        } finally {
            setLoading(false);
        }
    }, [fromDate, toDate]);

    useEffect(() => {
        if (mode === "daily") loadDaily();
        else loadRange();
    }, [mode, loadDaily, loadRange]);

    const shiftDay = (delta: number) => {
        const d = new Date(dailyDate);
        d.setDate(d.getDate() + delta);
        setDailyDate(d.toISOString().split("T")[0]);
    };

    return (
        <div className="p-4 sm:p-6 max-w-5xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Reports</h1>
                    <p className="text-muted-foreground text-sm mt-1">Financial overview and ticket analytics</p>
                </div>
                {/* Mode toggle */}
                <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
                    {(["daily", "range"] as Mode[]).map((m) => (
                        <button
                            key={m}
                            onClick={() => setMode(m)}
                            className={clsx(
                                "px-4 py-1.5 rounded-md text-sm font-medium capitalize transition",
                                mode === m ? "bg-indigo-600 text-white" : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            {m}
                        </button>
                    ))}
                </div>
            </div>

            {/* Daily mode */}
            {mode === "daily" && (
                <>
                    <div className="flex items-center gap-3 mb-5">
                        <button
                            onClick={() => shiftDay(-1)}
                            className="p-2 rounded-lg bg-muted hover:bg-muted/80 text-muted-foreground"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <input
                            type="date"
                            value={dailyDate}
                            onChange={(e) => setDailyDate(e.target.value)}
                            max={new Date().toISOString().split("T")[0]}
                            className="flex-1 bg-muted border border-border rounded-lg px-3 py-2 text-foreground text-sm focus:outline-none focus:border-indigo-500"
                        />
                        <button
                            onClick={() => shiftDay(1)}
                            disabled={dailyDate >= new Date().toISOString().split("T")[0]}
                            className="p-2 rounded-lg bg-muted hover:bg-muted/80 text-muted-foreground disabled:opacity-30"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                        <button onClick={loadDaily} className="p-2 rounded-lg bg-muted text-muted-foreground hover:text-foreground">
                            <RefreshCw className={clsx("w-4 h-4", loading && "animate-spin")} />
                        </button>
                    </div>

                    {loading ? (
                        <div className="flex items-center justify-center py-24">
                            <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
                        </div>
                    ) : daily ? (
                        <>
                            <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
                                <StatCard icon={IndianRupee} label="Revenue" value={fmt(daily.total_revenue)} sub="From delivered tickets" colorClass="bg-emerald-600" />
                                <StatCard icon={TrendingUp} label="Net Profit" value={fmt(daily.net_profit)} sub={`Parts: ${fmt(daily.total_parts_cost)}`} colorClass="bg-violet-600" />
                                <StatCard icon={Ticket} label="Created" value={String(daily.tickets_created)} sub="New tickets" colorClass="bg-indigo-600" />
                                <StatCard icon={Package} label="Completed" value={String(daily.tickets_completed)} sub={`Avg: ${fmt(daily.avg_ticket_value)}`} colorClass="bg-amber-600" />
                            </div>

                            {/* Status breakdown */}
                            {Object.keys(daily.tickets_by_status).length > 0 && (
                                <div className="glass rounded-xl p-5">
                                    <h3 className="text-sm font-semibold text-foreground mb-3">Tickets by Status</h3>
                                    <div className="flex flex-wrap gap-3">
                                        {Object.entries(daily.tickets_by_status).map(([status, count]) => (
                                            <div key={status} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted">
                                                <span className="text-muted-foreground text-xs">{status.replace(/_/g, " ")}</span>
                                                <span className="text-foreground font-bold text-sm">{count}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    ) : null}
                </>
            )}

            {/* Range mode */}
            {mode === "range" && (
                <>
                    <div className="flex flex-wrap items-end gap-3 mb-5">
                        <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-1">From</label>
                            <input
                                type="date"
                                value={fromDate}
                                onChange={(e) => setFromDate(e.target.value)}
                                max={toDate}
                                className="bg-muted border border-border rounded-lg px-3 py-2 text-foreground text-sm focus:outline-none focus:border-indigo-500"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-1">To</label>
                            <input
                                type="date"
                                value={toDate}
                                onChange={(e) => setToDate(e.target.value)}
                                min={fromDate}
                                max={new Date().toISOString().split("T")[0]}
                                className="bg-muted border border-border rounded-lg px-3 py-2 text-foreground text-sm focus:outline-none focus:border-indigo-500"
                            />
                        </div>
                        <button
                            onClick={loadRange}
                            className="px-4 py-2 rounded-lg gradient-primary text-white text-sm font-medium"
                        >
                            Apply
                        </button>
                    </div>

                    {loading ? (
                        <div className="flex items-center justify-center py-24">
                            <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
                        </div>
                    ) : range ? (
                        <>
                            {/* Totals */}
                            <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
                                <StatCard icon={IndianRupee} label="Total Revenue" value={fmt(range.totals.total_revenue)} colorClass="bg-emerald-600" />
                                <StatCard icon={TrendingUp} label="Net Profit" value={fmt(range.totals.net_profit)} sub={`Parts: ${fmt(range.totals.total_parts_cost)}`} colorClass="bg-violet-600" />
                                <StatCard icon={Ticket} label="Created" value={String(range.totals.tickets_created)} colorClass="bg-indigo-600" />
                                <StatCard icon={Package} label="Completed" value={String(range.totals.tickets_completed)} colorClass="bg-amber-600" />
                            </div>

                            {/* Bar chart */}
                            {range.days.length > 1 && <MiniBarChart days={range.days} />}

                            {/* Day breakdown table */}
                            <div className="glass rounded-xl overflow-hidden mt-4">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b border-border">
                                                {["Date", "Created", "Completed", "Revenue", "Parts", "Profit"].map((h) => (
                                                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                                        {h}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {range.days
                                                .filter((d) => d.tickets_created > 0 || parseFloat(d.total_revenue) > 0)
                                                .map((day) => (
                                                    <tr key={day.date} className="border-b border-border hover:bg-muted/30">
                                                        <td className="px-4 py-3 text-foreground">
                                                            {new Date(day.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                                        </td>
                                                        <td className="px-4 py-3 text-foreground/90">{day.tickets_created}</td>
                                                        <td className="px-4 py-3 text-foreground/90">{day.tickets_completed}</td>
                                                        <td className="px-4 py-3 text-emerald-400 font-medium">{fmt(day.total_revenue)}</td>
                                                        <td className="px-4 py-3 text-muted-foreground">{fmt(day.total_parts_cost)}</td>
                                                        <td className={clsx(
                                                            "px-4 py-3 font-medium",
                                                            parseFloat(day.net_profit) >= 0 ? "text-emerald-400" : "text-red-400"
                                                        )}>
                                                            {fmt(day.net_profit)}
                                                        </td>
                                                    </tr>
                                                ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                    ) : null}
                </>
            )}
        </div>
    );
}
