import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { AuthUser } from "@/types";

interface AuthState {
    user: AuthUser | null;
    accessToken: string | null;
    refreshToken: string | null;
    setAuth: (user: AuthUser, accessToken?: string | null, refreshToken?: string | null) => void;
    setTokens: (accessToken: string | null, refreshToken?: string | null) => void;
    setUser: (user: AuthUser) => void;
    clearAuth: () => void;
    isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>()(
    persist<AuthState>(
        (set: any, get: any): AuthState => ({
            user: null,
            accessToken: null,
            refreshToken: null,

            setAuth: (user: AuthUser, accessToken?: string | null, refreshToken?: string | null) =>
                set({ user, accessToken: accessToken || null, refreshToken: refreshToken || null }),

            setTokens: (accessToken: string | null, refreshToken?: string | null) =>
                set((state: any) => ({
                    accessToken,
                    refreshToken: refreshToken !== undefined ? refreshToken : state.refreshToken,
                })),

            setUser: (user: AuthUser) => set({ user }),

            clearAuth: () => set({ user: null, accessToken: null, refreshToken: null }),

            isAuthenticated: () => !!get().user,
        }),
        {
            name: "repairdesk-auth",
            storage: createJSONStorage(() => localStorage),
            version: 3,
            migrate: (persisted: unknown, version: number) => {
                const p = persisted as Record<string, unknown>;
                const state = (p && typeof p === "object" && "state" in p) ? (p.state as Record<string, unknown>) : (p || {});
                return {
                    user: (state?.user as AuthUser) || null,
                    accessToken: (state?.accessToken as string) || null,
                    refreshToken: (state?.refreshToken as string) || null,
                    setAuth: () => {},
                    setTokens: () => {},
                    setUser: () => {},
                    clearAuth: () => {},
                    isAuthenticated: () => !!state?.user,
                } as AuthState;
            },
            partialize: (state: AuthState) => ({
                user: state.user,
                accessToken: state.accessToken,
                refreshToken: state.refreshToken,
            }) as AuthState,
            // Skip rehydration if localStorage data is corrupted
            onRehydrateStorage: () => {
                return (state, error) => {
                    if (error) {
                        console.error("Auth store rehydration failed:", error);
                        localStorage.removeItem("repairdesk-auth");
                    }
                };
            },
        }
    )
);
