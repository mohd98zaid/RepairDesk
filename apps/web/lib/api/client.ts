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

    // Request interceptor: cookies are sent automatically via withCredentials: true.
    // No localStorage token reads — tokens are stored in httpOnly cookies only.
    client.interceptors.request.use((config) => config);

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
                        // Rely solely on the httpOnly refresh cookie — no localStorage
                        const refreshRes = await axios.post(
                            `${API_URL}/auth/refresh`,
                            {},
                            { withCredentials: true }
                        );

                        // Tokens are set as httpOnly cookies by the server response.
                        // No need to store anything in localStorage.
                        if (refreshRes.data?.access_token) {
                            onTokenRefreshed();
                        }
                        refreshing = false;

                        if (original) {
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
