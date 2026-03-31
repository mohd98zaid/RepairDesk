import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { AuthUser } from "@/types";

interface AuthState {
    user: AuthUser | null;
    accessToken: string | null;
    refreshToken: string | null;
    setAuth: (user: AuthUser, token: string, refreshToken?: string) => void;
    setToken: (token: string) => void;
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

            setAuth: (user: AuthUser, accessToken: string, refreshToken?: string) =>
                set({ user, accessToken, refreshToken: refreshToken ?? get().refreshToken }),

            setToken: (accessToken: string) => set({ accessToken }),

            setUser: (user: AuthUser) => set({ user }),

            clearAuth: () => set({ user: null, accessToken: null, refreshToken: null }),

            isAuthenticated: () => !!get().accessToken && !!get().user,
        }),
        {
            name: "repairdesk-auth",
            storage: createJSONStorage(() => localStorage),
            partialize: (state: AuthState) => ({
                user: state.user,
                accessToken: state.accessToken,
                refreshToken: state.refreshToken,
            }) as AuthState,
        }
    )
);
