"use client";

import { useEffect, useRef, useState } from "react";
import {
    Store, Phone, Mail, MapPin, Hash, Save, Loader2, CheckCircle,
    Camera, User, Building2, Receipt, ShieldCheck, KeyRound,
} from "lucide-react";
import { api } from "@/lib/api/client";
import { useAuthStore } from "@/store/authStore";
import imageCompression from "browser-image-compression";

interface ShopData {
    name: string;
    phone: string;
    email: string;
    address: string;
    pincode: string;
    gst_number: string;
    plan: string;
    logo_data: string | null;
    created_at: string;
}

function ImageUploadCircle({
    current,
    label,
    fallbackIcon: FallbackIcon,
    onChange,
    size = 24,
}: {
    current: string | null;
    label: string;
    fallbackIcon: React.ElementType;
    onChange: (base64: string) => void;
    size?: number;
}) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [preview, setPreview] = useState<string | null>(current);

    useEffect(() => setPreview(current), [current]);

    const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        let file = e.target.files?.[0];
        if (!file) return;

        // Compress image before loading it as Base64
        try {
            const options = {
                maxSizeMB: 0.5,
                maxWidthOrHeight: 800,
                useWebWorker: true,
            };
            file = await imageCompression(file, options);
        } catch (err) {
            console.error("Image compression failed:", err);
        }

        const reader = new FileReader();
        reader.onload = () => {
            const data = reader.result as string;
            setPreview(data);
            onChange(data);
        };
        reader.readAsDataURL(file);
    };

    return (
        <div className="flex flex-col items-center gap-2">
            <div
                className="relative cursor-pointer group"
                onClick={() => inputRef.current?.click()}
                style={{ width: size, height: size }}
            >
                <div
                    className="w-full h-full rounded-full bg-muted border-2 border-border group-hover:border-primary flex items-center justify-center overflow-hidden transition-all"
                    style={{ width: size, height: size }}
                >
                    {preview ? (
                        <img src={preview} alt={label} className="w-full h-full object-cover" />
                    ) : (
                        <FallbackIcon className="text-muted-foreground" style={{ width: size * 0.4, height: size * 0.4 }} />
                    )}
                </div>
                <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Camera className="text-foreground" style={{ width: size * 0.3, height: size * 0.3 }} />
                </div>
            </div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
        </div>
    );
}

function Field({
    label, icon: Icon, value, onChange, type = "text", placeholder, disabled,
}: {
    label: string; icon: React.ElementType; value: string; onChange: (v: string) => void;
    type?: string; placeholder?: string; disabled?: boolean;
}) {
    return (
        <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">{label}</label>
            <div className="relative">
                <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                    type={type}
                    value={value || ""}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder}
                    disabled={disabled}
                    className="w-full pl-9 pr-4 py-2.5 rounded-lg bg-card border border-border text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:border-primary disabled:opacity-40 disabled:cursor-not-allowed shadow-sm transition"
                />
            </div>
        </div>
    );
}

function SaveButton({ saving, saved, disabled, onClick }: { saving: boolean; saved: boolean; disabled?: boolean; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            disabled={saving || disabled}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg gradient-primary text-white font-medium text-sm disabled:opacity-40 transition"
        >
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> :
                saved ? <><CheckCircle className="w-4 h-4 text-emerald-300" /> Saved!</> :
                    <><Save className="w-4 h-4" /> Save Changes</>}
        </button>
    );
}

export default function ShopSettingsPage() {
    const { user, setUser } = useAuthStore();
    const isOwner = user?.role === "OWNER";

    // Shop state
    const [shop, setShop] = useState<ShopData>({
        name: "", phone: "", email: "", address: "", pincode: "",
        gst_number: "", plan: "", logo_data: null, created_at: "",
    });
    const [logoData, setLogoData] = useState<string | null>(null);
    const [shopSaving, setShopSaving] = useState(false);
    const [shopSaved, setShopSaved] = useState(false);
    const [shopError, setShopError] = useState<string | null>(null);

    // Personal account state
    const [fullName, setFullName] = useState(user?.full_name || "");
    const [avatarData, setAvatarData] = useState<string | null>(null);
    const [acctSaving, setAcctSaving] = useState(false);
    const [acctSaved, setAcctSaved] = useState(false);
    const [acctError, setAcctError] = useState<string | null>(null);

    // Change password state
    const [currentPwd, setCurrentPwd] = useState("");
    const [newPwd, setNewPwd] = useState("");
    const [confirmPwd, setConfirmPwd] = useState("");
    const [pwdSaving, setPwdSaving] = useState(false);
    const [pwdSuccess, setPwdSuccess] = useState(false);
    const [pwdError, setPwdError] = useState<string | null>(null);
    const pwdMatch = newPwd === confirmPwd && newPwd.length >= 6;

    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.get("/shops/me").then(({ data }) => {
            setShop(data);
            setLogoData(data.logo_data || null);
        }).finally(() => setLoading(false));
        setFullName(user?.full_name || "");
        setAvatarData(user?.avatar_data || null);
    }, [user]);

    const handleShopSave = async () => {
        setShopSaving(true);
        setShopError(null);
        setShopSaved(false);
        try {
            await api.patch("/shops/me", {
                name: shop.name,
                phone: shop.phone || null,
                email: shop.email || null,
                address: shop.address || null,
                pincode: shop.pincode || null,
                gst_number: shop.gst_number || null,
                logo_data: logoData,
            });
            setShopSaved(true);
            setTimeout(() => setShopSaved(false), 3000);
        } catch (e: unknown) {
            const err = e as { response?: { data?: { detail?: string } } };
            setShopError(err.response?.data?.detail || "Failed to save.");
        } finally {
            setShopSaving(false);
        }
    };

    const handleAcctSave = async () => {
        setAcctSaving(true);
        setAcctError(null);
        setAcctSaved(false);
        try {
            await api.patch("/users/me", { full_name: fullName, avatar_data: avatarData });
            if (user) setUser({ ...user, full_name: fullName, avatar_data: avatarData ?? undefined });
            setAcctSaved(true);
            setTimeout(() => setAcctSaved(false), 3000);
        } catch (e: unknown) {
            const err = e as { response?: { data?: { detail?: string } } };
            setAcctError(err.response?.data?.detail || "Failed to save.");
        } finally {
            setAcctSaving(false);
        }
    };

    return (
        <div className="p-6 max-w-2xl mx-auto space-y-6">
            {/* Page header */}
            <div>
                <h1 className="text-2xl font-bold text-foreground">Settings</h1>
                <p className="text-muted-foreground text-sm mt-1">Manage your shop profile and personal account</p>
            </div>

            {/* ── Plan badge ── */}
            <div className="bg-card border border-border shadow-sm rounded-xl p-4 flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-primary/10 border border-primary/20">
                    <ShieldCheck className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1">
                    <p className="text-foreground text-sm font-medium">{shop.name || "Your Shop"}</p>
                    <p className="text-muted-foreground text-xs mt-0.5">
                        Plan: <span className="text-primary font-semibold capitalize">{shop.plan}</span>
                        {shop.created_at && <span className="ml-3 text-muted-foreground opacity-80">Since {new Date(shop.created_at).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</span>}
                    </p>
                </div>
            </div>

            {loading ? (
                <div className="bg-card border border-border shadow-sm rounded-xl p-6 space-y-4 animate-pulse">
                    {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-10 bg-muted rounded-lg" />)}
                </div>
            ) : (
                <>
                    {/* ── Shop Profile ── */}
                    <div className="bg-card border border-border shadow-sm rounded-xl p-6 space-y-5">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Building2 className="w-4 h-4 text-muted-foreground" />
                                <h2 className="text-sm font-semibold text-foreground">Shop Profile</h2>
                            </div>
                            {isOwner && (
                                <SaveButton saving={shopSaving} saved={shopSaved} onClick={handleShopSave} />
                            )}
                        </div>

                        {shopError && (
                            <div className="px-3 py-2 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm">{shopError}</div>
                        )}

                        {/* Logo */}
                        <div className="flex items-center gap-5 pb-4 border-b border-border">
                            <ImageUploadCircle
                                current={logoData}
                                label="Shop Logo"
                                fallbackIcon={Store}
                                onChange={setLogoData}
                                size={80}
                            />
                            <div>
                                <p className="text-foreground font-semibold">{shop.name}</p>
                                <p className="text-muted-foreground text-xs mt-0.5">Click the logo to change it</p>
                            </div>
                        </div>

                        {/* Fields */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Field label="Shop Name" icon={Store} value={shop.name} onChange={(v) => setShop(s => ({ ...s, name: v }))} placeholder="e.g. FixIt Repairs" disabled={!isOwner} />
                            <Field label="Phone Number" icon={Phone} value={shop.phone} onChange={(v) => setShop(s => ({ ...s, phone: v }))} type="tel" placeholder="+91 9000000000" disabled={!isOwner} />
                            <Field label="Email Address" icon={Mail} value={shop.email} onChange={(v) => setShop(s => ({ ...s, email: v }))} type="email" placeholder="shop@example.com" disabled={!isOwner} />
                            <Field label="GST Number" icon={Receipt} value={shop.gst_number} onChange={(v) => setShop(s => ({ ...s, gst_number: v }))} placeholder="22AAAAA0000A1Z5" disabled={!isOwner} />
                        </div>

                        {/* Address full-width */}
                        <Field label="Address" icon={MapPin} value={shop.address} onChange={(v) => setShop(s => ({ ...s, address: v }))} placeholder="Shop address, street, city" disabled={!isOwner} />
                        <Field label="Pincode" icon={Hash} value={shop.pincode} onChange={(v) => setShop(s => ({ ...s, pincode: v }))} placeholder="400001" disabled={!isOwner} />

                        {!isOwner && (
                            <p className="text-muted-foreground opacity-80 text-xs text-center">Only the shop owner can edit these settings.</p>
                        )}
                    </div>

                    {/* ── Personal Account ── */}
                    <div className="bg-card border border-border shadow-sm rounded-xl p-6 space-y-5">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <User className="w-4 h-4 text-muted-foreground" />
                                <h2 className="text-sm font-semibold text-foreground">My Account</h2>
                            </div>
                            <SaveButton saving={acctSaving} saved={acctSaved} onClick={handleAcctSave} />
                        </div>

                        {acctError && (
                            <div className="px-3 py-2 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm">{acctError}</div>
                        )}

                        {/* Avatar */}
                        <div className="flex items-center gap-5 pb-4 border-b border-border">
                            <ImageUploadCircle
                                current={avatarData}
                                label="Profile Picture"
                                fallbackIcon={User}
                                onChange={setAvatarData}
                                size={80}
                            />
                            <div>
                                <p className="text-foreground font-semibold">{fullName || user?.full_name}</p>
                                <p className="text-muted-foreground text-xs mt-0.5">{user?.email}</p>
                                <span className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted border border-border text-muted-foreground text-xs capitalize">
                                    {user?.role?.toLowerCase()}
                                </span>
                            </div>
                        </div>

                        <Field label="Display Name" icon={User} value={fullName} onChange={setFullName} placeholder="Your full name" />

                        <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Email Address</label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground opacity-70" />
                                <input
                                    type="email"
                                    value={user?.email || ""}
                                    disabled
                                    className="w-full pl-9 pr-4 py-2.5 rounded-lg bg-muted border border-border text-muted-foreground text-sm opacity-60 cursor-not-allowed"
                                />
                            </div>
                            <p className="text-muted-foreground opacity-80 text-xs mt-1">Email cannot be changed from here.</p>
                        </div>
                    </div>
                </>
            )}

            {/* ── Change Password ── */}
            <div className="bg-card border border-border shadow-sm rounded-xl p-6 space-y-5">
                <div className="flex items-center gap-2 pb-4 border-b border-border">
                    <div className="p-2 rounded-lg bg-accent/10 border border-accent/20">
                        <KeyRound className="w-4 h-4 text-accent" />
                    </div>
                    <div>
                        <h2 className="text-sm font-semibold text-foreground">Change Password</h2>
                        <p className="text-xs text-muted-foreground mt-0.5">Update your account password</p>
                    </div>
                </div>

                {pwdError && <div className="px-3 py-2 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm">{pwdError}</div>}
                {pwdSuccess && (
                    <div className="px-3 py-2 rounded-lg bg-success/10 border border-success/20 text-success text-sm flex items-center gap-2">
                        <CheckCircle size={14} /> Password changed successfully!
                    </div>
                )}

                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1.5">Current Password</label>
                        <div className="relative">
                            <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <input type="password" value={currentPwd} onChange={e => setCurrentPwd(e.target.value)}
                                placeholder="Your current password"
                                className="w-full pl-9 pr-4 py-2.5 rounded-lg bg-card border border-border text-foreground text-sm focus:outline-none focus:border-primary shadow-sm transition"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1.5">New Password <span className="text-muted-foreground font-normal">(min 6 chars)</span></label>
                        <div className="relative">
                            <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)}
                                placeholder="New password"
                                className="w-full pl-9 pr-4 py-2.5 rounded-lg bg-card border border-border text-foreground text-sm focus:outline-none focus:border-primary shadow-sm transition"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1.5">Confirm New Password</label>
                        <div className="relative">
                            <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <input type="password" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)}
                                placeholder="Confirm new password"
                                className={`w-full pl-9 pr-4 py-2.5 rounded-lg bg-card border text-foreground text-sm focus:outline-none transition shadow-sm ${confirmPwd && !pwdMatch ? 'border-danger/60' : 'border-border focus:border-primary'}`}
                            />
                        </div>
                        {confirmPwd && newPwd !== confirmPwd && (
                            <p className="text-danger text-xs mt-1">Passwords do not match</p>
                        )}
                    </div>
                </div>

                <div className="pt-2 border-t border-border">
                    <button
                        onClick={async () => {
                            if (!pwdMatch || !currentPwd) return;
                            setPwdSaving(true); setPwdError(null); setPwdSuccess(false);
                            try {
                                await api.post("/users/me/change-password", {
                                    current_password: currentPwd,
                                    new_password: newPwd,
                                });
                                setPwdSuccess(true);
                                setCurrentPwd(""); setNewPwd(""); setConfirmPwd("");
                                setTimeout(() => setPwdSuccess(false), 4000);
                            } catch (e: unknown) {
                                const err = e as { response?: { data?: { detail?: string } } };
                                setPwdError(err?.response?.data?.detail || "Failed to change password.");
                            } finally { setPwdSaving(false); }
                        }}
                        disabled={!pwdMatch || !currentPwd || pwdSaving}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-lg gradient-primary text-white font-medium text-sm disabled:opacity-40 transition"
                    >
                        {pwdSaving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : <><KeyRound className="w-4 h-4" /> Change Password</>}
                    </button>
                </div>
            </div>

            {/* ── Data & Privacy ── */}
            {isOwner && (
                <div className="bg-card border border-border shadow-sm rounded-xl p-6 space-y-5">
                    <div className="flex items-center gap-2 pb-4 border-b border-border">
                        <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
                            <Save className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                            <h2 className="text-sm font-semibold text-foreground">Data & Privacy</h2>
                            <p className="text-xs text-muted-foreground mt-0.5">Manage your shop's data</p>
                        </div>
                    </div>

                    <div>
                        <h3 className="text-sm font-medium text-foreground mb-1">Export Shop Data</h3>
                        <p className="text-sm text-muted-foreground mb-4">
                            Download a complete JSON export of all your shop data, including customers, tickets, inventory, invoices, and users.
                        </p>

                        <button
                            onClick={async () => {
                                try {
                                    const btn = document.getElementById("export-btn");
                                    if (btn) btn.innerHTML = `<svg class="animate-spin w-4 h-4 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Exporting...`;
                                    if (btn) btn.setAttribute("disabled", "true");

                                    const res = await api.get("/shops/export", { responseType: 'blob' });
                                    const url = window.URL.createObjectURL(new Blob([res.data]));
                                    const link = document.createElement('a');
                                    link.href = url;
                                    const date = new Date().toISOString().split('T')[0];
                                    link.setAttribute('download', `repairdesk-export-${date}.json`);
                                    document.body.appendChild(link);
                                    link.click();
                                    link.parentNode?.removeChild(link);
                                } catch (err) {
                                    console.error("Export failed:", err);
                                    alert("Failed to export data. Please try again.");
                                } finally {
                                    const btn = document.getElementById("export-btn");
                                    if (btn) {
                                        btn.removeAttribute("disabled");
                                        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-save w-4 h-4"><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/></svg> Export My Data`;
                                    }
                                }
                            }}
                            id="export-btn"
                            className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-border bg-card text-foreground font-medium text-sm hover:bg-muted transition shadow-sm disabled:opacity-50"
                        >
                            <Save className="w-4 h-4" /> Export My Data
                        </button>
                    </div>
                </div>
            )}

        </div>
    );
}
