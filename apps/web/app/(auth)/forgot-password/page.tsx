"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import Link from "next/link";
import { Wrench, Loader2, ArrowLeft, CheckCircle } from "lucide-react";
import { api } from "@/lib/api/client";

const schema = z.object({
    email: z.string().email("Enter a valid email address"),
});

type FormData = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
    const [sent, setSent] = useState(false);
    const [serverError, setServerError] = useState<string | null>(null);

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<FormData>({ resolver: zodResolver(schema) });

    const onSubmit = async (data: FormData) => {
        setServerError(null);
        try {
            await api.post("/auth/forgot-password", data);
            setSent(true);
        } catch {
            // Show success even on error to avoid email enumeration
            setSent(true);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-background">
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl" />
            </div>

            <div className="relative w-full max-w-md">
                <div className="flex items-center gap-3 mb-8 justify-center">
                    <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center">
                        <Wrench className="w-5 h-5 text-white" />
                    </div>
                    <span className="text-2xl font-bold text-foreground">RepairDesk</span>
                </div>

                <div className="glass rounded-2xl p-8 shadow-2xl">
                    {sent ? (
                        <div className="text-center">
                            <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto mb-4" />
                            <h2 className="text-xl font-bold text-foreground mb-2">Check your email</h2>
                            <p className="text-muted-foreground text-sm mb-6">
                                If an account with that email exists, we&apos;ve sent a password reset link.
                            </p>
                            <Link
                                href="/login"
                                className="inline-flex items-center gap-2 text-indigo-400 hover:text-indigo-300 text-sm"
                            >
                                <ArrowLeft className="w-4 h-4" /> Back to sign in
                            </Link>
                        </div>
                    ) : (
                        <>
                            <h1 className="text-2xl font-bold text-foreground mb-2">Reset password</h1>
                            <p className="text-muted-foreground text-sm mb-6">
                                Enter your email and we&apos;ll send a reset link.
                            </p>

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
                                        placeholder="you@example.com"
                                        className="w-full px-4 py-2.5 rounded-lg bg-muted border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                                    />
                                    {errors.email && (
                                        <p className="text-red-400 text-xs mt-1">{errors.email.message}</p>
                                    )}
                                </div>

                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="w-full py-3 rounded-lg gradient-primary text-white font-semibold hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {isSubmitting ? (
                                        <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</>
                                    ) : (
                                        "Send Reset Link"
                                    )}
                                </button>
                            </form>

                            <div className="text-center mt-6">
                                <Link
                                    href="/login"
                                    className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm transition"
                                >
                                    <ArrowLeft className="w-4 h-4" /> Back to sign in
                                </Link>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
