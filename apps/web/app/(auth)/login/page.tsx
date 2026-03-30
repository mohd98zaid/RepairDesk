"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Wrench, Eye, EyeOff, Loader2, MonitorSmartphone, ShieldAlert, RotateCcw, LogIn, ShieldX } from "lucide-react";
import { api, getErrorMessage } from "@/lib/api/client";
import { useAuthStore } from "@/store/authStore";
import type { AuthUser } from "@/types";

const schema = z.object({
    email: z.string().email("Enter a valid email"),
    password: z.string().min(1, "Password is required"),
});

type FormData = z.infer<typeof schema>;
type PageState = "idle" | "device_limit" | "otp_sent";

export default function LoginPage() {
    const router = useRouter();
    const setAuth = useAuthStore((s) => s.setAuth);
    const [showPassword, setShowPassword] = useState(false);
    const [serverError, setServerError] = useState<string | null>(null);
    const [pageState, setPageState] = useState<PageState>("idle");
    const [otpSending, setOtpSending] = useState(false);
    const [otp, setOtp] = useState("");
    const [otpError, setOtpError] = useState<string | null>(null);
    const [otpLoading, setOtpLoading] = useState(false);
    const [deviceLimitMsg, setDeviceLimitMsg] = useState<string>("");
    const [ejectionBanner, setEjectionBanner] = useState(false);

    // Check if we arrived here after a remote session kill
    useEffect(() => {
        const reason = sessionStorage.getItem('auth_redirect_reason');
        if (reason === 'session_ejected') {
            setEjectionBanner(true);
            sessionStorage.removeItem('auth_redirect_reason');
        }
    }, []);

    // Hold credentials from the blocked login attempt
    const savedCreds = useRef<{ email: string; password: string } | null>(null);

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<FormData>({ resolver: zodResolver(schema) });

    const onSubmit = async (data: FormData) => {
        setServerError(null);
        try {
            const res = await api.post("/auth/login", data);
            const { access_token, user } = res.data;
            setAuth(user as AuthUser, access_token);
            router.push("/dashboard");
        } catch (err: unknown) {
            const e = err as { response?: { status?: number; data?: { detail?: string } } };
            if (e.response?.status === 401) {
                setServerError("Invalid email or password. Please try again.");
            } else if (e.response?.status === 403) {
                const detail = e.response?.data?.detail ?? "";
                if (detail.toLowerCase().includes("device limit")) {
                    savedCreds.current = { email: data.email, password: data.password };
                    setDeviceLimitMsg(detail);
                    setPageState("device_limit");
                } else {
                    setServerError(detail || "Access denied.");
                }
            } else {
                setServerError(getErrorMessage(err, "Login failed. Please try again."));
            }
        }
    };

    const handleSendOtp = async () => {
        if (!savedCreds.current) return;
        setOtpSending(true);
        setOtpError(null);
        try {
            await api.post("/auth/force-logout-otp", { email: savedCreds.current.email });
            setPageState("otp_sent");
        } catch (err: unknown) {
            setOtpError(getErrorMessage(err, "Failed to send OTP. Please try again."));
        } finally {
            setOtpSending(false);
        }
    };

    const handleVerifyOtp = async () => {
        if (!savedCreds.current || !otp.trim()) return;
        setOtpLoading(true);
        setOtpError(null);
        try {
            const res = await api.post("/auth/force-logout-login", {
                email: savedCreds.current.email,
                password: savedCreds.current.password,
                otp: otp.trim(),
            });
            const { access_token, user } = res.data;
            setAuth(user as AuthUser, access_token);
            router.push("/dashboard");
        } catch (err: unknown) {
            const e = err as { response?: { status?: number; data?: { detail?: string } } };
            setOtpError(e.response?.data?.detail || "Invalid or expired OTP.");
        } finally {
            setOtpLoading(false);
        }
    };

    const handleResendOtp = async () => {
        setOtp("");
        setOtpError(null);
        await handleSendOtp();
    };

    const handleBackToLogin = () => {
        setPageState("idle");
        setServerError(null);
        setOtp("");
        setOtpError(null);
        savedCreds.current = null;
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-background">
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-40 -right-40 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl" />
                <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-violet-600/20 rounded-full blur-3xl" />
            </div>

            <div className="relative w-full max-w-md">
                <div className="flex items-center gap-3 mb-8 justify-center">
                    <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center">
                        <Wrench className="w-5 h-5 text-white" />
                    </div>
                    <span className="text-2xl font-bold text-foreground">RepairDesk</span>
                </div>

                <div className="glass rounded-2xl p-8 shadow-2xl">

                    {/* ── DEVICE LIMIT STATE ── */}
                    {pageState === "device_limit" && (
                        <div>
                            {/* Warning banner */}
                            <div className="flex items-start gap-3 mb-6 p-4 rounded-xl"
                                style={{ background: "rgba(251,146,60,0.1)", border: "1px solid rgba(251,146,60,0.35)" }}>
                                <MonitorSmartphone className="w-5 h-5 mt-0.5 shrink-0" style={{ color: "#fb923c" }} />
                                <div>
                                    <p className="text-sm font-semibold mb-1" style={{ color: "#fb923c" }}>
                                        Device Limit Reached
                                    </p>
                                    <p className="text-xs leading-relaxed" style={{ color: "#fdba74" }}>
                                        {deviceLimitMsg}
                                    </p>
                                </div>
                            </div>

                            <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
                                You can force-logout all other active sessions. We'll send a one-time code to{" "}
                                <strong className="text-foreground">{savedCreds.current?.email}</strong> to confirm.
                            </p>

                            {otpError && (
                                <div className="mb-4 p-3 rounded-lg text-sm"
                                    style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171" }}>
                                    {otpError}
                                </div>
                            )}

                            <button
                                onClick={handleSendOtp}
                                disabled={otpSending}
                                className="w-full py-3 rounded-lg text-white font-semibold hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2 mb-3"
                                style={{ background: "linear-gradient(135deg, #f97316, #ea580c)" }}
                                id="force-logout-send-otp"
                            >
                                {otpSending
                                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending OTP…</>
                                    : <><ShieldAlert className="w-4 h-4" /> Force Logout Other Devices</>
                                }
                            </button>

                            <button
                                onClick={handleBackToLogin}
                                className="w-full py-2.5 rounded-lg text-sm text-muted-foreground hover:text-foreground transition"
                                style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.08)" }}
                            >
                                ← Back to Login
                            </button>
                        </div>
                    )}

                    {/* ── OTP INPUT STATE ── */}
                    {pageState === "otp_sent" && (
                        <div>
                            <div className="flex items-center gap-3 mb-2">
                                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                                    style={{ background: "rgba(251,146,60,0.15)", border: "1px solid rgba(251,146,60,0.3)" }}>
                                    <ShieldAlert className="w-5 h-5" style={{ color: "#fb923c" }} />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-foreground">Check your Gmail</h2>
                                    <p className="text-xs text-muted-foreground">Code sent to {savedCreds.current?.email}</p>
                                </div>
                            </div>

                            <p className="text-sm text-muted-foreground mb-6 mt-4 leading-relaxed">
                                Enter the 6-digit code we emailed you. This will sign you in and{" "}
                                <strong className="text-foreground">immediately log out all other active devices</strong>.
                            </p>

                            {otpError && (
                                <div className="mb-4 p-3 rounded-lg text-sm"
                                    style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171" }}>
                                    {otpError}
                                </div>
                            )}

                            {/* OTP digit input */}
                            <label className="block text-sm font-medium text-foreground/90 mb-2">
                                One-Time Code
                            </label>
                            <input
                                type="text"
                                inputMode="numeric"
                                maxLength={6}
                                value={otp}
                                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                                placeholder="000000"
                                id="force-logout-otp-input"
                                className="w-full px-4 py-3 rounded-lg border text-foreground placeholder-muted-foreground focus:outline-none transition mb-4"
                                style={{
                                    background: "rgba(255,255,255,0.05)",
                                    border: `1px solid ${otp.length === 6 ? "rgba(251,146,60,0.5)" : "rgba(255,255,255,0.12)"}`,
                                    fontSize: 24,
                                    letterSpacing: "0.3em",
                                    textAlign: "center",
                                    fontVariantNumeric: "tabular-nums",
                                }}
                                onKeyDown={(e) => { if (e.key === "Enter" && otp.length === 6) handleVerifyOtp(); }}
                            />

                            <button
                                onClick={handleVerifyOtp}
                                disabled={otp.length !== 6 || otpLoading}
                                className="w-full py-3 rounded-lg text-white font-semibold hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2 mb-3"
                                style={{ background: otp.length === 6 ? "linear-gradient(135deg, #f97316, #ea580c)" : "rgba(251,146,60,0.2)" }}
                                id="force-logout-verify-btn"
                            >
                                {otpLoading
                                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Verifying…</>
                                    : <><LogIn className="w-4 h-4" /> Verify & Sign In</>
                                }
                            </button>

                            <div className="flex items-center justify-between">
                                <button
                                    onClick={handleBackToLogin}
                                    className="text-xs text-muted-foreground hover:text-foreground transition"
                                >
                                    ← Back to Login
                                </button>
                                <button
                                    onClick={handleResendOtp}
                                    disabled={otpSending}
                                    className="text-xs flex items-center gap-1 transition"
                                    style={{ color: "#fb923c" }}
                                >
                                    {otpSending
                                        ? <><Loader2 className="w-3 h-3 animate-spin" /> Sending…</>
                                        : <><RotateCcw className="w-3 h-3" /> Resend Code</>
                                    }
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ── NORMAL LOGIN STATE ── */}
                    {pageState === "idle" && (
                        <>
                            <h1 className="text-2xl font-bold text-foreground mb-2">Welcome back</h1>
                            <p className="text-muted-foreground text-sm mb-6">Sign in to your shop account</p>

                            {/* Session ejection banner */}
                            {ejectionBanner && (
                                <div className="mb-4 p-3 rounded-xl flex items-start gap-3"
                                    style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
                                    <ShieldX className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#f87171' }} />
                                    <div>
                                        <p className="text-sm font-semibold" style={{ color: '#f87171' }}>Session Terminated</p>
                                        <p className="text-xs mt-0.5" style={{ color: '#fca5a5' }}>You were signed out remotely. Sign in again to continue.</p>
                                    </div>
                                    <button onClick={() => setEjectionBanner(false)} className="ml-auto text-muted-foreground hover:text-foreground text-lg leading-none">×</button>
                                </div>
                            )}

                            {serverError && (
                                <div className="mb-4 p-3 rounded-lg bg-red-900/40 border border-red-800 text-red-300 text-sm">
                                    {serverError}
                                </div>
                            )}

                            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-foreground/90 mb-1">Email</label>
                                    <input
                                        {...register("email")}
                                        type="email"
                                        id="email"
                                        placeholder="you@example.com"
                                        className="w-full px-4 py-2.5 rounded-lg bg-muted border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                                    />
                                    {errors.email && (
                                        <p className="text-red-400 text-xs mt-1">{errors.email.message}</p>
                                    )}
                                </div>

                                <div>
                                    <div className="flex items-center justify-between mb-1">
                                        <label className="block text-sm font-medium text-foreground/90">Password</label>
                                        <Link href="/forgot-password" className="text-xs text-indigo-400 hover:text-indigo-300">
                                            Forgot password?
                                        </Link>
                                    </div>
                                    <div className="relative">
                                        <input
                                            {...register("password")}
                                            type={showPassword ? "text" : "password"}
                                            id="password"
                                            placeholder="Your password"
                                            className="w-full px-4 py-2.5 rounded-lg bg-muted border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition pr-10"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword((v) => !v)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                        >
                                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                    {errors.password && (
                                        <p className="text-red-400 text-xs mt-1">{errors.password.message}</p>
                                    )}
                                </div>

                                <button
                                    type="submit"
                                    id="login-submit"
                                    disabled={isSubmitting}
                                    className="w-full py-3 rounded-lg gradient-primary text-white font-semibold hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {isSubmitting ? (
                                        <><Loader2 className="w-4 h-4 animate-spin" /> Signing in...</>
                                    ) : (
                                        "Sign In"
                                    )}
                                </button>
                            </form>

                            <p className="text-center text-sm text-muted-foreground mt-6">
                                Don&apos;t have an account?{" "}
                                <Link href="/register" className="text-indigo-400 hover:text-indigo-300 font-medium">
                                    Create your shop
                                </Link>
                            </p>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
