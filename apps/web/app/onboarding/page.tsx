"use client";
// This page renders OUTSIDE AppShell (no sidebar) — it lives in app/onboarding/

import { useState, useRef, useCallback, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { api, getErrorMessage } from "@/lib/api/client";
import { compressImage } from "@/lib/utils/imageCompress";
import {
    Wrench, MapPin, Hash, Store, Camera,
    User, ChevronRight, Check, Loader2, Upload, X, IndianRupee
} from "lucide-react";
import clsx from "clsx";

const CURRENCIES = [
    { code: "INR", symbol: "₹", label: "Indian Rupee (₹)" },
    { code: "USD", symbol: "$", label: "US Dollar ($)" },
    { code: "AED", symbol: "د.إ", label: "UAE Dirham (د.إ)" },
    { code: "EUR", symbol: "€", label: "Euro (€)" },
    { code: "GBP", symbol: "£", label: "British Pound (£)" },
    { code: "AUD", symbol: "A$", label: "Australian Dollar (A$)" },
    { code: "CAD", symbol: "C$", label: "Canadian Dollar (C$)" },
    { code: "SGD", symbol: "S$", label: "Singapore Dollar (S$)" },
];

function FieldError({ msg }: { msg?: string }) {
    if (!msg) return null;
    return <p className="text-red-400 text-xs mt-1">{msg}</p>;
}

function PhotoPicker({
    label,
    value,
    onChange,
    allowCamera = false,
}: {
    label: string;
    value: string | null;
    onChange: (v: string) => void;
    allowCamera?: boolean;
}) {
    const fileRef = useRef<HTMLInputElement>(null);
    const camRef = useRef<HTMLInputElement>(null);

    const handle = useCallback(async (file: File | null | undefined) => {
        if (!file) return;
        const compressed = await compressImage(file, 50);
        onChange(compressed);
    }, [onChange]);

    return (
        <div>
            <label className="block text-sm font-medium text-foreground/90 mb-2">{label}</label>
            <div className="flex items-center gap-3">
                {value ? (
                    <div className="relative w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 border border-border">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={value} alt="preview" className="w-full h-full object-cover" />
                        <button type="button" onClick={() => onChange("")}
                            className="absolute top-0.5 right-0.5 bg-black/60 rounded-full p-0.5">
                            <X className="w-3 h-3 text-white" />
                        </button>
                    </div>
                ) : (
                    <div className="w-16 h-16 rounded-xl border-2 border-dashed border-border flex items-center justify-center flex-shrink-0">
                        <User className="w-6 h-6 text-muted-foreground" />
                    </div>
                )}
                <div className="flex gap-2 flex-wrap">
                    <button type="button" onClick={() => fileRef.current?.click()}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted border border-border text-foreground/90 text-xs hover:bg-muted/80 transition">
                        <Upload className="w-3.5 h-3.5" /> Gallery
                    </button>
                    {allowCamera && (
                        <button type="button" onClick={() => camRef.current?.click()}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted border border-border text-foreground/90 text-xs hover:bg-muted/80 transition">
                            <Camera className="w-3.5 h-3.5" /> Camera
                        </button>
                    )}
                </div>
                <input ref={fileRef} type="file" accept="image/*" className="hidden"
                    onChange={e => handle(e.target.files?.[0])} />
                <input ref={camRef} type="file" accept="image/*" capture="user" className="hidden"
                    onChange={e => handle(e.target.files?.[0])} />
            </div>
        </div>
    );
}

function OnboardingForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const fromParam = searchParams.get("from");
    const { user } = useAuthStore();

    const [shopName, setShopName] = useState("");
    const [address, setAddress] = useState("");
    const [pincode, setPincode] = useState("");
    const [gst, setGst] = useState("");
    const [currency, setCurrency] = useState("INR");
    const [shopPic, setShopPic] = useState<string | null>(null);
    const [ownerPic, setOwnerPic] = useState<string | null>(null);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);
    const [serverError, setServerError] = useState<string | null>(null);
    // Pre-fill shop name from API on first render
    useEffect(() => {
        api.get("/shops/me").then(r => {
            if (r.data?.name) setShopName(r.data.name);
            if (r.data?.currency) setCurrency(r.data.currency);
        }).catch(() => { });
    }, []);

    function validate() {
        const e: Record<string, string> = {};
        if (!shopName.trim()) e.shopName = "Shop name is required";
        if (!address.trim()) e.address = "Address is required";
        if (!pincode.trim()) e.pincode = "Pincode is required";
        else if (!/^\d{6}$/.test(pincode)) e.pincode = "Enter a valid 6-digit pincode";
        if (gst && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gst))
            e.gst = "Enter a valid GST number or leave blank";
        setErrors(e);
        return Object.keys(e).length === 0;
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validate()) return;
        setSaving(true);
        setServerError(null);
        try {
            await Promise.all([
                api.patch("/shops/me", {
                    name: shopName.trim(),
                    address: address.trim(),
                    pincode: pincode.trim(),
                    gst_number: gst.trim().toUpperCase() || null,
                    logo_data: shopPic || null,
                    currency: currency,
                    currency_symbol: CURRENCIES.find(c => c.code === currency)?.symbol || "₹",
                }),
                ownerPic ? api.patch("/users/me", { avatar_data: ownerPic }) : Promise.resolve(),
            ]);
            router.push("/dashboard");
        } catch (err: unknown) {
            setServerError(getErrorMessage(err, "Could not save. Please try again."));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl" />
                <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-violet-600/15 rounded-full blur-3xl" />
            </div>

            <div className="relative w-full max-w-lg">
                <div className="flex items-center gap-3 mb-8 justify-center">
                    <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center">
                        <Wrench className="w-5 h-5 text-white" />
                    </div>
                    <span className="text-2xl font-bold text-foreground">RepairDesk</span>
                </div>

                {/* Stepper */}
                <div className="flex items-center gap-2 mb-6 justify-center">
                    {["Account", "Shop Profile", "Done"].map((step, i) => (
                        <div key={step} className="flex items-center gap-2">
                            <div className={clsx(
                                "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border",
                                i === 1 ? "bg-primary border-primary text-white"
                                    : i === 0 ? "bg-success/20 border-success/40 text-success"
                                        : "bg-muted border-border text-muted-foreground"
                            )}>
                                {i === 0 ? <Check className="w-3.5 h-3.5" /> : i + 1}
                            </div>
                            <span className={clsx("text-xs hidden sm:block", i === 1 ? "text-foreground font-medium" : "text-muted-foreground")}>
                                {step}
                            </span>
                            {i < 2 && <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                        </div>
                    ))}
                </div>

                <div className="glass rounded-2xl p-7 shadow-2xl">
                    <h1 className="text-xl font-bold text-foreground mb-1">Set up your shop profile</h1>
                    <p className="text-muted-foreground text-sm mb-6">
                        Help customers and your team recognise your shop.
                    </p>

                    {serverError && (
                        <div className="mb-4 p-3 rounded-lg bg-red-900/40 border border-red-800 text-red-300 text-sm">
                            {serverError}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div>
                            <label className="block text-sm font-medium text-foreground/90 mb-1">
                                <Store className="w-3.5 h-3.5 text-muted-foreground inline mr-1.5" />Shop Name
                            </label>
                            <input value={shopName} onChange={e => setShopName(e.target.value)}
                                placeholder="e.g. Quick Fix Electronics"
                                className="w-full px-4 py-2.5 rounded-lg bg-muted border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:border-indigo-500 text-sm" />
                            <FieldError msg={errors.shopName} />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-foreground/90 mb-1">
                                <MapPin className="w-3.5 h-3.5 text-muted-foreground inline mr-1.5" />Shop Address
                            </label>
                            <input value={address} onChange={e => setAddress(e.target.value)}
                                placeholder="Shop No. 5, MG Road, Bengaluru"
                                className="w-full px-4 py-2.5 rounded-lg bg-muted border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:border-indigo-500 text-sm" />
                            <FieldError msg={errors.address} />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-foreground/90 mb-1">
                                    <Hash className="w-3.5 h-3.5 text-muted-foreground inline mr-1.5" />Pincode
                                </label>
                                <input value={pincode} onChange={e => setPincode(e.target.value)}
                                    placeholder="560001" maxLength={6}
                                    className="w-full px-4 py-2.5 rounded-lg bg-muted border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:border-indigo-500 text-sm" />
                                <FieldError msg={errors.pincode} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-foreground/90 mb-1">
                                    GST <span className="text-muted-foreground font-normal">(optional)</span>
                                </label>
                                <input value={gst} onChange={e => setGst(e.target.value.toUpperCase())}
                                    placeholder="29XXXXX1234X1ZX"
                                    className="w-full px-4 py-2.5 rounded-lg bg-muted border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:border-indigo-500 text-sm uppercase" />
                                <FieldError msg={errors.gst} />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-foreground/90 mb-1">
                                <IndianRupee className="w-3.5 h-3.5 text-muted-foreground inline mr-1.5" />Default Currency
                            </label>
                            <select value={currency} onChange={e => setCurrency(e.target.value)}
                                className="w-full px-4 py-2.5 rounded-lg bg-muted border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:border-indigo-500 text-sm">
                                {CURRENCIES.map(c => (
                                    <option key={c.code} value={c.code}>{c.label}</option>
                                ))}
                            </select>
                        </div>

                        <div className="border-t border-border pt-5 space-y-4">
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Photos (optional — compressed to &lt;50 KB)</p>
                            <PhotoPicker label="Shop Photo" value={shopPic} onChange={v => setShopPic(v || null)} />
                            <PhotoPicker label="Your Photo" value={ownerPic} onChange={v => setOwnerPic(v || null)} allowCamera />
                        </div>

                        <button type="submit" disabled={saving}
                            className="w-full py-3 rounded-lg gradient-primary text-white font-semibold hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2 mt-2">
                            {saving
                                ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
                                : <>Complete Setup <ChevronRight className="w-4 h-4" /></>
                            }
                        </button>

                        {fromParam ? (
                            <button type="button" onClick={() => router.push("/dashboard")}
                                className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition mt-4">
                                Cancel (Go to Dashboard)
                            </button>
                        ) : (
                            <button type="button" onClick={() => {
                                localStorage.setItem("repairdesk_skip_onboarding", "true");
                                router.push("/dashboard");
                            }}
                                className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition mt-4">
                                Skip for now
                            </button>
                        )}
                    </form>
                </div>
            </div>
        </div>
    );
}

export default function OnboardingPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-background" />}>
            <OnboardingForm />
        </Suspense>
    );
}
