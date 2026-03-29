"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Wrench, Eye, EyeOff, Loader2 } from "lucide-react";
import { api, getErrorMessage } from "@/lib/api/client";
import { useAuthStore } from "@/store/authStore";
import type { AuthUser } from "@/types";

const schema = z.object({
    email: z.string().email("Enter a valid email"),
    password: z.string().min(1, "Password is required"),
});

type FormData = z.infer<typeof schema>;

export default function LoginPage() {
    const router = useRouter();
    const setAuth = useAuthStore((s) => s.setAuth);
    const [showPassword, setShowPassword] = useState(false);
    const [serverError, setServerError] = useState<string | null>(null);

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
            const e = err as { response?: { status?: number } };
            if (e.response?.status === 401) {
                setServerError("Invalid email or password. Please try again.");
            } else {
                setServerError(getErrorMessage(err, "Login failed. Please try again."));
            }
        }
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
                    <h1 className="text-2xl font-bold text-foreground mb-2">Welcome back</h1>
                    <p className="text-muted-foreground text-sm mb-6">Sign in to your shop account</p>

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
                </div>
            </div>
        </div>
    );
}
