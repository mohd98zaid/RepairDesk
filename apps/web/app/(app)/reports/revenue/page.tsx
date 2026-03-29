"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, IndianRupee, PieChart, Activity, Loader2, Wrench, Receipt } from "lucide-react";
import { reportsApi, RevenueBreakdownData } from "@/lib/api/reports";
import { useAuthStore } from "@/store/authStore";

export default function RevenueBreakdownPage() {
    const { accessToken } = useAuthStore();
    const [data, setData] = useState<RevenueBreakdownData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        if (accessToken) {
            loadData();
        }
    }, [accessToken]);

    async function loadData() {
        setLoading(true);
        setError(false);
        try {
            const res = await reportsApi.revenueBreakdown();
            setData(res);
        } catch (err) {
            console.error(err);
            setError(true);
        } finally {
            setLoading(false);
        }
    }

    if (error) {
        return (
            <div className="p-6 flex flex-col items-center justify-center min-h-[60vh] gap-4">
                <p className="text-muted-foreground text-sm">Failed to load revenue breakdown.</p>
                <button
                    onClick={loadData}
                    className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-500 transition"
                >
                    Retry
                </button>
            </div>
        );
    }

    if (loading || !data) {
        return (
            <div className="p-6 flex items-center justify-center min-h-[60vh]">
                <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
            </div>
        );
    }

    const totalRev = parseFloat(data.total_revenue) || 0;
    const partsRev = parseFloat(data.parts_revenue) || 0;

    // Sort charges by amount
    const sortedCharges = Object.entries(data.charges_breakdown)
        .map(([name, amount]) => ({ name, amount: parseFloat(amount) }))
        .sort((a, b) => b.amount - a.amount);

    return (
        <div className="p-6 max-w-4xl mx-auto">
            {/* Header */}
            <div className="flex items-center gap-3 mb-8">
                <Link href="/dashboard" className="text-muted-foreground hover:text-foreground transition">
                    <ArrowLeft className="w-5 h-5" />
                </Link>
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Revenue Breakdown</h1>
                    <p className="text-muted-foreground text-sm">Detailed view of all-time money collected from delivered tickets.</p>
                </div>
            </div>

            {/* Total Rev Card */}
            <div className="glass rounded-xl p-8 mb-8 text-center bg-gradient-to-br from-indigo-900/40 to-emerald-900/20 border border-indigo-500/20 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-10">
                    <IndianRupee className="w-32 h-32" />
                </div>
                <div className="relative z-10">
                    <p className="text-muted-foreground text-sm uppercase tracking-widest font-semibold mb-2 flex items-center justify-center gap-2">
                        <Activity className="w-4 h-4 text-emerald-400" />
                        Combined Total Revenue
                    </p>
                    <h2 className="text-5xl font-black text-foreground tracking-tight">
                        ₹{totalRev.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </h2>
                </div>
            </div>

            {/* Breakdown Grid */}
            <div className="grid md:grid-cols-2 gap-6">

                {/* Parts Revenue */}
                <div className="glass rounded-xl p-6 relative overflow-hidden group hover:border-violet-500/50 transition duration-300">
                    <div className="flex items-start gap-4 mb-6">
                        <div className="p-3 bg-violet-500/20 text-violet-400 rounded-xl">
                            <Wrench className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-foreground">Parts Revenue</h3>
                            <p className="text-muted-foreground text-xs mt-1">Income generated strictly from selling parts.</p>
                        </div>
                    </div>

                    <div className="flex items-end justify-between border-t border-border/50 pt-4 mt-auto">
                        <span className="text-3xl font-bold text-violet-300">
                            ₹{partsRev.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        {totalRev > 0 && (
                            <span className="text-xs font-medium text-violet-400 bg-violet-400/10 px-2 py-1 rounded">
                                {((partsRev / totalRev) * 100).toFixed(1)}% of total
                            </span>
                        )}
                    </div>
                </div>

                {/* Charges Revenue */}
                <div className="glass rounded-xl p-6 max-h-[400px] flex flex-col">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-xl">
                            <Receipt className="w-5 h-5" />
                        </div>
                        <h3 className="text-lg font-semibold text-foreground">Charges Breakdown</h3>
                    </div>

                    <div className="flex-1 overflow-y-auto pr-2 space-y-3">
                        {sortedCharges.length === 0 ? (
                            <p className="text-muted-foreground text-sm text-center italic py-8">No extra charges recorded yet.</p>
                        ) : (
                            sortedCharges.map((charge, idx) => {
                                const pct = totalRev > 0 ? ((charge.amount / totalRev) * 100).toFixed(1) : 0;
                                return (
                                    <div key={idx} className="flex flex-col gap-1 p-3 bg-muted/50 hover:bg-muted rounded-lg transition border border-border/50">
                                        <div className="flex items-center justify-between">
                                            <span className="font-medium text-foreground">{charge.name}</span>
                                            <span className="font-bold text-emerald-400">
                                                ₹{charge.amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </span>
                                        </div>
                                        {totalRev > 0 && (
                                            <div className="flex items-center gap-2">
                                                <div className="flex-1 h-1.5 bg-card rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full bg-emerald-500"
                                                        style={{ width: `${Math.max(Number(pct), 2)}%` }}
                                                    />
                                                </div>
                                                <span className="text-[10px] text-muted-foreground w-8 text-right">{pct}%</span>
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
}
