'use client';
import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
    LayoutDashboard, Store, LogOut, ShieldCheck, TrendingUp,
    ClipboardList, Megaphone, Search, X, Loader2, CreditCard, Menu, Database, Server
} from 'lucide-react';
import { globalSearch, impersonateShop, adminLogout, type SearchResult } from '@/lib/admin-api';

const links = [
    { href: '/admin/dashboard', label: 'Shops',    icon: LayoutDashboard },
    { href: '/admin/analytics', label: 'Analytics', icon: TrendingUp },
    { href: '/admin/plans',     label: 'Plans',      icon: CreditCard },
    { href: '/admin/audit-logs',label: 'Audit Log',  icon: ClipboardList },
    { href: '/admin/broadcast', label: 'Broadcast',  icon: Megaphone },
    { href: '/admin/api-viewer', label: 'API Viewer', icon: Server },
    { href: '/admin/db-viewer', label: 'DB Viewer', icon: Database },
];

const TYPE_ICON: Record<string, string> = { shop: '🏪', user: '👤', ticket: '🎫' };

export default function AdminNav() {
    const pathname = usePathname();
    const router = useRouter();
    const [q, setQ] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [searching, setSearching] = useState(false);
    const [open, setOpen] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    async function handleLogout() {
        try { await adminLogout(); } catch { /* ignore */ }
        window.location.href = '/admin/login';
    }

    useEffect(() => {
        if (q.length < 2) { setResults([]); setOpen(false); return; }
        if (debounce.current) clearTimeout(debounce.current);
        debounce.current = setTimeout(async () => {
            setSearching(true);
            try {
                const data = await globalSearch(q);
                setResults(data.results);
                setOpen(true);
            } catch { /* ignore */ }
            finally { setSearching(false); }
        }, 350);
        return () => { if (debounce.current) clearTimeout(debounce.current); };
    }, [q]);

    async function handleImpersonate(shopId: string) {
        try {
            const data = await impersonateShop(shopId);
            sessionStorage.setItem('impersonationToken', data.access_token);
            sessionStorage.setItem('impersonationShop', data.shop_name);
            sessionStorage.setItem('impersonationEmail', data.owner_email);
            // Use the frontend URL from env — not hardcoded localhost
            const frontendBase = process.env.NEXT_PUBLIC_FRONTEND_URL || window.location.origin;
            window.open(`${frontendBase}/impersonate?token=${data.access_token}&shop=${encodeURIComponent(data.shop_name)}`, '_blank');
            setOpen(false); setQ('');
        } catch (e: any) {
            alert(e?.response?.data?.detail || 'Impersonation failed.');
        }
    }

    function navigateResult(r: SearchResult) {
        if (r.type === 'shop') router.push(`/admin/shops/${r.id}`);
        else if (r.type === 'user' && r.shop_id) router.push(`/admin/shops/${r.shop_id}`);
        else if (r.type === 'ticket' && r.shop_id) router.push(`/admin/shops/${r.shop_id}`);
        setOpen(false); setQ('');
    }

    const SearchDropdown = () => open && results.length > 0 ? (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#1a1d27', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, boxShadow: '0 16px 40px rgba(0,0,0,0.5)', zIndex: 300, overflow: 'hidden', marginTop: 4 }}>
            {results.map(r => (
                <div key={r.id} style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: 10 }}
                    onClick={() => navigateResult(r)}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <span style={{ fontSize: 16 }}>{TYPE_ICON[r.type]}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: 12, color: '#e2e8f0', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</p>
                        <p style={{ margin: 0, fontSize: 11, color: '#475569' }}>{r.subtitle}</p>
                    </div>
                    {r.type === 'shop' && (
                        <button onClick={e => { e.stopPropagation(); handleImpersonate(r.id); }}
                            style={{ background: 'rgba(124,58,237,0.2)', border: '1px solid rgba(124,58,237,0.3)', color: '#a78bfa', borderRadius: 6, padding: '3px 8px', fontSize: 10, cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}>
                            Login as
                        </button>
                    )}
                </div>
            ))}
        </div>
    ) : null;

    return (
        <>
            {/* ── DESKTOP sidebar (hidden on mobile) ───────────────────── */}
            <aside className="admin-nav admin-nav--desktop fixed z-50">
                <div className="admin-nav__brand">
                    <ShieldCheck size={22} />
                    <span>RepairDesk<br /><small>Admin Panel</small></span>
                </div>

                {/* Global Search */}
                <div style={{ padding: '0 12px', marginBottom: 8, position: 'relative' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '8px 12px' }}>
                        {searching
                            ? <Loader2 size={14} style={{ color: '#64748b', animation: 'spin 1s linear infinite', flexShrink: 0 }} />
                            : <Search size={14} style={{ color: '#64748b', flexShrink: 0 }} />}
                        <input
                            ref={inputRef}
                            value={q}
                            onChange={e => setQ(e.target.value)}
                            placeholder="Search shops, users…"
                            style={{ background: 'none', border: 'none', outline: 'none', color: '#e2e8f0', fontSize: 13, width: '100%' }}
                        />
                        {q && <button onClick={() => { setQ(''); setOpen(false); }} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', padding: 0 }}><X size={13} /></button>}
                    </div>
                    <SearchDropdown />
                </div>

                {/* Nav Links */}
                <nav className="admin-nav__links">
                    {links.map(({ href, label, icon: Icon }) => (
                        <Link key={href} href={href} className={`admin-nav__link${pathname.startsWith(href) ? ' active' : ''}`}>
                            <Icon size={18} />{label}
                        </Link>
                    ))}
                </nav>

                <button className="admin-nav__logout" onClick={handleLogout}>
                    <LogOut size={16} />Sign Out
                </button>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </aside>

            {/* ── MOBILE top bar (hidden on desktop) ───────────────────── */}
            <div className="admin-mobile-topbar">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <ShieldCheck size={18} color="#a78bfa" />
                    <span style={{ fontWeight: 700, fontSize: 15, color: '#a78bfa' }}>Admin</span>
                </div>

                {/* Inline compact search */}
                <div style={{ flex: 1, maxWidth: 200, position: 'relative' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '6px 10px' }}>
                        {searching ? <Loader2 size={13} style={{ color: '#64748b', animation: 'spin 1s linear infinite', flexShrink: 0 }} /> : <Search size={13} style={{ color: '#64748b', flexShrink: 0 }} />}
                        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search…"
                            style={{ background: 'none', border: 'none', outline: 'none', color: '#e2e8f0', fontSize: 12, width: '100%' }} />
                        {q && <button onClick={() => { setQ(''); setOpen(false); }} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', padding: 0 }}><X size={12} /></button>}
                    </div>
                    <SearchDropdown />
                </div>

                <button onClick={() => setMobileMenuOpen(v => !v)} style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0', borderRadius: 8, padding: 7, display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                    {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
                </button>
            </div>

            {/* Mobile slide-down menu */}
            {mobileMenuOpen && (
                <div className="admin-mobile-menu" onClick={() => setMobileMenuOpen(false)}>
                    <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '8px 12px' }}>
                        {links.map(({ href, label, icon: Icon }) => (
                            <Link key={href} href={href} className={`admin-nav__link${pathname.startsWith(href) ? ' active' : ''}`} style={{ fontSize: 14 }}>
                                <Icon size={17} />{label}
                            </Link>
                        ))}
                    </nav>
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', padding: '8px 12px' }}>
                        <button className="admin-nav__logout" onClick={handleLogout} style={{ width: '100%', justifyContent: 'center' }}>
                            <LogOut size={16} />Sign Out
                        </button>
                    </div>
                </div>
            )}

            {/* ── MOBILE bottom tab bar ─────────────────────────────────── */}
            <nav className="admin-bottom-tabs">
                {links.map(({ href, label, icon: Icon }) => {
                    const active = pathname.startsWith(href);
                    return (
                        <Link key={href} href={href} className={`admin-tab-item${active ? ' active' : ''}`}>
                            <Icon size={20} />
                            <span>{label}</span>
                        </Link>
                    );
                })}
                <button className="admin-tab-item" onClick={handleLogout} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                    <LogOut size={20} />
                    <span>Sign Out</span>
                </button>
            </nav>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </>
    );
}
