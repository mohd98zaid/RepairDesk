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
import { isTokenExpired } from "@/lib/api/client";
import { useAuthStore } from "@/store/authStore";
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

const settingsItems = [
    { href: "/settings/shop", label: "Shop", icon: Store },
    { href: "/settings/team", label: "Team", icon: Users },
    { href: "/settings/sessions", label: "Sessions", icon: MonitorSmartphone },
    { href: "/settings/activity", label: "Activity Log", icon: Activity },
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

function NotificationsBell() {
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
        const token = localStorage.getItem('token');
        if (!token) return;

        // Use native EventSource to connect to our FastAPI SSE endpoint
        // NOTE: Standard EventSource does not support passing headers (like Authorization: Bearer).
        // For secure SSE, the backend should accept a signed token via query parameter or cookie.
        // As a simple workaround for this implementation phase, we pass the token in the URL query string.
        const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
        const evtSource = new EventSource(`${baseUrl}/notifications/stream?token=${token}`);

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
            // EventSource will automatically attempt to reconnect
        };

        return () => {
            evtSource.close();
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
        <div ref={ref} style={{ position: 'relative' }}>
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
                <div className="absolute left-0 top-10 w-72 bg-card border border-border rounded-xl shadow-2xl z-50 overflow-hidden">
                    <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                        <span className="text-sm font-semibold text-foreground">Notifications</span>
                        {notifs.length > 0 && <button onClick={markAllRead} className="text-xs text-indigo-400 hover:text-indigo-300">Mark all read</button>}
                    </div>
                    {notifs.length === 0 ? (
                        <div className="px-4 py-8 text-center">
                            <CheckCircle className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-50" />
                            <p className="text-xs text-muted-foreground opacity-80">All caught up! 🎉</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-border">
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
interface Broadcast { id: string; title: string; message: string; type: string; }

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

    const visible = broadcasts.filter(b => !dismissed.has(b.id));
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
        <div style={{ position: 'fixed', inset: 0, background: '#09090b', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div style={{ maxWidth: 400, textAlign: 'center' }}>
                <div style={{ width: 64, height: 64, borderRadius: 20, background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', color: '#ef4444' }}>
                    <AlertTriangle size={32} />
                </div>
                <h1 style={{ color: '#fff', fontSize: 24, fontWeight: 700, marginBottom: 12 }}>Access Denied</h1>
                <p style={{ color: '#94a3b8', lineHeight: 1.6, marginBottom: 32 }}>
                    Your repair shop account has been blocked by administrators.
                    You can no longer access the platform or perform any operations.
                </p>
                <button
                    onClick={() => { localStorage.removeItem('repairdesk-auth'); window.location.href = '/login'; }}
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '10px 24px', borderRadius: 10, cursor: 'pointer', fontWeight: 600 }}>
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
// Delay before the very first heartbeat — increased to 30s to ensure
// cross-origin httpOnly cookie is fully committed by the browser.
const HEARTBEAT_WARMUP_MS = 30_000;

function useSessionHeartbeat(onEvicted: () => void) {
    const onEvictedRef = useRef(onEvicted);
    useEffect(() => { onEvictedRef.current = onEvicted; }, [onEvicted]);

    useEffect(() => {
        let destroyed = false;

        async function heartbeat() {
            if (destroyed) return;

            // Skip heartbeat if no access token is stored
            try {
                const raw = localStorage.getItem("repairdesk-auth");
                if (!raw) return;
                const { state } = JSON.parse(raw);
                if (!state?.accessToken) return;
            } catch { return; }

            try {
                // Try to get refresh token from localStorage as fallback
                let body = '{}';
                try {
                    const raw = localStorage.getItem("repairdesk-auth");
                    if (raw) {
                        const { state } = JSON.parse(raw);
                        if (state?.refreshToken) {
                            body = JSON.stringify({ refresh_token: state.refreshToken });
                        }
                    }
                } catch { /* ignore */ }

                const res = await fetch(`${API_URL}/auth/refresh`, {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body,
                });
                if (res.status === 401) {
                    if (!destroyed) onEvictedRef.current();
                }
            } catch {
                // Network offline — silently skip
            }
        }

        const interval = setInterval(heartbeat, HEARTBEAT_INTERVAL_MS);
        const warmup = setTimeout(heartbeat, HEARTBEAT_WARMUP_MS);

        // Also listen for session-kill BroadcastChannel messages (cross-tab)
        let bc: BroadcastChannel | null = null;
        try {
            bc = new BroadcastChannel('session_killed');
            bc.onmessage = () => { if (!destroyed) onEvictedRef.current(); };
        } catch { /* ignore — not supported in all browsers */ }

        return () => {
            destroyed = true;
            clearInterval(interval);
            clearTimeout(warmup);
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
        // Auth guard — redirect to login if no token or expired token
        const raw = localStorage.getItem("repairdesk-auth");
        if (!raw) {
            router.push("/login");
            return;
        }
        try {
            const { state } = JSON.parse(raw);
            if (!state?.accessToken) {
                localStorage.removeItem("repairdesk-auth");
                router.push("/login");
            }
        } catch {
            router.push("/login");
        }
    }, []);


    // Fetch shop status and onboarding info
    useEffect(() => {
        if (!user || !mounted) return;
        api.get("/shops/me").then((res) => {
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

    const SidebarContent = ({ onNavClick }: { onNavClick?: () => void }) => (
        <>
            <div className="mb-4">
                <GlobalSearch onSearch={onNavClick} />
            </div>
            {/* Main nav */}
            <nav className="flex flex-col gap-1 flex-1">
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

            {/* User section */}
            <div className="border-t border-border pt-4 mt-2">
                <div className="px-3 mb-3">
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
        </>
    );

    if (!mounted) {
        return (
            <div className="min-h-[100dvh] flex bg-background">
                {/* Skeleton placeholder while client hydrates */}
                <aside className="hidden md:flex flex-col w-64 border-r border-border p-4 gap-2 h-screen" />
                <main className="flex-1 flex flex-col min-w-0" />
            </div>
        );
    }

    return (
        <div className="min-h-[100dvh] flex bg-background">
            {/* Desktop Sidebar */}
            <aside className="hidden md:flex flex-col w-64 border-r border-border bg-card p-4 gap-2 h-screen overflow-y-auto sticky top-0">
                {/* Logo + Bell */}
                <div className="flex items-center gap-2.5 mb-4 px-1">
                    <img src="/logo.png" alt="RepairDeskz" className="h-8 w-auto object-contain bg-white rounded-md flex-shrink-0" />
                    <span className="flex-1"></span>
                    <OfflineSyncManager />
                    <NotificationsBell />
                </div>
                <SidebarContent />
            </aside>

            {/* Mobile top bar */}
            <div className="md:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-3 bg-card/90 backdrop-blur-md border-b border-border">
                <div className="flex items-center gap-2">
                    <img src="/logo.png" alt="RepairDeskz" className="h-7 w-auto object-contain bg-white rounded shadow-sm" />
                </div>
                <div className="flex items-center gap-1">
                    <OfflineSyncManager />
                    <button onClick={() => setQrOpen(true)} className="w-11 h-11 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted transition" title="Scan QR Code" aria-label="Scan QR Code">
                        <QrCode className="w-5 h-5" />
                    </button>
                    <NotificationsBell />
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

            {/* Mobile drawer */}
            {mobileMenuOpen && (
                <div className="md:hidden fixed inset-0 z-40 pt-14">
                    <div className="absolute inset-0 bg-black/60" onClick={() => setMobileMenuOpen(false)} />
                    <div className="absolute top-14 right-0 bottom-0 w-72 bg-card border-l border-border p-4 flex flex-col gap-1 overflow-y-auto shadow-2xl">
                        <SidebarContent onNavClick={() => setMobileMenuOpen(false)} />
                    </div>
                </div>
            )}

            {/* Bottom nav (mobile) — 5 most important pages */}
            <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-card/90 backdrop-blur-md border-t border-border flex items-center justify-around px-2 py-2">
                {[...navItems.slice(0, 4), { href: "/settings/shop", label: "Settings", icon: Settings }].map((item) => (
                    <BottomNavItem key={item.href} {...item} />
                ))}
            </nav>

            {/* Main content */}
            <main className="flex-1 flex flex-col min-w-0 md:ml-0 pt-14 md:pt-0 pb-16 md:pb-0" suppressHydrationWarning>
                {shopStatus === 'BLOCKED' && <BlockedScreen />}
                <ImpersonationBanner />
                <BroadcastBanner />
                <ShopStatusBanner status={shopStatus} />
                <div className="flex-1 overflow-auto">{children}</div>
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
