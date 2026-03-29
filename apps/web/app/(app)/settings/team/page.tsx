"use client";

import { useEffect, useState } from "react";
import {
    Users, Mail, UserX, UserPlus, Crown,
    Wrench, Loader2, X, CheckCircle, AlertTriangle
} from "lucide-react";
import { api } from "@/lib/api/client";
import { useAuthStore } from "@/store/authStore";

interface TeamMember {
    id: string;
    full_name: string;
    email: string;
    role: "OWNER" | "TECHNICIAN";
    is_active: boolean;
    created_at: string;
}

interface PendingInvite {
    id: string;
    email: string;
    created_at: string;
}

function RoleBadge({ role }: { role: string }) {
    return role === "OWNER" ? (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium">
            <Crown className="w-3 h-3" /> Owner
        </span>
    ) : (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted border border-border text-muted-foreground text-xs font-medium">
            <Wrench className="w-3 h-3" /> Technician
        </span>
    );
}

// Invite Modal
function InviteModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const handleInvite = async () => {
        if (!email.trim()) return;
        setLoading(true);
        setError(null);
        try {
            await api.post("/team/invite", { email: email.trim() });
            setSuccess(true);
            setTimeout(() => { onSuccess(); onClose(); }, 1500);
        } catch (e: unknown) {
            const err = e as { response?: { data?: { detail?: string } } };
            setError(err.response?.data?.detail || "Failed to send invite.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="bg-card border border-border shadow-md rounded-2xl p-6 w-full max-w-sm">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-foreground">Invite Technician</h2>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
                </div>
                {success ? (
                    <div className="flex flex-col items-center py-4 text-success">
                        <CheckCircle className="w-10 h-10 mb-2" />
                        <p className="text-sm font-medium">Invite sent!</p>
                    </div>
                ) : (
                    <>
                        {error && (
                            <div className="mb-3 p-2 rounded-lg bg-danger/10 border border-danger/20 text-danger text-xs">{error}</div>
                        )}
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Email address</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleInvite()}
                            placeholder="tech@yourshop.com"
                            autoFocus
                            className="w-full px-3 py-2.5 rounded-lg bg-card border border-border text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:border-primary shadow-sm mb-4 transition"
                        />
                        <div className="flex gap-3">
                            <button onClick={onClose} className="flex-1 py-2 rounded-lg bg-muted border border-border shadow-sm text-foreground text-sm hover:bg-muted/80 transition">Cancel</button>
                            <button
                                onClick={handleInvite}
                                disabled={loading || !email.trim()}
                                className="flex-1 py-2 rounded-lg gradient-primary text-white text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                Send Invite
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

export default function TeamPage() {
    const { user } = useAuthStore();
    const isOwner = user?.role === "OWNER";

    const [members, setMembers] = useState<TeamMember[]>([]);
    const [loading, setLoading] = useState(true);
    const [showInvite, setShowInvite] = useState(false);
    const [deactivating, setDeactivating] = useState<string | null>(null);

    const load = async () => {
        setLoading(true);
        try {
            const { data } = await api.get("/team");
            setMembers(data.members || data);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const handleDeactivate = async (memberId: string) => {
        if (!confirm("Deactivate this team member? They will lose access.")) return;
        setDeactivating(memberId);
        try {
            await api.delete(`/team/${memberId}`);
            await load();
        } finally {
            setDeactivating(null);
        }
    };

    const activeMembers = members.filter((m) => m.is_active);
    const inactiveMembers = members.filter((m) => !m.is_active);

    return (
        <div className="p-6 max-w-3xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Team</h1>
                    <p className="text-muted-foreground font-medium text-sm mt-1">{activeMembers.length} active member{activeMembers.length !== 1 ? "s" : ""}</p>
                </div>
                {isOwner && (
                    <button
                        onClick={() => setShowInvite(true)}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-lg gradient-primary text-white font-medium text-sm hover:opacity-90 transition"
                    >
                        <UserPlus className="w-4 h-4" /> Invite
                    </button>
                )}
            </div>

            {loading ? (
                <div className="space-y-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="bg-card border border-border shadow-sm rounded-xl p-4 h-16 animate-pulse" />
                    ))}
                </div>
            ) : (
                <>
                    {/* Active members */}
                    <div className="bg-card border border-border shadow-sm rounded-xl overflow-hidden mb-4">
                        {activeMembers.length === 0 ? (
                            <div className="py-12 text-center text-muted-foreground">
                                <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                                <p className="text-sm">No team members yet</p>
                            </div>
                        ) : (
                            activeMembers.map((member, i) => (
                                <div
                                    key={member.id}
                                    className="flex items-center gap-4 px-5 py-4 border-b border-border last:border-0 hover:bg-muted/30 transition"
                                >
                                    {/* Avatar */}
                                    <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                                        <span className="text-primary font-semibold text-sm">
                                            {member.full_name.charAt(0).toUpperCase()}
                                        </span>
                                    </div>
                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <p className="text-foreground font-medium text-sm">{member.full_name}</p>
                                            <RoleBadge role={member.role} />
                                            {member.id === user?.id && (
                                                <span className="text-muted-foreground opacity-80 text-xs">(you)</span>
                                            )}
                                        </div>
                                        <p className="text-muted-foreground text-xs flex items-center gap-1 mt-0.5">
                                            <Mail className="w-3 h-3" /> {member.email}
                                        </p>
                                    </div>
                                    {/* Actions */}
                                    {isOwner && member.role !== "OWNER" && member.id !== user?.id && (
                                        <button
                                            onClick={() => handleDeactivate(member.id)}
                                            disabled={deactivating === member.id}
                                            className="p-2 rounded-lg text-muted-foreground hover:text-danger hover:bg-danger/10 transition disabled:opacity-30"
                                            title="Deactivate member"
                                        >
                                            {deactivating === member.id ? (
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                            ) : (
                                                <UserX className="w-4 h-4" />
                                            )}
                                        </button>
                                    )}
                                </div>
                            ))
                        )}
                    </div>

                    {/* Inactive members */}
                    {inactiveMembers.length > 0 && (
                        <div>
                            <p className="text-muted-foreground opacity-80 text-xs uppercase tracking-wide font-semibold mb-2 px-1">Inactive</p>
                            <div className="bg-card border border-border shadow-sm rounded-xl overflow-hidden opacity-80">
                                {inactiveMembers.map((member) => (
                                    <div key={member.id} className="flex items-center gap-4 px-5 py-3 border-b border-border last:border-0 hover:bg-muted/30 transition">
                                        <div className="w-9 h-9 rounded-full bg-muted border border-border flex items-center justify-center flex-shrink-0">
                                            <span className="text-muted-foreground text-sm">{member.full_name.charAt(0)}</span>
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-muted-foreground text-sm line-through">{member.full_name}</p>
                                            <p className="text-muted-foreground opacity-80 text-xs">{member.email}</p>
                                        </div>
                                        <span className="text-xs text-muted-foreground bg-muted border border-border px-2 py-0.5 rounded-full">Inactive</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </>
            )}

            {showInvite && (
                <InviteModal onClose={() => setShowInvite(false)} onSuccess={load} />
            )}
        </div>
    );
}
