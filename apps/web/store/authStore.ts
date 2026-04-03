import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { AuthUser } from "@/types";

interface AuthState {
    user: AuthUser | null;
    /** @deprecated Access token is now httpOnly cookie — never stored client-side */
    accessToken: string | null;
    setAuth: (user: AuthUser) => void;
    setUser: (user: AuthUser) => void;
    clearAuth: () => void;
    isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>()(
    persist<AuthState>(
        (set: any, get: any): AuthState => ({
            user: null,
            accessToken: null,

            setAuth: (user: AuthUser) =>
                set({ user, accessToken: null }),

            setUser: (user: AuthUser) => set({ user }),

            clearAuth: () => set({ user: null, accessToken: null }),

            isAuthenticated: () => !!get().user,
        }),
        {
            name: "repairdesk-auth",
            storage: createJSONStorage(() => localStorage),
            version: 2,
            migrate: (persisted: unknown, version: number) => {
                // v0/v1 had refreshToken and accessToken — strip them
                const p = persisted as Record<string, unknown>;
                if (version < 2 && p && typeof p === "object" && "state" in p) {
                    const state = p.state as Record<string, unknown>;
                    if (state) {
                        delete state.refreshToken;
                        delete state.accessToken;
                    }
                    // Ensure we return a proper AuthState object with all required fields
                    return {
                        ...state,
                        setAuth: (user: AuthUser) => {},
                        setUser: (user: AuthUser) => {},
                        clearAuth: () => {},
                        isAuthenticated: () => !!state.user,
                    } as AuthState;
                }
                // Return default state if no migration needed
                return {
                    user: null,
                    accessToken: null,
                    setAuth: (user: AuthUser) => {},
                    setUser: (user: AuthUser) => {},
                    clearAuth: () => {},
                    isAuthenticated: () => false,
                } as AuthState;
            },
            partialize: (state: AuthState) => ({
                user: state.user,
                // NO tokens stored — access token is in httpOnly cookie only
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
