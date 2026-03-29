import AppShell from "@/components/layout/AppShell";

// Server component (no "use client") — AppShell handles auth guard on the client
export default function AppLayout({ children }: { children: React.ReactNode }) {
    return <AppShell>{children}</AppShell>;
}
