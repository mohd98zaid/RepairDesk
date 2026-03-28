'use client';
import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
    LayoutDashboard, Store, LogOut, ShieldCheck, TrendingUp,
    ClipboardList, Megaphone, Search, X, Loader2, CreditCard
} from 'lucide-react';
import { globalSearch, impersonateShop, type SearchResult } from '@/lib/admin-api';
import { useAuthStore } from '@/store/authStore';

const links = [
    { href: '/admin/dashboard', label: 'Shops', icon: LayoutDashboard },
    { href: '/admin/analytics', label: 'Analytics', icon: TrendingUp },
    { href: '/admin/plans', label: 'Plans & Billing', icon: CreditCard },
    { href: '/admin/audit-logs', label: 'Audit Log', icon: ClipboardList },
    { href: '/admin/broadcast', label: 'Broadcast', icon: Megaphone },
];

const TYPE_ICON: Record<string, string> = { shop: '🏪', user: '👤', ticket: '🎫' };

export default function AdminNav() {
    const pathname = usePathname();
    const router = useRouter();
    const [q, setQ] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [searching, setSearching] = useState(false);
    const [open, setOpen] = useState(false);
    const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    function handleLogout() {
        localStorage.removeItem('adminToken');
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
            // Store impersonation token in sessionStorage and redirect
            sessionStorage.setItem('impersonationToken', data.access_token);
            sessionStorage.setItem('impersonationShop', data.shop_name);
            sessionStorage.setItem('impersonationEmail', data.owner_email);
            // Open shop app in new tab with impersonation
            window.open(`http://localhost:3000/impersonate?token=${data.access_token}&shop=${encodeURIComponent(data.shop_name)}`, '_blank');
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

    return (
        <aside className="admin-nav">
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

                {open && results.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 12, right: 12, background: '#1a1d27', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, boxShadow: '0 16px 40px rgba(0,0,0,0.5)', zIndex: 200, overflow: 'hidden', marginTop: 4 }}>
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
                        {open && results.length === 0 && q.length >= 2 && !searching && (
                            <div style={{ padding: '14px', color: '#475569', fontSize: 13, textAlign: 'center' }}>No results for "{q}"</div>
                        )}
                    </div>
                )}
            </div>

            {/* Nav Links */}
            <nav className="admin-nav__links">
                {links.map(({ href, label, icon: Icon }) => (
                    <Link
                        key={href}
                        href={href}
                        className={`admin-nav__link${pathname.startsWith(href) ? ' active' : ''}`}
                    >
                        <Icon size={18} />
                        {label}
                    </Link>
                ))}

                <a
                    href="http://localhost:8000/api/v1/sqladmin"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="admin-nav__link mt-4 border-t border-border/50 pt-4"
                >
                    <Store size={18} />
                    Database Viewer
                </a>
                <a
                    href="http://localhost:8000/docs"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="admin-nav__link"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>
                    FastAPI Docs
                </a>
            </nav>

            <button className="admin-nav__logout" onClick={handleLogout}>
                <LogOut size={16} />
                Sign Out
            </button>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </aside>
    );
}
