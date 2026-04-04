"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Wrench, Eye, EyeOff, Loader2, ArrowLeft, Mail, CheckCircle2, Sun, Moon } from "lucide-react";
import { api, getErrorMessage } from "@/lib/api/client";
import { useAuthStore } from "@/store/authStore";
import type { AuthUser } from "@/types";

// SCHEMAS
const emailSchema = z.object({
    email: z.string().email("Enter a valid email").refine(
        (val) => val.toLowerCase().endsWith("@gmail.com"),
        { message: "Only Gmail addresses (@gmail.com) are allowed" }
    ),
});

const otpSchema = z.object({
    otp: z.string().length(6, "OTP must be exactly 6 digits").regex(/^\d+$/, "OTP must be numeric"),
});

const detailsSchema = z.object({
    shop_name: z.string().min(2, "Shop name must be at least 2 characters"),
    full_name: z.string().min(2, "Full name is required"),
    phone: z.string().optional(),
    password: z
        .string()
        .min(8, "Password must be at least 8 characters")
        .regex(/[A-Z]/, "Must contain uppercase")
        .regex(/[0-9]/, "Must contain a number"),
});

type EmailData = z.infer<typeof emailSchema>;
type OtpData = z.infer<typeof otpSchema>;
type DetailsData = z.infer<typeof detailsSchema>;

export default function RegisterPage() {
    const router = useRouter();
    const setAuth = useAuthStore((s: any) => s.setAuth);

    const [step, setStep] = useState<1 | 2 | 3>(1);
    const [email, setEmail] = useState("");
    const [verifiedToken, setVerifiedToken] = useState("");

    const [showPassword, setShowPassword] = useState(false);
    const [serverError, setServerError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    // Dark/light mode
    const [dark, setDark] = useState(true);
    useEffect(() => {
        const saved = localStorage.getItem('theme');
        setDark(saved !== 'light');
        try {
            const bc = new BroadcastChannel('theme');
            bc.onmessage = (e) => {
                const isDark = e.data === 'dark';
                setDark(isDark);
                document.documentElement.classList.toggle('dark', isDark);
                document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
            };
            return () => bc.close();
        } catch { /* ignore */ }
    }, []);

    function toggleTheme() {
        const next = !dark;
        setDark(next);
        localStorage.setItem('theme', next ? 'dark' : 'light');
        document.documentElement.classList.toggle('dark', next);
        document.documentElement.style.colorScheme = next ? 'dark' : 'light';
        try { new BroadcastChannel('theme').postMessage(next ? 'dark' : 'light'); } catch { /* ignore */ }
    }

    // Form: Step 1
    const {
        register: registerEmail,
        handleSubmit: handleSubmitEmail,
        formState: { errors: emailErrors },
    } = useForm<EmailData>({ resolver: zodResolver(emailSchema) });

    // Form: Step 2
    const {
        register: registerOtp,
        handleSubmit: handleSubmitOtp,
        formState: { errors: otpErrors },
    } = useForm<OtpData>({ resolver: zodResolver(otpSchema) });

    // Form: Step 3
    const {
        register: registerDetails,
        handleSubmit: handleSubmitDetails,
        formState: { errors: detailsErrors },
    } = useForm<DetailsData>({ resolver: zodResolver(detailsSchema) });

    // Handlers
    const onSendOtp = async (data: EmailData) => {
        setServerError(null);
        setIsLoading(true);
        try {
            await api.post("/auth/send-otp", { email: data.email });
            setEmail(data.email);
            setStep(2);
        } catch (err: unknown) {
            setServerError(getErrorMessage(err, "Failed to send OTP."));
        } finally {
            setIsLoading(false);
        }
    };

    const onVerifyOtp = async (data: OtpData) => {
        setServerError(null);
        setIsLoading(true);
        try {
            const res = await api.post("/auth/verify-otp", { email, otp: data.otp });
            setVerifiedToken(res.data.verified_token);
            setStep(3);
        } catch (err: unknown) {
            setServerError(getErrorMessage(err, "Invalid or expired OTP."));
        } finally {
            setIsLoading(false);
        }
    };

    const onSubmitDetails = async (data: DetailsData) => {
        setServerError(null);
        setIsLoading(true);
        try {
            const payload = {
                ...data,
                email,
                verified_token: verifiedToken,
            };
            const res = await api.post("/auth/register", payload);
            const { user } = res.data;
            setAuth(user as AuthUser);
            router.push("/onboarding");
        } catch (err: unknown) {
            setServerError(getErrorMessage(err, "Registration failed. Please try again."));
        } finally {
            setIsLoading(false);
        }
    };

    const resendOtp = async () => {
        setServerError(null);
        setIsLoading(true);
        try {
            await api.post("/auth/send-otp", { email });
            setServerError("A new OTP has been sent to your email."); // not really an error
        } catch (err: unknown) {
            setServerError(getErrorMessage(err, "Failed to resend OTP."));
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-background">
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl" />
                <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-violet-600/20 rounded-full blur-3xl" />
            </div>

            {/* Theme toggle button — top right */}
            <button
                onClick={toggleTheme}
                className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-lg bg-muted border border-border text-muted-foreground hover:text-foreground transition z-10"
                title={dark ? 'Switch to Light mode' : 'Switch to Dark mode'}
                id="register-theme-toggle"
            >
                {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <div className="relative w-full max-w-md">
                <div className="flex items-center gap-3 mb-8 justify-center">
                    <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center">
                        <Wrench className="w-5 h-5 text-white" />
                    </div>
                    <span className="text-2xl font-bold text-foreground">RepairDesk</span>
                </div>

                <div className="glass rounded-2xl p-5 sm:p-8 shadow-2xl">
                    {/* Header based on step */}
                    <div className="mb-6">
                        {step === 1 && (
                            <>
                                <h1 className="text-2xl font-bold text-foreground mb-2">Create your shop</h1>
                                <p className="text-muted-foreground text-sm">Start managing repairs with a Gmail account</p>
                            </>
                        )}
                        {step === 2 && (
                            <>
                                <button onClick={() => setStep(1)} className="text-muted-foreground hover:text-foreground mb-4 flex items-center gap-1 text-sm transition">
                                    <ArrowLeft className="w-4 h-4" /> Back to email
                                </button>
                                <h1 className="text-2xl font-bold text-foreground mb-2">Verify your email</h1>
                                <p className="text-muted-foreground text-sm">We sent a 6-digit code to <span className="text-foreground font-medium">{email}</span></p>
                            </>
                        )}
                        {step === 3 && (
                            <>
                                <div className="flex items-center gap-2 text-indigo-400 mb-4 text-sm font-medium">
                                    <CheckCircle2 className="w-4 h-4" /> Email verified ({email})
                                </div>
                                <h1 className="text-2xl font-bold text-foreground mb-2">Shop Details</h1>
                                <p className="text-muted-foreground text-sm">Just a few more details to get started</p>
                            </>
                        )}
                    </div>

                    {serverError && (
                        <div className={`mb-4 p-3 rounded-lg border text-sm ${serverError.includes("sent") ? "bg-green-900/40 border-green-800 text-green-300" : "bg-red-900/40 border-red-800 text-red-300"}`}>
                            {serverError}
                        </div>
                    )}

                    {/* Step 1 Form */}
                    {step === 1 && (
                        <form onSubmit={handleSubmitEmail(onSendOtp)} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-foreground/90 mb-1">
                                    Gmail Address
                                </label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <Mail className="h-5 w-5 text-muted-foreground" />
                                    </div>
                                    <input
                                        {...registerEmail("email")}
                                        type="email"
                                        placeholder="shop@gmail.com"
                                        className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-muted border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                                    />
                                </div>
                                {emailErrors.email && (
                                    <p className="text-red-400 text-xs mt-1">{emailErrors.email.message}</p>
                                )}
                            </div>
                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full py-3 rounded-lg gradient-primary text-white font-semibold hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {isLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</> : "Verify Email"}
                            </button>
                        </form>
                    )}

                    {/* Step 2 Form */}
                    {step === 2 && (
                        <form onSubmit={handleSubmitOtp(onVerifyOtp)} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-foreground/90 mb-1">
                                    6-Digit OTP
                                </label>
                                <input
                                    {...registerOtp("otp")}
                                    type="text"
                                    maxLength={6}
                                    placeholder="123456"
                                    className="w-full px-4 py-2.5 rounded-lg bg-muted border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition text-center tracking-widest font-mono text-xl"
                                />
                                {otpErrors.otp && (
                                    <p className="text-red-400 text-xs mt-1">{otpErrors.otp.message}</p>
                                )}
                            </div>
                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full py-3 rounded-lg gradient-primary text-white font-semibold hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {isLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Verifying...</> : "Verify Code"}
                            </button>
                            <p className="text-center text-sm text-muted-foreground mt-4">
                                Didn&apos;t receive the code?{" "}
                                <button type="button" onClick={resendOtp} disabled={isLoading} className="text-indigo-400 hover:text-indigo-300 font-medium disabled:opacity-50">
                                    Resend
                                </button>
                            </p>
                        </form>
                    )}

                    {/* Step 3 Form */}
                    {step === 3 && (
                        <form onSubmit={handleSubmitDetails(onSubmitDetails)} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-foreground/90 mb-1">Shop Name</label>
                                <input
                                    {...registerDetails("shop_name")}
                                    placeholder="TechFix Lagos"
                                    className="w-full px-4 py-2.5 rounded-lg bg-muted border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                                />
                                {detailsErrors.shop_name && <p className="text-red-400 text-xs mt-1">{detailsErrors.shop_name.message}</p>}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-foreground/90 mb-1">Your Name</label>
                                <input
                                    {...registerDetails("full_name")}
                                    placeholder="Emeka Okafor"
                                    className="w-full px-4 py-2.5 rounded-lg bg-muted border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                                />
                                {detailsErrors.full_name && <p className="text-red-400 text-xs mt-1">{detailsErrors.full_name.message}</p>}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-foreground/90 mb-1">Phone <span className="text-muted-foreground">(optional)</span></label>
                                <input
                                    {...registerDetails("phone")}
                                    type="tel"
                                    placeholder="+2348012345678"
                                    className="w-full px-4 py-2.5 rounded-lg bg-muted border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-foreground/90 mb-1">Password</label>
                                <div className="relative">
                                    <input
                                        {...registerDetails("password")}
                                        type={showPassword ? "text" : "password"}
                                        placeholder="Min. 8 chars, 1 uppercase, 1 number"
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
                                {detailsErrors.password && <p className="text-red-400 text-xs mt-1">{detailsErrors.password.message}</p>}
                            </div>

                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full py-3 rounded-lg gradient-primary text-white font-semibold hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {isLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating shop...</> : "Create Shop & Get Started"}
                            </button>
                        </form>
                    )}

                    {step === 1 && (
                        <p className="text-center text-sm text-muted-foreground mt-6">
                            Already have an account?{" "}
                            <Link href="/login" className="text-indigo-400 hover:text-indigo-300 font-medium">
                                Sign in
                            </Link>
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
