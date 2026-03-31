import axios, { AxiosError, type AxiosInstance } from "axios";
import type { ApiError } from "@/types";
import { queueMutation } from "../db";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
const AUTH_KEY = "repairdesk-auth";

let refreshing = false;
let refreshSubscribers: Array<(token: string) => void> = [];

function onTokenRefreshed(token: string) {
    refreshSubscribers.forEach((cb) => cb(token));
    refreshSubscribers = [];
}

/** Read the access token from localStorage (where Zustand persist stores it). */
function getStoredToken(): string | null {
    if (typeof window === "undefined") return null;
    try {
        const raw = localStorage.getItem(AUTH_KEY);
        if (!raw) return null;
        const { state } = JSON.parse(raw);
        return state?.accessToken ?? null;
    } catch {
        return null;
    }
}

/** Write a refreshed access token back into localStorage. */
function updateStoredToken(newToken: string) {
    if (typeof window === "undefined") return;
    try {
        const raw = localStorage.getItem(AUTH_KEY);
        if (!raw) return;
        const stored = JSON.parse(raw);
        stored.state.accessToken = newToken;
        localStorage.setItem(AUTH_KEY, JSON.stringify(stored));
    } catch { /* ignore */ }
}

/** Clear auth from localStorage and redirect to login with an ejection reason. */
function clearAuthAndRedirect(reason: 'session_ejected' | 'expired' = 'session_ejected') {
    if (typeof window === "undefined") return;
    localStorage.removeItem(AUTH_KEY);
    sessionStorage.setItem('auth_redirect_reason', reason);
    window.location.href = "/login";
}

/** Check if a JWT token is expired (client-side decode, no verification). */
export function isTokenExpired(token: string | null): boolean {
    if (!token) return true;
    try {
        const payload = JSON.parse(atob(token.split(".")[1]));
        return payload.exp ? Date.now() / 1000 > payload.exp : false;
    } catch {
        return true;
    }
}

export function getApiClient(): AxiosInstance {
    const client = axios.create({
        baseURL: API_URL,
        withCredentials: true, // send httpOnly refresh cookie
        headers: { "Content-Type": "application/json" },
    });

    // Attach Bearer token from localStorage on every request
    client.interceptors.request.use((config) => {
        const token = getStoredToken();
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    });

    // Auto-refresh on 401
    client.interceptors.response.use(
        (res) => res,
        async (error: AxiosError<ApiError>) => {
            const original = error.config as typeof error.config & { _retry?: boolean };
            if (error.response?.status === 401 && !original?._retry) {
                if (original) original._retry = true;

                if (!refreshing) {
                    refreshing = true;
                    try {
                        let body = {};
                        try {
                            const raw = localStorage.getItem(AUTH_KEY);
                            if (raw) {
                                const { state } = JSON.parse(raw);
                                if (state?.refreshToken) {
                                    body = { refresh_token: state.refreshToken };
                                }
                            }
                        } catch { /* ignore */ }

                        const { data } = await axios.post(
                            `${API_URL}/auth/refresh`,
                            body,
                            { withCredentials: true }
                        );
                        const newToken: string = data.access_token;

                        updateStoredToken(newToken);
                        onTokenRefreshed(newToken);
                        refreshing = false;

                        if (original) {
                            original.headers!.Authorization = `Bearer ${newToken}`;
                            return client(original);
                        }
                    } catch {
                        refreshing = false;
                        refreshSubscribers = [];
                        clearAuthAndRedirect();
                    }
                }

                // Queue concurrent requests while refreshing
                return new Promise((resolve) => {
                    refreshSubscribers.push((token: string) => {
                        if (original) {
                            original.headers!.Authorization = `Bearer ${token}`;
                            resolve(client(original));
                        }
                    });
                });
            }
            if (error.response?.status === 422 && process.env.NODE_ENV === "development") {
                console.error("422 Validation Error:", error.config?.url, error.response?.data);
            }

            // --- Offline Mutation Interception ---
            // Only queue mutations when the browser is GENUINELY offline.
            // We must NOT intercept real server errors (CORS blocks, 5xx, cold-start
            // timeouts) that also arrive as network-level failures with no response.
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

                    // It's a mutation that failed because the device is offline — queue it.
                    await queueMutation(error.config);

                    // Reject with a special flag so the UI knows it was queued optimistically
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
