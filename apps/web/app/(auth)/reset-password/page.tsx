"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Wrench, Loader2, Eye, EyeOff, CheckCircle } from "lucide-react";
import { api, getErrorMessage } from "@/lib/api/client";

const schema = z.object({
    new_password: z.string().min(8, "Password must be at least 8 characters long"),
    confirm_password: z.string()
}).refine(data => data.new_password === data.confirm_password, {
    message: "Passwords do not match",
    path: ["confirm_password"]
});

type FormData = z.infer<typeof schema>;

function ResetPasswordForm() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const token = searchParams.get("token");

    const [showPassword, setShowPassword] = useState(false);
    const [serverError, setServerError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<FormData>({ resolver: zodResolver(schema) });

    const onSubmit = async (data: FormData) => {
        if (!token) {
            setServerError("Reset token is missing from the link.");
            return;
        }

        setServerError(null);
        try {
            await api.post("/auth/reset-password", {
                token,
                new_password: data.new_password
            });
            setSuccess(true);
        } catch (err: unknown) {
            setServerError(getErrorMessage(err, "Failed to reset password. The link may have expired."));
        }
    };

    if (success) {
        return (
            <div className="text-center">
                <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto mb-4" />
                <h2 className="text-xl font-bold text-foreground mb-2">Password reset successful</h2>
                <p className="text-muted-foreground text-sm mb-6">
                    You can now sign in with your new password.
                </p>
                <Link
                    href="/login"
                    className="inline-flex w-full py-3 rounded-lg gradient-primary text-white font-semibold hover:opacity-90 justify-center items-center"
                >
                    Go to Login
                </Link>
            </div>
        );
    }

    if (!token) {
        return (
            <div className="text-center">
                <div className="mb-4 p-3 rounded-lg bg-red-900/40 border border-red-800 text-red-300 text-sm">
                    Invalid or missing password reset token. Please request a new link.
                </div>
                <Link
                    href="/forgot-password"
                    className="inline-flex items-center gap-2 text-indigo-400 hover:text-indigo-300 text-sm"
                >
                    Request new link
                </Link>
            </div>
        );
    }

    return (
        <>
            <h1 className="text-2xl font-bold text-foreground mb-2">Set new password</h1>
            <p className="text-muted-foreground text-sm mb-6">
                Enter your new password below.
            </p>

            {serverError && (
                <div className="mb-4 p-3 rounded-lg bg-red-900/40 border border-red-800 text-red-300 text-sm">
                    {serverError}
                </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-foreground/90 mb-1">New Password</label>
                    <div className="relative">
                        <input
                            {...register("new_password")}
                            type={showPassword ? "text" : "password"}
                            placeholder="Must be at least 8 characters"
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
                    {errors.new_password && (
                        <p className="text-red-400 text-xs mt-1">{errors.new_password.message}</p>
                    )}
                </div>

                <div>
                    <label className="block text-sm font-medium text-foreground/90 mb-1">Confirm Password</label>
                    <input
                        {...register("confirm_password")}
                        type={showPassword ? "text" : "password"}
                        placeholder="Confirm new password"
                        className="w-full px-4 py-2.5 rounded-lg bg-muted border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                    />
                    {errors.confirm_password && (
                        <p className="text-red-400 text-xs mt-1">{errors.confirm_password.message}</p>
                    )}
                </div>

                <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-3 rounded-lg gradient-primary text-white font-semibold hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                    {isSubmitting ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Updating...</>
                    ) : (
                        "Update Password"
                    )}
                </button>
            </form>
        </>
    );
}

export default function ResetPasswordPage() {
    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-background">
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl" />
            </div>

            <div className="relative w-full max-w-md">
                <div className="flex items-center gap-3 mb-8 justify-center">
                    <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center">
                        <Wrench className="w-5 h-5 text-white" />
                    </div>
                    <span className="text-2xl font-bold text-foreground">RepairDesk</span>
                </div>

                <div className="glass rounded-2xl p-8 shadow-2xl">
                    <Suspense fallback={<div className="text-center p-4"><Loader2 className="w-6 h-6 animate-spin mx-auto text-indigo-400" /></div>}>
                        <ResetPasswordForm />
                    </Suspense>
                </div>
            </div>
        </div>
    );
}
