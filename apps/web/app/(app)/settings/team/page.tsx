"use client";

import { useEffect, useState } from "react";
import {
    Users, Mail, UserX, UserPlus, Crown,
    Wrench, Loader2, X, CheckCircle, Trash2,
    Eye, EyeOff, Copy, Check, Key
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

// Add Member Modal with Direct Credentials (Email + Password)
function AddMemberModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
    const [fullName, setFullName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [role, setRole] = useState<"TECHNICIAN" | "OWNER">("TECHNICIAN");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Created credentials to display after success
    const [createdCreds, setCreatedCreds] = useState<{ email: string; password: string } | null>(null);
    const [copied, setCopied] = useState(false);

    const handleAdd = async () => {
        if (!email.trim() || !fullName.trim()) {
            setError("Full name and email are required.");
            return;
        }
        if (password.trim() && password.trim().length < 6) {
            setError("Password must be at least 6 characters.");
            return;
        }

        setLoading(true);
        setError(null);
        try {
            const res = await api.post("/team/invite", {
                email: email.trim(),
                full_name: fullName.trim(),
                role: role,
                password: password.trim() || undefined,
            });

            const creds = res.data?.credentials || { email: email.trim(), password: password.trim() };
            setCreatedCreds(creds);
            onSuccess();
        } catch (e: unknown) {
            const err = e as { response?: { data?: { detail?: string } } };
            setError(err.response?.data?.detail || "Failed to create team member.");
        } finally {
            setLoading(false);
        }
    };

    const handleCopy = () => {
        if (!createdCreds) return;
        const text = `RepairDesk Technician Login Credentials:\nEmail: ${createdCreds.email}\nPassword: ${createdCreds.password}\nLogin URL: ${window.location.origin}/login`;
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="bg-card border border-border shadow-xl rounded-2xl p-6 w-full max-w-md">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-foreground">
                        {createdCreds ? "Technician Account Created" : "Add Team Member"}
                    </h2>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {createdCreds ? (
                    <div className="space-y-4">
                        <div className="flex items-center gap-3 p-3 rounded-xl bg-success/10 border border-success/20 text-success text-sm">
                            <CheckCircle className="w-5 h-5 flex-shrink-0" />
                            <span>Account created successfully! Provide these login credentials to your technician.</span>
                        </div>

                        <div className="p-4 rounded-xl bg-muted/50 border border-border space-y-2.5 font-mono text-sm">
                            <div>
                                <span className="text-xs text-muted-foreground font-sans block mb-0.5">Login ID (Email)</span>
                                <span className="text-foreground font-medium select-all">{createdCreds.email}</span>
                            </div>
                            <div>
                                <span className="text-xs text-muted-foreground font-sans block mb-0.5">Password</span>
                                <span className="text-foreground font-medium select-all">{createdCreds.password}</span>
                            </div>
                        </div>

                        <p className="text-xs text-muted-foreground">
                            The technician can immediately sign in with these credentials at <strong className="text-foreground">{typeof window !== 'undefined' ? window.location.origin : ''}/login</strong>.
                        </p>

                        <div className="flex gap-3 pt-2">
                            <button
                                onClick={handleCopy}
                                className="flex-1 py-2.5 rounded-lg border border-border bg-card hover:bg-muted text-foreground text-sm font-medium transition flex items-center justify-center gap-2"
                            >
                                {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                                {copied ? "Copied Credentials!" : "Copy Credentials"}
                            </button>
                            <button
                                onClick={onClose}
                                className="flex-1 py-2.5 rounded-lg gradient-primary text-white text-sm font-medium transition hover:opacity-90"
                            >
                                Done
                            </button>
                        </div>
                    </div>
                ) : (
                    <div>
                        <p className="text-xs text-muted-foreground mb-4">
                            Directly create a login ID and password for your technician. Free accounts support 1 technician.
                        </p>

                        {error && (
                            <div className="mb-4 p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-xs leading-relaxed">
                                {error}
                            </div>
                        )}

                        <div className="space-y-3.5">
                            <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-1">Full Name *</label>
                                <input
                                    type="text"
                                    value={fullName}
                                    onChange={(e) => setFullName(e.target.value)}
                                    placeholder="e.g. Rahul Sharma"
                                    autoFocus
                                    className="w-full px-3 py-2 rounded-lg bg-card border border-border text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:border-primary shadow-sm transition"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-1">Email (Login ID) *</label>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="tech@yourshop.com"
                                    className="w-full px-3 py-2 rounded-lg bg-card border border-border text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:border-primary shadow-sm transition"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-1">Password *</label>
                                <div className="relative">
                                    <input
                                        type={showPassword ? "text" : "password"}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="Min 6 characters (or leave empty for auto-generated)"
                                        className="w-full px-3 py-2 pr-10 rounded-lg bg-card border border-border text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:border-primary shadow-sm transition"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                        tabIndex={-1}
                                    >
                                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                                <p className="text-[11px] text-muted-foreground mt-1">
                                    You can set their password now, or leave blank to auto-generate a secure temporary password.
                                </p>
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-1">Role</label>
                                <select
                                    value={role}
                                    onChange={(e) => setRole(e.target.value as "TECHNICIAN" | "OWNER")}
                                    className="w-full px-3 py-2 rounded-lg bg-card border border-border text-foreground text-sm focus:outline-none focus:border-primary shadow-sm"
                                >
                                    <option value="TECHNICIAN">Technician (Can manage tickets, inventory, customers)</option>
                                    <option value="OWNER" disabled>Owner (Shops only support 1 owner)</option>
                                </select>
                            </div>

                            <div className="flex gap-3 pt-3">
                                <button
                                    onClick={onClose}
                                    disabled={loading}
                                    className="flex-1 py-2 rounded-lg bg-muted border border-border shadow-sm text-foreground text-sm hover:bg-muted/80 transition"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleAdd}
                                    disabled={loading || !email.trim() || !fullName.trim()}
                                    className="flex-1 py-2 rounded-lg gradient-primary text-white text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm transition"
                                >
                                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
                                    Create Account
                                </button>
                            </div>
                        </div>
                    </div>
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
    const [showAdd, setShowAdd] = useState(false);
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
        if (!confirm("Deactivate this team member? They will lose access immediately.")) return;
        setDeactivating(memberId);
        try {
            await api.delete(`/team/${memberId}`);
            await load();
        } finally {
            setDeactivating(null);
        }
    };

    const handleReactivate = async (memberId: string) => {
        if (!confirm("Reactivate this team member?")) return;
        try {
            await api.patch(`/team/${memberId}/reactivate`);
            await load();
        } catch {
            alert("Failed to reactivate member");
        }
    };

    const handleDelete = async (memberId: string) => {
        if (!confirm("Permanently delete this team member? This action cannot be undone.")) return;
        try {
            await api.delete(`/team/${memberId}/delete`);
            await load();
        } catch {
            alert("Failed to delete member");
        }
    };

    const activeMembers = members.filter((m) => m.is_active);
    const inactiveMembers = members.filter((m) => !m.is_active);

    return (
        <div className="p-6 max-w-3xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Team Management</h1>
                    <p className="text-muted-foreground font-medium text-sm mt-1">
                        {activeMembers.length} active member{activeMembers.length !== 1 ? "s" : ""}
                        {isOwner && " · Free accounts allow 1 technician (plus shop owner)"}
                    </p>
                </div>
                {isOwner && (
                    <button
                        onClick={() => setShowAdd(true)}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-lg gradient-primary text-white font-medium text-sm hover:opacity-90 shadow-sm transition"
                    >
                        <UserPlus className="w-4 h-4" /> Add Member
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
                    <div className="bg-card border border-border shadow-sm rounded-xl overflow-hidden mb-6">
                        {activeMembers.length === 0 ? (
                            <div className="py-12 text-center text-muted-foreground">
                                <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                                <p className="text-sm">No team members yet</p>
                            </div>
                        ) : (
                            activeMembers.map((member) => (
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
                                        <p className="text-muted-foreground text-xs flex items-center gap-1 mt-0.5 font-mono">
                                            <Mail className="w-3 h-3 font-sans" /> {member.email}
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
                            <p className="text-muted-foreground opacity-80 text-xs uppercase tracking-wide font-semibold mb-2 px-1">Inactive Members</p>
                            <div className="bg-card border border-border shadow-sm rounded-xl overflow-hidden opacity-80">
                                {inactiveMembers.map((member) => (
                                    <div key={member.id} className="flex items-center gap-4 px-5 py-3 border-b border-border last:border-0 hover:bg-muted/30 transition">
                                        <div className="w-9 h-9 rounded-full bg-muted border border-border flex items-center justify-center flex-shrink-0">
                                            <span className="text-muted-foreground text-sm">{member.full_name.charAt(0)}</span>
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-muted-foreground text-sm line-through">{member.full_name}</p>
                                            <p className="text-muted-foreground opacity-80 text-xs font-mono">{member.email}</p>
                                        </div>
                                        {/* Action buttons */}
                                        {isOwner && member.role !== "OWNER" && (
                                            <div className="flex gap-2">
                                                {/* Reactivate button */}
                                                <button
                                                    onClick={() => handleReactivate(member.id)}
                                                    className="p-2 rounded-lg text-success hover:bg-success/20 transition"
                                                    title="Reactivate member"
                                                >
                                                    <CheckCircle className="w-4 h-4" />
                                                </button>
                                                {/* Delete button */}
                                                <button
                                                    onClick={() => handleDelete(member.id)}
                                                    className="p-2 rounded-lg text-danger hover:bg-danger/20 transition"
                                                    title="Delete member permanently"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        )}
                                        <span className="text-xs text-muted-foreground bg-muted border border-border px-2 py-0.5 rounded-full">Inactive</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </>
            )}

            {showAdd && (
                <AddMemberModal onClose={() => setShowAdd(false)} onSuccess={load} />
            )}
        </div>
    );
}
