import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { AuthUser } from "@/types";

interface AuthState {
    user: AuthUser | null;
    accessToken: string | null;
    setAuth: (user: AuthUser, token: string) => void;
    setToken: (token: string) => void;
    setUser: (user: AuthUser) => void;
    clearAuth: () => void;
    isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>()(
    persist<AuthState>(
        (set, get): AuthState => ({
            user: null,
            accessToken: null,

            setAuth: (user: AuthUser, accessToken: string) => set({ user, accessToken }),

            setToken: (accessToken: string) => set({ accessToken }),

            setUser: (user: AuthUser) => set({ user }),

            clearAuth: () => set({ user: null, accessToken: null }),

            isAuthenticated: () => !!get().accessToken && !!get().user,
        }),
        {
            name: "repairdesk-auth",
            storage: createJSONStorage(() => localStorage),
            partialize: (state: AuthState) => ({
                user: state.user,
                accessToken: state.accessToken,
            }) as AuthState,
        }
    )
);
