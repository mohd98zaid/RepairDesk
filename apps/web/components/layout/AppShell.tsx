"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
    LayoutDashboard,
    Ticket,
    Users,
    Package,
    BarChart2,
    Settings,
    LogOut,
    Wrench,
    Menu,
    X,
    Plus,
    ChevronRight,
    Store,
    Download,
    AlertTriangle,
    Bell,
    CheckCircle,
    Sun,
    Moon,
    Activity,
    Search,
    QrCode,
} from "lucide-react";
import { useEffect, useRef, useState, useCallback } from "react";
import { MonitorSmartphone } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useShopStore } from "@/store/shopStore";
import { api } from "@/lib/api/client";
import { clsx } from "clsx";
import { GlobalSearch } from "./GlobalSearch";
import { QRScannerModal } from "@/components/QRScanner";
import { OfflineSyncManager } from "@/components/OfflineSyncManager";

const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/tickets", label: "Tickets", icon: Ticket },
    { href: "/customers", label: "Customers", icon: Users },
    { href: "/inventory", label: "Inventory", icon: Package },
    { href: "/reports", label: "Reports", icon: BarChart2 },
];

// All settings items — Owner sees all; Technician sees none (hidden via RBAC in rendering)
const settingsItemsOwner = [
    { href: "/settings/shop", label: "Shop", icon: Store },
    { href: "/settings/team", label: "Team", icon: Users },
    { href: "/settings/sessions", label: "Sessions", icon: MonitorSmartphone },
    { href: "/settings/activity", label: "Activity Log", icon: Activity },
];
const settingsItemsTechnician = [
    { href: "/settings/shop", label: "Shop Profile", icon: Store },
    { href: "/settings/sessions", label: "Sessions", icon: MonitorSmartphone },
];

function NavLink({
    href,
    label,
    icon: Icon,
    onClick,
    exact = false,
}: {
    href: string;
    label: string;
    icon: React.ElementType;
    onClick?: () => void;
    exact?: boolean;
}) {
    const pathname = usePathname();
    const isActive = exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");
    return (
        <Link
            href={href}
            onClick={onClick}
            className={clsx(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all w-full",
                isActive
                    ? "bg-primary/10 text-primary border border-primary/20"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
        >
            <Icon className="w-5 h-5 flex-shrink-0" />
            <span>{label}</span>
        </Link>
    );
}

// ── Theme Toggle Hook ────────────────────────────────────────
function useTheme() {
    const [dark, setDark] = useState(true);
    useEffect(() => {
        const saved = localStorage.getItem('theme');
        const isDark = saved !== 'light';
        setDark(isDark);
        document.documentElement.classList.toggle('dark', isDark);
        document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
    }, []);
    function toggle() {
        const next = !dark;
        setDark(next);
        localStorage.setItem('theme', next ? 'dark' : 'light');
        document.documentElement.classList.toggle('dark', next);
        document.documentElement.style.colorScheme = next ? 'dark' : 'light';
        // Notify other tabs/pages (e.g. login page) of theme change
        try { new BroadcastChannel('theme').postMessage(next ? 'dark' : 'light'); } catch { /* ignore */ }
    }
    return { dark, toggle };
}

// ── Notifications Bell ────────────────────────────────────────
interface Notif { id: string; type: 'low_stock' | 'ready'; title: string; desc: string; href: string; }

function NotificationsBell({
    dropdownClassName = "absolute left-0 top-12 w-72"
}: {
    dropdownClassName?: string;
}) {
    const [notifs, setNotifs] = useState<Notif[]>([]);
    const [open, setOpen] = useState(false);
    const [seen, setSeen] = useState<Set<string>>(() => {
        try { return new Set(JSON.parse(localStorage.getItem('notif_seen') || '[]')); } catch { return new Set(); }
    });
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    useEffect(() => {
        const api = require('@/lib/api/client').api;
        if (!api) return;

        let evtSource: EventSource | null = null;

        async function connect() {
            try {
                // Fetch a short-lived SSE token via authenticated API call
                const { data } = await api.post('/notifications/sse-token');
                const sseToken = data.sse_token;

                const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
                evtSource = new EventSource(`${baseUrl}/notifications/stream?sse_token=${sseToken}`);

                evtSource.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        if (data && data.notifications) {
                            setNotifs(data.notifications);
                        }
                    } catch (err) {
                        console.error("Failed to parse SSE notification chunk", err);
                    }
                };

                evtSource.onerror = (err) => {
                    console.error("SSE connection error", err);
                    evtSource?.close();
                };
            } catch (err) {
                console.error("Failed to get SSE token", err);
            }
        }

        connect();

        return () => {
            evtSource?.close();
        };
    }, []);

    const unread = notifs.filter(n => !seen.has(n.id)).length;

    function markAllRead() {
        const next = new Set([...seen, ...notifs.map(n => n.id)]);
        setSeen(next);
        localStorage.setItem('notif_seen', JSON.stringify([...next]));
    }

    function handleOpen() {
        setOpen(v => !v);
        if (!open) markAllRead();
    }

    return (
        <div ref={ref} className="relative shrink-0">
            <button onClick={handleOpen}
                className="relative flex items-center justify-center w-11 h-11 rounded-lg hover:bg-muted transition text-muted-foreground hover:text-foreground"
                title="Notifications"
                aria-label="Notifications">
                <Bell className="w-5 h-5" />
                {unread > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-danger text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                        {unread}
                    </span>
                )}
            </button>
            {open && (
                <div className={clsx("bg-card border border-border rounded-xl shadow-2xl z-[9999] flex flex-col", dropdownClassName)}>
                    <div className="px-4 py-3 border-b border-border flex items-center justify-between shrink-0 bg-card rounded-t-xl">
                        <span className="text-sm font-semibold text-foreground">Notifications</span>
                        {notifs.length > 0 && <button onClick={markAllRead} className="text-xs text-indigo-400 hover:text-indigo-300">Mark all read</button>}
                    </div>
                    {notifs.length === 0 ? (
                        <div className="px-4 py-8 text-center shrink-0">
                            <CheckCircle className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-50" />
                            <p className="text-xs text-muted-foreground opacity-80">All caught up! 🎉</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-border overflow-y-auto min-h-[50px]">
                            {notifs.map(n => (
                                <Link key={n.id} href={n.href} onClick={() => setOpen(false)}
                                    className="flex items-start gap-3 px-4 py-3 hover:bg-muted transition">
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${n.type === 'low_stock' ? 'bg-amber-900/30' : 'bg-emerald-900/30'
                                        }`}>
                                        {n.type === 'low_stock'
                                            ? <AlertTriangle className="w-4 h-4 text-warning" />
                                            : <CheckCircle className="w-4 h-4 text-success" />}
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-foreground">{n.title}</p>
                                        <p className="text-xs text-muted-foreground mt-0.5">{n.desc}</p>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function BottomNavItem({ href, label, icon: Icon }: { href: string; label: string; icon: React.ElementType }) {
    const pathname = usePathname();
    const isActive = pathname === href || pathname.startsWith(href + "/");
    return (
        <Link
            href={href}
            className={clsx(
                "flex flex-col items-center justify-center gap-0.5 px-2 py-1.5 min-h-[48px] rounded-lg transition",
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
            )}
        >
            <Icon className="w-5 h-5" />
            <span className="text-[11px] font-medium leading-tight">{label}</span>
        </Link>
    );
}

// PWA Install prompt
function PWAInstallPrompt() {
    const [deferredPrompt, setDeferredPrompt] = useState<Event | null>(null);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const handler = (e: Event) => {
            e.preventDefault();
            setDeferredPrompt(e);
            setVisible(true);
        };
        window.addEventListener("beforeinstallprompt", handler);
        return () => window.removeEventListener("beforeinstallprompt", handler);
    }, []);

    if (!visible) return null;

    const install = async () => {
        if (!deferredPrompt) return;
        // @ts-expect-error - BeforeInstallPromptEvent not in TS types
        await deferredPrompt.prompt();
        setVisible(false);
        setDeferredPrompt(null);
    };

    return (
        <div className="mx-1 mb-2 p-3 rounded-xl bg-primary/10 border border-primary/20 flex items-start gap-2">
            <Download className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
                <p className="text-primary text-xs font-semibold">Install RepairDesk</p>
                <p className="text-primary/80 text-xs mt-0.5">Works offline as an app</p>
                <div className="flex gap-2 mt-2">
                    <button onClick={install} className="text-xs px-2 py-1 rounded-md bg-primary text-primary-foreground font-medium">Install</button>
                    <button onClick={() => setVisible(false)} className="text-xs px-2 py-1 rounded-md bg-muted text-muted-foreground font-medium">Later</button>
                </div>
            </div>
        </div>
    );
}

// ── Impersonation Banner ──────────────────────────────────────
function ImpersonationBanner() {
    const [info, setInfo] = useState<{ shop: string; email: string } | null>(null);

    useEffect(() => {
        const shop = sessionStorage.getItem('impersonationShop');
        const email = sessionStorage.getItem('impersonationEmail');
        if (shop && email) setInfo({ shop, email });
    }, []);

    function exit() {
        sessionStorage.removeItem('impersonationToken');
        sessionStorage.removeItem('impersonationShop');
        sessionStorage.removeItem('impersonationEmail');
        setInfo(null);
        window.close();
    }

    if (!info) return null;

    return (
        <div style={{
            background: 'linear-gradient(90deg, rgba(251,191,36,0.15), rgba(245,158,11,0.1))',
            borderBottom: '1px solid rgba(251,191,36,0.35)',
            padding: '10px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 13,
            color: '#fbbf24',
            flexWrap: 'wrap',
        }}>
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span style={{ fontWeight: 700 }}>Admin View</span>
            <span style={{ color: '#d97706' }}>You are logged in as</span>
            <span style={{ fontWeight: 600, color: '#fff' }}>{info.shop}</span>
            <span style={{ color: '#78716c', fontSize: 12 }}>({info.email})</span>
            <span style={{ flex: 1 }} />
            <button onClick={exit} style={{ background: 'rgba(251,191,36,0.2)', border: '1px solid rgba(251,191,36,0.4)', color: '#fbbf24', borderRadius: 8, padding: '4px 14px', cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>
                ✕ Exit Impersonation
            </button>
        </div>
    );
}

// ── Broadcast Notification Banner ─────────────────────────────
interface Broadcast { id: string; title: string; message: string; type: string; duration_minutes?: number | null; created_at?: string; }

const TYPE_STYLES: Record<string, { bg: string; border: string; color: string }> = {
    INFO: { bg: 'rgba(96,165,250,0.1)', border: 'rgba(96,165,250,0.3)', color: '#60a5fa' },
    WARNING: { bg: 'rgba(251,191,36,0.1)', border: 'rgba(251,191,36,0.3)', color: '#fbbf24' },
    MAINTENANCE: { bg: 'rgba(167,139,250,0.1)', border: 'rgba(167,139,250,0.3)', color: '#a78bfa' },
};

function BroadcastBanner() {
    const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
    const [dismissed, setDismissed] = useState<Set<string>>(new Set());

    useEffect(() => {
        async function fetchBroadcasts() {
            try {
                const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
                const res = await fetch(`${base}/admin/broadcasts/latest`);
                if (res.ok) {
                    const data: Broadcast[] = await res.json();
                    setBroadcasts(data.slice(0, 3));
                }
            } catch { /* silent — broadcasts are non-critical */ }
        }
        fetchBroadcasts();
        const interval = setInterval(fetchBroadcasts, 60_000); // poll every 60s
        return () => clearInterval(interval);
    }, []);

    const now = Date.now();
    const visible = broadcasts.filter(b => {
        if (dismissed.has(b.id)) return false;
        if (b.duration_minutes && b.duration_minutes > 0 && b.created_at) {
            const created = new Date(b.created_at).getTime();
            const expiresAt = created + b.duration_minutes * 60 * 1000;
            if (now >= expiresAt) return false;
        }
        return true;
    });

    const [, forceUpdate] = useState(0);
    useEffect(() => {
        const hasTimed = broadcasts.some(b => b.duration_minutes && b.duration_minutes > 0);
        if (!hasTimed) return;
        const timer = setInterval(() => forceUpdate(v => v + 1), 30_000);
        return () => clearInterval(timer);
    }, [broadcasts]);

    if (visible.length === 0) return null;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {visible.map(b => {
                const s = TYPE_STYLES[b.type] || TYPE_STYLES.INFO;
                return (
                    <div key={b.id} style={{
                        background: s.bg,
                        borderBottom: `1px solid ${s.border}`,
                        padding: '10px 20px',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 10,
                    }}>
                        <Bell style={{ width: 15, height: 15, color: s.color, flexShrink: 0, marginTop: 2 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ fontWeight: 700, fontSize: 13, color: s.color }}>{b.title}</span>
                            <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 8 }}>{b.message}</span>
                        </div>
                        <button
                            onClick={() => setDismissed(p => new Set([...p, b.id]))}
                            style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '0 4px', fontSize: 16, lineHeight: 1 }}
                            title="Dismiss"
                        >×</button>
                    </div>
                );
            })}
        </div>
    );
}

// ── Shop Status Banner & Enforcement ───────────────────────────
function ShopStatusBanner({ status }: { status: string }) {
    if (status === 'ACTIVE') return null;

    const isRestricted = status === 'RESTRICTED';
    const isBlocked = status === 'BLOCKED';

    if (!isRestricted && !isBlocked) return null;

    return (
        <div style={{
            background: isBlocked ? 'rgba(239,68,68,0.15)' : 'rgba(251,191,36,0.15)',
            borderBottom: `1px solid ${isBlocked ? 'rgba(239,68,68,0.3)' : 'rgba(251,191,36,0.3)'}`,
            padding: '8px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 13,
            color: isBlocked ? '#f87171' : '#fbbf24',
            zIndex: 100,
        }}>
            <AlertTriangle className="w-4 h-4" />
            <span style={{ fontWeight: 700 }}>{isBlocked ? 'ACCOUNT BLOCKED' : 'READ-ONLY MODE'}</span>
            <span style={{ opacity: 0.8 }}>
                {isBlocked
                    ? 'Your shop has been blocked by administrators. Please contact support to resolve this.'
                    : 'Your shop is in restricted (read-only) mode. You can view data, but creating new records or making changes is disabled. Contact support to restore full access.'}
            </span>
        </div>
    );
}

function BlockedScreen() {
    return (
        <div style={{ position: 'fixed', inset: 0, background: 'var(--background)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div style={{ maxWidth: 400, textAlign: 'center' }}>
                <div style={{ width: 64, height: 64, borderRadius: 20, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', color: '#ef4444' }}>
                    <AlertTriangle size={32} />
                </div>
                <h1 style={{ color: 'var(--foreground)', fontSize: 24, fontWeight: 700, marginBottom: 12 }}>Access Denied</h1>
                <p style={{ color: 'var(--muted-foreground)', lineHeight: 1.6, marginBottom: 32 }}>
                    Your repair shop account has been blocked by administrators.
                    You can no longer access the platform or perform any operations.
                </p>
                <button
                    onClick={() => { localStorage.removeItem('repairdesk-auth'); window.location.href = '/login'; }}
                    style={{ background: 'var(--glass-bg)', backdropFilter: 'blur(12px)', border: '1px solid var(--glass-border)', color: 'var(--foreground)', padding: '10px 24px', borderRadius: 10, cursor: 'pointer', fontWeight: 600 }}>
                    Sign Out
                </button>
            </div>
        </div>
    );
}

// ── Session Ejection Modal ────────────────────────────────────
function SessionEjectedModal({ onDismiss }: { onDismiss: () => void }) {
    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 99999,
            background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
            <div style={{
                background: '#13151f',
                border: '1px solid rgba(239,68,68,0.4)',
                borderRadius: 24,
                padding: '40px 36px',
                maxWidth: 420, width: '100%',
                textAlign: 'center',
                boxShadow: '0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(239,68,68,0.15)',
                animation: 'slideUp 0.3s cubic-bezier(0.34,1.56,0.64,1)',
            }}>
                {/* Icon */}
                <div style={{
                    width: 72, height: 72, borderRadius: '50%', margin: '0 auto 24px',
                    background: 'rgba(239,68,68,0.12)',
                    border: '2px solid rgba(239,68,68,0.3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <MonitorSmartphone size={34} style={{ color: '#f87171' }} />
                </div>

                <h2 style={{ color: '#f87171', fontSize: 22, fontWeight: 800, marginBottom: 10 }}>
                    Session Terminated
                </h2>
                <p style={{ color: '#94a3b8', fontSize: 14, lineHeight: 1.7, marginBottom: 8 }}>
                    Your session on this device has been <strong style={{ color: '#e2e8f0' }}>remotely signed out</strong>.
                    This may have been done by an administrator or by you from another device.
                </p>
                <p style={{ color: '#64748b', fontSize: 12, marginBottom: 32 }}>
                    Please sign in again to continue.
                </p>

                <button
                    onClick={onDismiss}
                    style={{
                        width: '100%', padding: '13px 0',
                        background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                        border: 'none', borderRadius: 12,
                        color: '#fff', fontSize: 15, fontWeight: 700,
                        cursor: 'pointer', transition: 'opacity 0.2s',
                    }}
                    id="session-ejected-signin"
                >
                    Sign In Again
                </button>
            </div>
            <style>{`
                @keyframes slideUp {
                    from { opacity: 0; transform: translateY(24px) scale(0.96); }
                    to   { opacity: 1; transform: translateY(0) scale(1); }
                }
            `}</style>
        </div>
    );
}

// ── Session Heartbeat Hook ────────────────────────────────────
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
// Poll every 15 seconds so admin session kills take effect quickly
const HEARTBEAT_INTERVAL_MS = 15_000;
const HEARTBEAT_WARMUP_MS = 30_000;

function useSessionHeartbeat(onEvicted: () => void) {
    const onEvictedRef = useRef(onEvicted);
    useEffect(() => { onEvictedRef.current = onEvicted; }, [onEvicted]);

    useEffect(() => {
        let destroyed = false;

        async function heartbeat() {
            if (destroyed) return;

            // Skip heartbeat if no user is logged in
            try {
                const raw = localStorage.getItem("repairdesk-auth");
                if (!raw) return;
                const { state } = JSON.parse(raw);
                if (!state?.user) return; // Only check user object, no token
            } catch { return; }

            try {
                const res = await fetch(`${API_URL}/auth/session-status`, {
                    method: 'GET',
                    credentials: 'include',
                });
                if (res.status === 401) {
                    if (!destroyed) onEvictedRef.current();
                }
            } catch {
                // Network offline — silently skip
            }
        }

        const interval = setInterval(heartbeat, HEARTBEAT_INTERVAL_MS);

        // Also listen for session-kill BroadcastChannel messages (cross-tab)
        let bc: BroadcastChannel | null = null;
        try {
            bc = new BroadcastChannel('session_killed');
            bc.onmessage = () => { if (!destroyed) onEvictedRef.current(); };
        } catch { /* ignore — not supported in all browsers */ }

        return () => {
            destroyed = true;
            clearInterval(interval);
            bc?.close();
        };
    }, []);
}

export default function AppShell({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const { user, clearAuth } = useAuthStore();
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [qrOpen, setQrOpen] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [shopStatus, setShopStatus] = useState<string>('ACTIVE');
    const { dark, toggle: toggleTheme } = useTheme();
    const [sessionEjected, setSessionEjected] = useState(false);

    const handleEviction = useCallback(() => {
        setSessionEjected(true);
    }, []);

    useSessionHeartbeat(handleEviction);

    useEffect(() => {
        setMounted(true);
    }, []);

    // Auth guard — runs after mount (client-side only) to avoid SSR mismatch.
    // Using a separate effect so Zustand's persist middleware has time to rehydrate.
    useEffect(() => {
        if (!mounted) return;
        // Check if user is logged in by looking for user object (no token check needed)
        const authRaw = localStorage.getItem("repairdesk-auth");
        if (!authRaw) {
            router.replace("/login");
            return;
        }
        try {
            const { state } = JSON.parse(authRaw);
            if (!state?.user) {
                localStorage.removeItem("repairdesk-auth");
                router.replace("/login");
            }
        } catch {
            router.replace("/login");
        }
    }, [mounted]);


    // Fetch shop status and onboarding info
    useEffect(() => {
        if (!user || !mounted) return;
        api.get("/shops/me").then((res) => {
            if (res.data) {
                useShopStore.getState().setShop(res.data);
            }
            setShopStatus(res.data?.shop_status || 'ACTIVE');
            const skipOnboarding = localStorage.getItem("repairdesk_skip_onboarding") === "true";
            if (!res.data?.address && pathname !== "/onboarding" && !skipOnboarding) {
                router.push("/onboarding");
            }
        }).catch((err) => {
            if (err.response?.status === 403) setShopStatus('BLOCKED');
        });
    }, [pathname, user, mounted]);

    // Auto-open settings sub-menu when on a settings page
    useEffect(() => {
        if (pathname.startsWith("/settings")) setSettingsOpen(true);
    }, [pathname]);

    const handleLogout = async () => {
        try { await api.post("/auth/logout"); } catch { /* ignore */ }
        clearAuth();
        router.push("/login");
    };

    const isSettingsActive = pathname.startsWith("/settings");
    // Pick settings items based on user role for RBAC
    const settingsItems = user?.role === "OWNER" ? settingsItemsOwner : settingsItemsTechnician;

    const SidebarContent = ({ onNavClick }: { onNavClick?: () => void }) => (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
            {/* Scrollable nav area */}
            <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', minHeight: 0, display: 'flex', flexDirection: 'column', gap: 4, paddingBottom: 8, scrollbarWidth: 'none' }}>
                <div className="mb-3">
                    <GlobalSearch onSearch={onNavClick} />
                </div>
                {/* Main nav */}
                <nav className="flex flex-col gap-0.5">
                    {navItems.map((item) => (
                        <NavLink key={item.href} {...item} onClick={onNavClick} />
                    ))}

                    {/* Settings group */}
                    <button
                        onClick={() => setSettingsOpen((v) => !v)}
                        className={clsx(
                            "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all w-full",
                            isSettingsActive
                                ? "bg-primary/10 text-primary border border-primary/20"
                                : "text-muted-foreground hover:text-foreground hover:bg-muted"
                        )}
                    >
                        <Settings className="w-5 h-5 flex-shrink-0" />
                        <span className="flex-1 text-left">Settings</span>
                        <ChevronRight className={clsx("w-4 h-4 transition-transform", settingsOpen && "rotate-90")} />
                    </button>

                    {settingsOpen && (
                        <div className="ml-7 flex flex-col gap-0.5 border-l border-border pl-3">
                            {settingsItems.map((item) => (
                                <NavLink key={item.href} {...item} exact onClick={onNavClick} />
                            ))}
                        </div>
                    )}
                </nav>

                {/* PWA install prompt */}
                <PWAInstallPrompt />
            </div>

            {/* User section — always visible at bottom */}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, flexShrink: 0 }}>
                <div className="px-3 mb-2">
                    <p className="text-sm font-medium text-foreground truncate">{user?.full_name}</p>
                    <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                    <span className={clsx(
                        "inline-block mt-1 text-xs px-2 py-0.5 rounded-full border capitalize",
                        user?.role === "OWNER"
                            ? "bg-primary/20 text-primary border-primary/30 font-medium"
                            : "bg-muted text-muted-foreground border-border font-medium"
                    )}>
                        {user?.role?.toLowerCase()}
                    </span>
                </div>
                {/* Theme toggle */}
                <button onClick={toggleTheme}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition mb-1">
                    {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                    {dark ? 'Switch to Light mode' : 'Switch to Dark mode'}
                </button>
                <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-danger hover:bg-danger/10 rounded-lg transition"
                >
                    <LogOut className="w-4 h-4" /> Sign Out
                </button>
            </div>
        </div>
    );

    if (!mounted) {
        return (
            <div className="min-h-[100dvh] flex w-full max-w-[100vw] overflow-x-hidden relative bg-background md:pl-64">
                {/* Skeleton placeholder while client hydrates */}
                <aside className="glass-sidebar hidden md:flex md:flex-col md:w-64 border-r border-border p-4 gap-2 h-screen overflow-hidden fixed top-0 left-0 z-50" />
                <main className="flex-1 flex flex-col min-w-0 w-full max-w-[100vw] overflow-x-hidden" />
            </div>
        );
    }

    return (
        <div className="min-h-[100dvh] w-full max-w-[100vw] overflow-x-hidden flex bg-background md:pl-64" style={{ background: 'var(--background)' }}>
            {/* Desktop Sidebar — iOS 26 glass */}
            <aside
                className="glass-sidebar hidden md:flex md:flex-col md:w-64 p-4 h-screen fixed top-0 left-0 z-50 shrink-0"
                style={{
                    background: 'var(--glass-bg)',
                    backdropFilter: 'blur(28px) saturate(200%)',
                    WebkitBackdropFilter: 'blur(28px) saturate(200%)',
                    borderRight: '1px solid var(--glass-border)',
                    boxShadow: 'var(--glass-shadow)',
                    overflow: 'hidden',
                }}
            >
                {/* Logo + Bell — fixed header inside sidebar */}
                <div className="flex items-center gap-2.5 mb-3 px-1 flex-shrink-0">
                    <div className="rounded-lg w-[140px] xl:w-[160px] h-10 xl:h-12 flex items-center justify-center overflow-hidden flex-shrink-0 px-2 py-1" style={{ background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(8px)' }}>
                        <img src="/logo.png" alt="RepairDeskz" className="w-full h-auto object-contain scale-[1.15]" />
                    </div>
                    <span className="flex-1"></span>
                    <OfflineSyncManager />
                    <NotificationsBell dropdownClassName="fixed top-16 left-64 w-80 max-h-[80vh] shadow-[0_10px_40px_rgba(0,0,0,0.5)]" />
                </div>
                <SidebarContent />
            </aside>

            {/* Mobile top bar — iOS 26 glass */}
            <div className="glass-top-bar md:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-2" style={{ borderBottom: '1px solid var(--glass-border)', boxShadow: 'var(--glass-shadow)' }}>
                <div className="flex items-center gap-2">
                    <div className="bg-white rounded w-[110px] h-7 flex items-center justify-center overflow-hidden shadow-sm p-1">
                        <img src="/logo.png" alt="RepairDeskz" className="w-full h-auto object-contain scale-[1.35]" />
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    <OfflineSyncManager />
                    <button onClick={() => setQrOpen(true)} className="w-11 h-11 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted transition" title="Scan QR Code" aria-label="Scan QR Code">
                        <QrCode className="w-5 h-5" />
                    </button>
                    <NotificationsBell dropdownClassName="fixed top-[60px] left-4 right-4 sm:absolute sm:top-12 sm:left-auto sm:-right-4 sm:w-80 max-h-[70vh] shadow-2xl" />
                    <Link
                        href="/tickets/new"
                        className="flex items-center gap-1 px-3 py-2 rounded-lg gradient-primary text-white text-xs font-medium min-h-[44px]"
                        aria-label="New Ticket"
                    >
                        <Plus className="w-4 h-4" /> New
                    </Link>

                    <button onClick={() => setMobileMenuOpen((v) => !v)} className="w-11 h-11 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition" aria-label="Toggle Mobile Menu">
                        {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                    </button>
                </div>
            </div>

            {/* Mobile drawer — slides in from right when hamburger tapped */}
            {mobileMenuOpen && (
                <div className="md:hidden fixed inset-0 z-[60]">
                    {/* Backdrop — tap to close */}
                    <div
                        className="absolute inset-0"
                        style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
                        onClick={() => setMobileMenuOpen(false)}
                    />
                    {/* Drawer panel */}
                    <div
                        className="absolute top-0 right-0 bottom-0 w-72 flex flex-col p-4 pt-2"
                        style={{
                            background: 'var(--glass-bg)',
                            backdropFilter: 'blur(28px) saturate(200%)',
                            WebkitBackdropFilter: 'blur(28px) saturate(200%)',
                            borderLeft: '1px solid var(--glass-border)',
                            boxShadow: 'var(--glass-shadow)',
                            overflow: 'hidden',
                        }}
                    >
                        <div className="flex justify-end mb-2">
                            <button onClick={() => setMobileMenuOpen(false)} className="w-10 h-10 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition" aria-label="Close Mobile Menu">
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                        <SidebarContent onNavClick={() => setMobileMenuOpen(false)} />
                    </div>
                </div>
            )}

            {/* Bottom nav (mobile) — iOS 26 glass */}
            <nav className="glass-bottom-nav md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around px-2 py-2" style={{ borderTop: '1px solid var(--glass-border)', boxShadow: '0 -4px 24px rgba(0,0,0,0.08)', position: 'fixed' }}>
                {[...navItems.slice(0, 4), { href: "/settings/shop", label: "Settings", icon: Settings }].map((item) => (
                    <BottomNavItem key={item.href} {...item} />
                ))}
            </nav>

            {/* Main content */}
            <main className="flex-1 flex flex-col min-w-0 m-0 p-0 md:m-0 md:p-0 pt-[56px] md:pt-0 pb-[64px] md:pb-0" style={{ position: 'relative', zIndex: 1 }} suppressHydrationWarning>
                {shopStatus === 'BLOCKED' && <BlockedScreen />}
                <ImpersonationBanner />
                <BroadcastBanner />
                <ShopStatusBanner status={shopStatus} />
                <div className="flex-1 overflow-x-hidden">{children}</div>
            </main>

            {qrOpen && <QRScannerModal onClose={() => setQrOpen(false)} />}

            {/* Session Ejection Modal */}
            {sessionEjected && (
                <SessionEjectedModal
                    onDismiss={() => {
                        setSessionEjected(false);
                        clearAuth();
                        router.push('/login');
                    }}
                />
            )}

        </div>
    );
}
