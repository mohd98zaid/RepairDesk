import axios, { AxiosError, type AxiosInstance } from "axios";
import type { ApiError } from "@/types";
import { queueMutation } from "../db";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

let refreshing = false;
let refreshSubscribers: Array<() => void> = [];

function onTokenRefreshed() {
    refreshSubscribers.forEach((cb) => cb());
    refreshSubscribers = [];
}

/** Clear auth and redirect to login. */
function clearAuthAndRedirect(reason: 'session_ejected' | 'expired' = 'session_ejected') {
    if (typeof window === "undefined") return;
    // Clear user data from localStorage (no tokens stored)
    localStorage.removeItem("repairdesk-auth");
    window.location.href = "/login";
}

export function getApiClient(): AxiosInstance {
    const client = axios.create({
        baseURL: API_URL,
        withCredentials: true, // Send httpOnly auth cookies when supported
        headers: { "Content-Type": "application/json" },
    });

    // Request interceptor: attach Bearer token from storage as fallback for cross-domain cookie restrictions
    client.interceptors.request.use((config) => {
        if (typeof window !== "undefined") {
            try {
                const raw = localStorage.getItem("repairdesk-auth");
                if (raw) {
                    const parsed = JSON.parse(raw);
                    const token = parsed?.state?.accessToken;
                    if (token && !config.headers.Authorization) {
                        config.headers.Authorization = `Bearer ${token}`;
                    }
                }
            } catch { /* ignore */ }
        }
        return config;
    });

    // Auto-refresh on 401
    client.interceptors.response.use(
        (res: any) => res,
        async (error: AxiosError<ApiError>) => {
            const original = error.config as typeof error.config & { _retry?: boolean };
            if (error.response?.status === 401 && !original?._retry) {
                if (original) original._retry = true;

                if (!refreshing) {
                    refreshing = true;
                    try {
                        let refreshToken: string | null = null;
                        if (typeof window !== "undefined") {
                            try {
                                const raw = localStorage.getItem("repairdesk-auth");
                                if (raw) {
                                    refreshToken = JSON.parse(raw)?.state?.refreshToken || null;
                                }
                            } catch { /* ignore */ }
                        }

                        // Send refresh token in cookie AND in request body
                        const refreshRes = await axios.post(
                            `${API_URL}/auth/refresh`,
                            refreshToken ? { refresh_token: refreshToken } : {},
                            { withCredentials: true }
                        );

                        const newAccess = refreshRes.data?.access_token;
                        const newRefresh = refreshRes.data?.refresh_token;
                        if (newAccess && typeof window !== "undefined") {
                            try {
                                const raw = localStorage.getItem("repairdesk-auth");
                                const parsed = raw ? JSON.parse(raw) : { state: {} };
                                parsed.state.accessToken = newAccess;
                                if (newRefresh) parsed.state.refreshToken = newRefresh;
                                localStorage.setItem("repairdesk-auth", JSON.stringify(parsed));
                            } catch { /* ignore */ }
                        }

                        onTokenRefreshed();
                        refreshing = false;

                        if (original) {
                            if (newAccess && original.headers) {
                                original.headers.Authorization = `Bearer ${newAccess}`;
                            }
                            return client(original);
                        }
                    } catch (refreshErr) {
                        refreshing = false;
                        refreshSubscribers = [];
                        clearAuthAndRedirect();
                        return Promise.reject(refreshErr);
                    }
                }

                // Queue concurrent requests while refreshing
                return new Promise((resolve, reject) => {
                    refreshSubscribers.push(() => {
                        if (original) {
                            let currentToken: string | null = null;
                            if (typeof window !== "undefined") {
                                try {
                                    const raw = localStorage.getItem("repairdesk-auth");
                                    if (raw) {
                                        currentToken = JSON.parse(raw)?.state?.accessToken || null;
                                    }
                                } catch { /* ignore */ }
                            }
                            if (currentToken && original.headers) {
                                original.headers.Authorization = `Bearer ${currentToken}`;
                            }
                            resolve(client(original));
                        } else {
                            reject(error);
                        }
                    });
                });
            }
            if (error.response?.status === 422 && process.env.NODE_ENV === "development") {
                console.error("422 Validation Error:", error.config?.url, error.response?.data);
            }

            // --- Offline Mutation Interception ---
            const isGenuinelyOffline =
                typeof navigator !== "undefined" && !navigator.onLine;

            if (!error.response && error.config && error.request && isGenuinelyOffline) {
                const method = error.config.method?.toUpperCase() || "";
                const url = error.config.url || "";
                const isAuthRoute = url.includes("auth") || url.includes("login") || url.includes("refresh");

                if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
                    if (isAuthRoute) {
                        return Promise.reject(error);
                    }

                    await queueMutation(error.config);

                    return Promise.reject({ ...error, isOfflineQueued: true, message: "Action queued successfully while offline." });
                }
            }

            return Promise.reject(error);
        }
    );

    return client;
}

/** Robustly extract an error message from an API error response. */
export function getErrorMessage(err: any, fallback = "Something went wrong"): string {
    const detail = err?.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    if (typeof detail === 'object' && detail !== null && detail.detail) {
        return typeof detail.detail === 'string' ? detail.detail : JSON.stringify(detail.detail);
    }
    if (err?.response?.data?.message) return err.response.data.message;
    if (err?.message) return err.message;
    return fallback;
}

export const api = getApiClient();
