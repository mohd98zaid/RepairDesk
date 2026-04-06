"use client";

import { useEffect, useState } from "react";
import {
    MonitorSmartphone, RefreshCw, ShieldX, Loader2, CheckCircle2, Laptop, Smartphone,
} from "lucide-react";
import { api } from "@/lib/api/client";

interface MySession {
    session_id: string;
    session_key: string;
    ttl_seconds: number;
    ttl_max: number;
    created_ago: string;
    created_at?: string;
    is_current: boolean;
}

const MAX_TTL = 60 * 60 * 24 * 7; // 7 days in seconds

function TTLBar({ pct }: { pct: number }) {
    const color = pct > 60 ? "#4ade80" : pct > 25 ? "#fb923c" : "#f87171";
    return (
        <div style={{ marginTop: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: "#64748b" }}>Session life remaining</span>
                <span style={{ fontSize: 11, fontWeight: 700, color }}>{Math.round(pct)}%</span>
            </div>
            <div style={{ height: 5, background: "rgba(255,255,255,0.06)", borderRadius: 99, overflow: "hidden" }}>
                <div style={{
                    height: "100%", width: `${pct}%`, borderRadius: 99,
                    background: color, transition: "width 0.5s cubic-bezier(0.4,0,0.2,1)",
                }} />
            </div>
        </div>
    );
}

export default function MySessionsPage() {
    const [sessions, setSessions] = useState<MySession[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [killingId, setKillingId] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);

    useEffect(() => { load(); }, []);

    async function load() {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get("/users/me/sessions");
            setSessions(res.data.sessions ?? []);
        } catch (err: any) {
            setError(err?.response?.data?.detail || "Failed to load sessions.");
        } finally {
            setLoading(false);
        }
    }

    async function killSession(sessionId: string) {
        if (!confirm("Sign out of this device? That session will be immediately invalidated.")) return;
        setKillingId(sessionId);
        setSuccessMsg(null);
        try {
            await api.delete(`/users/me/sessions/${sessionId}`);
            setSessions((prev) => prev.filter((s) => s.session_id !== sessionId));
            setSuccessMsg("Device signed out successfully.");
            setTimeout(() => setSuccessMsg(null), 4000);
        } catch (err: any) {
            setError(err?.response?.data?.detail || "Failed to revoke session.");
        } finally {
            setKillingId(null);
        }
    }

    const currentSession = sessions.find((s) => s.is_current);
    const otherSessions = sessions.filter((s) => !s.is_current);

    return (
        <div className="p-6 max-w-2xl mx-auto">
            {/* Header */}
            <div className="flex items-start justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <MonitorSmartphone className="w-6 h-6 text-primary" />
                        Active Sessions
                    </h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        Devices currently signed into your account.
                        {sessions.length > 1 && (
                            <span className="ml-1 text-amber-400 font-medium">
                                {sessions.length} devices active.
                            </span>
                        )}
                    </p>
                </div>
                <button
                    onClick={load}
                    disabled={loading}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-card border border-border text-sm text-foreground hover:bg-muted transition disabled:opacity-50"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                    Refresh
                </button>
            </div>

            {/* Success message */}
            {successMsg && (
                <div className="mb-4 p-3 rounded-xl flex items-center gap-3"
                    style={{ background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.25)" }}>
                    <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: "#4ade80" }} />
                    <p className="text-sm font-medium" style={{ color: "#4ade80" }}>{successMsg}</p>
                </div>
            )}

            {/* Error */}
            {error && (
                <div className="mb-4 p-3 rounded-xl flex items-center gap-3"
                    style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)" }}>
                    <ShieldX className="w-4 h-4 shrink-0" style={{ color: "#f87171" }} />
                    <p className="text-sm" style={{ color: "#f87171" }}>{error}</p>
                </div>
            )}

            {/* Loading skeleton */}
            {loading && (
                <div className="space-y-3">
                    {[1, 2].map((i) => (
                        <div key={i} className="bg-card border border-border rounded-xl p-5 h-24 animate-pulse" />
                    ))}
                </div>
            )}

            {!loading && sessions.length === 0 && !error && (
                <div className="bg-card border border-border rounded-xl p-12 text-center">
                    <MonitorSmartphone className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-30" />
                    <p className="text-muted-foreground">No active sessions found.</p>
                </div>
            )}

            {!loading && sessions.length > 0 && (
                <div className="space-y-3">
                    {/* Current session (always first) */}
                    {currentSession && (
                        <div>
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
                                This Device
                            </p>
                            <SessionCard
                                session={currentSession}
                                isCurrent
                                killing={killingId === currentSession.session_id}
                                onKill={() => {}}
                            />
                        </div>
                    )}

                    {/* Other active sessions */}
                    {otherSessions.length > 0 && (
                        <div>
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1 mt-4">
                                Other Devices ({otherSessions.length})
                            </p>
                            <div className="space-y-3">
                                {otherSessions.map((s) => (
                                    <SessionCard
                                        key={s.session_id}
                                        session={s}
                                        isCurrent={false}
                                        killing={killingId === s.session_id}
                                        onKill={() => killSession(s.session_id)}
                                    />
                                ))}
                            </div>
                            {/* Bulk sign out */}
                            {otherSessions.length > 1 && (
                                <button
                                    onClick={async () => {
                                        if (!confirm(`Sign out of all ${otherSessions.length} other devices?`)) return;
                                        for (const s of otherSessions) {
                                            try { await api.delete(`/users/me/sessions/${s.session_id}`); } catch { }
                                        }
                                        await load();
                                        setSuccessMsg(`Signed out of ${otherSessions.length} other devices.`);
                                    }}
                                    className="mt-3 w-full py-2.5 rounded-xl text-sm font-semibold transition"
                                    style={{
                                        background: "rgba(239,68,68,0.08)",
                                        border: "1px solid rgba(239,68,68,0.2)",
                                        color: "#f87171",
                                    }}
                                >
                                    Sign Out of All Other Devices
                                </button>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Info note */}
            <div className="mt-6 p-4 rounded-xl"
                style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.15)" }}>
                <p className="text-xs text-muted-foreground leading-relaxed">
                    <strong className="text-foreground/80">How sessions work:</strong> Each login creates a session lasting 7 days.
                    Signing out of a device immediately invalidates that session — the device will be shown a
                    &quot;Session Terminated&quot; notice and redirected to sign in again. Your current device cannot be
                    revoked here; use <strong className="text-foreground/80">Sign Out</strong> from the sidebar instead.
                </p>
            </div>
        </div>
    );
}

function SessionCard({
    session, isCurrent, killing, onKill,
}: {
    session: MySession;
    isCurrent: boolean;
    killing: boolean;
    onKill: () => void;
}) {
    const pct = Math.max(0, Math.min(100, (session.ttl_seconds / MAX_TTL) * 100));
    const shortId = session.session_id.split("-")[0];

    return (
        <div className="bg-card border border-border rounded-xl p-5 hover:border-primary/20 transition-colors">
            <div className="flex items-start gap-4">
                {/* Icon */}
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{
                        background: isCurrent ? "rgba(99,102,241,0.12)" : "rgba(255,255,255,0.04)",
                        border: `1px solid ${isCurrent ? "rgba(99,102,241,0.3)" : "rgba(255,255,255,0.08)"}`,
                    }}>
                    {isCurrent
                        ? <Laptop className="w-5 h-5" style={{ color: "#818cf8" }} />
                        : <Smartphone className="w-5 h-5 text-muted-foreground" />}
                </div>

                {/* Session info */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-sm font-semibold text-foreground">
                            {isCurrent ? "This device" : "Other device"}
                        </span>
                        {isCurrent && (
                            <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                                style={{ background: "rgba(74,222,128,0.12)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.25)" }}>
                                ● Active now
                            </span>
                        )}
                        <span className="text-xs text-muted-foreground ml-auto">
                            Signed in {session.created_at ? `${new Date(session.created_at).toLocaleString()} (${session.created_ago})` : session.created_ago}
                        </span>
                    </div>
                    <p className="text-xs text-muted-foreground font-mono">
                        Session ID: {shortId}…
                    </p>
                    <TTLBar pct={pct} />
                </div>

                {/* Kill button (other devices only) */}
                {!isCurrent && (
                    <button
                        onClick={onKill}
                        disabled={killing}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition shrink-0"
                        style={{
                            background: "rgba(239,68,68,0.08)",
                            border: "1px solid rgba(239,68,68,0.25)",
                            color: "#f87171",
                            cursor: killing ? "wait" : "pointer",
                            opacity: killing ? 0.6 : 1,
                        }}
                        id={`kill-session-${shortId}`}
                    >
                        {killing
                            ? <><Loader2 className="w-3 h-3 animate-spin" /> Signing out…</>
                            : <><ShieldX className="w-3 h-3" /> Sign Out</>}
                    </button>
                )}
            </div>
        </div>
    );
}
