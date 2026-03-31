'use client';
import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import AdminNav from '@/components/admin/AdminNav';
import {
    getShop, getShopTickets, getShopCustomers, getShopTeam, getShopInventory, deleteShop,
    restrictShop, blockShop, deactivateShop, reactivateShop, updateShopNote, resetShopPassword,
    getShopSessions, killShopSession, updateShop,
    type ShopDetail, type TeamMember, type SessionEntry
} from '@/lib/admin-api';
import {
    ArrowLeft, Store, Ticket, Users, Package,
    Phone, Mail, Calendar, Trash2, X, Loader2,
    ShieldOff, ShieldAlert, ShieldX, ShieldCheck, StickyNote, Save, KeyRound, MonitorSmartphone, Zap, Smartphone,
} from 'lucide-react';
import Link from 'next/link';


type Tab = 'tickets' | 'customers' | 'team' | 'inventory' | 'sessions';
type ShopStatus = 'ACTIVE' | 'RESTRICTED' | 'BLOCKED' | 'INACTIVE';

const STATUS_CONFIG: Record<ShopStatus, { label: string; color: string; bg: string; border: string }> = {
    ACTIVE: { label: 'Active', color: '#4ade80', bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.3)' },
    RESTRICTED: { label: 'Restricted', color: '#fb923c', bg: 'rgba(251,146,60,0.12)', border: 'rgba(251,146,60,0.3)' },
    BLOCKED: { label: 'Blocked', color: '#f87171', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.3)' },
    INACTIVE: { label: 'Inactive', color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', border: 'rgba(148,163,184,0.2)' },
};

export default function AdminShopPage() {
    const router = useRouter();
    const { id } = useParams<{ id: string }>();
    const [shop, setShop] = useState<ShopDetail | null>(null);
    const [tab, setTab] = useState<Tab>('tickets');
    const [tabData, setTabData] = useState<any>(null);
    const [tabLoading, setTabLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [showDelete, setShowDelete] = useState(false);
    const [acctLoading, setAcctLoading] = useState<string | null>(null);
    const [note, setNote] = useState('');
    const [noteSaving, setNoteSaving] = useState(false);
    const [showResetPwd, setShowResetPwd] = useState(false);
    const [sessionsData, setSessionsData] = useState<{ total: number; sessions: SessionEntry[] } | null>(null);
    const [killLoading, setKillLoading] = useState<string | null>(null);
    const [sessionsError, setSessionsError] = useState<string | null>(null);
    const [quotaInput, setQuotaInput] = useState<string>('');
    const [quotaSaving, setQuotaSaving] = useState(false);
    const [quotaMsg, setQuotaMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

    useEffect(() => {
        const token = localStorage.getItem('adminToken');
        if (!token) { router.push('/admin/login'); return; }
        loadShop();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    useEffect(() => {
        loadTab();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tab, page, id]);

    async function loadShop() {
        try {
            const data = await getShop(id);
            setShop(data);
            setNote(data.admin_note || '');
            setQuotaInput(data.custom_device_limit !== null && data.custom_device_limit !== undefined ? String(data.custom_device_limit) : '');
            // Pre-load session count so the badge is correct immediately
            try {
                const s = await getShopSessions(id);
                setSessionsData(s);
            } catch { /* silent — sessions will load when tab is clicked */ }
        } catch { router.push('/admin/login'); }
    }

    async function handleAcctAction(action: 'restrict' | 'block' | 'deactivate' | 'reactivate') {
        if (!shop) return;
        const labels: Record<string, string> = {
            restrict: 'Restrict this shop? Owner can log in but cannot modify data.',
            block: 'Block this shop? Owner will NOT be able to log in.',
            deactivate: 'Deactivate this shop? It will be hidden and owner cannot log in.',
            reactivate: 'Restore this shop to Active status?',
        };
        if (!confirm(labels[action])) return;
        setAcctLoading(action);
        try {
            if (action === 'restrict') await restrictShop(id);
            else if (action === 'block') await blockShop(id);
            else if (action === 'deactivate') await deactivateShop(id);
            else await reactivateShop(id);
            await loadShop();
        } finally { setAcctLoading(null); }
    }

    async function handleSaveNote() {
        setNoteSaving(true);
        try { await updateShopNote(id, note); } finally { setNoteSaving(false); }
    }

    async function handleSaveQuota() {
        setQuotaSaving(true);
        setQuotaMsg(null);
        try {
            const value = quotaInput.trim() === '' ? null : parseInt(quotaInput, 10);
            if (value !== null && (isNaN(value) || value < 0)) {
                setQuotaMsg({ type: 'err', text: 'Enter a positive number or leave blank to use plan default.' });
                return;
            }
            await updateShop(id, { custom_device_limit: value });
            setShop(prev => prev ? { ...prev, custom_device_limit: value } : prev);
            setQuotaMsg({ type: 'ok', text: value === null ? 'Reset to plan default.' : `Custom limit set to ${value} session${value !== 1 ? 's' : ''}.` });
        } catch {
            setQuotaMsg({ type: 'err', text: 'Failed to save quota. Please try again.' });
        } finally { setQuotaSaving(false); }
    }

    async function loadTab() {
        if (!id) return;
        setTabLoading(true);
        setSessionsError(null);
        try {
            let data;
            if (tab === 'tickets') data = await getShopTickets(id, { page });
            else if (tab === 'customers') data = await getShopCustomers(id, { page });
            else if (tab === 'team') data = await getShopTeam(id);
            else if (tab === 'sessions') {
                const s = await getShopSessions(id);
                setSessionsData(s);
                return;
            }
            else data = await getShopInventory(id, { page });
            setTabData(data);
        } catch (err: any) {
            if (tab === 'sessions') {
                setSessionsError(err?.response?.data?.detail || 'Failed to load sessions. Check your connection.');
            }
        }
        finally { setTabLoading(false); }
    }

    async function handleKillSession(sessionKey: string) {
        if (!confirm('Force-logout this session? The user will be signed out immediately.')) return;
        setKillLoading(sessionKey);
        try {
            await killShopSession(id, sessionKey);
            const s = await getShopSessions(id);
            setSessionsData(s);
        } catch { } finally { setKillLoading(null); }
    }

    function switchTab(t: Tab) { setTab(t); setPage(1); }

    if (!shop) return <div style={{ color: '#fff', padding: 48 }}>Loading…</div>;

    const tabs: { key: Tab; label: string; icon: any; count: number }[] = [
        { key: 'tickets', label: 'Tickets', icon: Ticket, count: shop.stats.tickets },
        { key: 'customers', label: 'Customers', icon: Users, count: shop.stats.customers },
        { key: 'team', label: 'Team', icon: Users, count: shop.stats.members },
        { key: 'inventory', label: 'Inventory', icon: Package, count: shop.stats.inventory_items },
        { key: 'sessions', label: 'Sessions', icon: MonitorSmartphone, count: sessionsData?.total ?? 0 },
    ];

    return (
        <div className="admin-layout">
            <AdminNav />

            <main className="admin-main">
                {/* Back */}
                <Link href="/admin/dashboard" className="back-link">
                    <ArrowLeft size={16} /> All Shops
                </Link>

                {/* Shop Header */}
                <div className="shop-header">
                    <div className="shop-icon-lg"><Store size={28} /></div>
                    <div style={{ flex: 1 }}>
                        <h1>{shop.name}</h1>
                        {shop.owner && <p className="owner-line">Owner: <strong>{shop.owner.full_name}</strong> · {shop.owner.email}</p>}
                    </div>
                    {/* Status badge */}
                    {(() => {
                        const s = (shop.shop_status || 'ACTIVE') as ShopStatus;
                        const cfg = STATUS_CONFIG[s] || STATUS_CONFIG.ACTIVE;
                        return (
                            <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 14px', borderRadius: 99, background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                                {cfg.label}
                            </span>
                        );
                    })()}
                    <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', flexWrap: 'wrap' }}>
                        <button
                            onClick={() => setShowResetPwd(true)}
                            style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.3)', color: '#a78bfa', borderRadius: 10, padding: '9px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600, transition: 'all 0.2s' }}
                            title="Reset owner password"
                        >
                            <KeyRound size={15} /> Reset Password
                        </button>
                        <button
                            onClick={() => setShowDelete(true)}
                            style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', borderRadius: 10, padding: '9px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600, transition: 'all 0.2s' }}
                            title="Delete this shop"
                        >
                            <Trash2 size={15} /> Delete Shop
                        </button>
                    </div>
                </div>

                {/* Info row */}
                <div className="shop-info-row">
                    {shop.email && <span><Mail size={14} />{shop.email}</span>}
                    {shop.phone && <span><Phone size={14} />{shop.phone}</span>}
                    <span><Calendar size={14} />Joined {new Date(shop.created_at).toLocaleDateString('en-IN')}</span>
                </div>

                {/* ── Account Controls ── */}
                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '20px 24px', marginBottom: 24 }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 16 }}>Account Controls</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
                        {/* Reactivate */}
                        <Btn color="#4ade80" bg="rgba(34,197,94,0.1)" border="rgba(34,197,94,0.25)" onClick={() => handleAcctAction('reactivate')} loading={acctLoading === 'reactivate'} disabled={shop.shop_status === 'ACTIVE'}>
                            <ShieldCheck size={14} /> Reactivate
                        </Btn>
                        {/* Restrict */}
                        <Btn color="#fb923c" bg="rgba(251,146,60,0.1)" border="rgba(251,146,60,0.25)" onClick={() => handleAcctAction('restrict')} loading={acctLoading === 'restrict'} disabled={shop.shop_status === 'RESTRICTED'}>
                            <ShieldAlert size={14} /> Restrict
                        </Btn>
                        {/* Block */}
                        <Btn color="#f87171" bg="rgba(239,68,68,0.1)" border="rgba(239,68,68,0.25)" onClick={() => handleAcctAction('block')} loading={acctLoading === 'block'} disabled={shop.shop_status === 'BLOCKED'}>
                            <ShieldX size={14} /> Block
                        </Btn>
                        {/* Deactivate */}
                        <Btn color="#94a3b8" bg="rgba(148,163,184,0.08)" border="rgba(148,163,184,0.2)" onClick={() => handleAcctAction('deactivate')} loading={acctLoading === 'deactivate'} disabled={shop.shop_status === 'INACTIVE'}>
                            <ShieldOff size={14} /> Deactivate
                        </Btn>
                    </div>
                    {/* Status descriptions */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '6px 24px', marginBottom: 20 }}>
                        {([
                            ['🟢 Active', 'Fully operational'],
                            ['🟠 Restricted', 'Can log in, read-only'],
                            ['🔴 Blocked', 'Cannot log in at all'],
                            ['⚫ Inactive', 'Hidden, cannot log in'],
                        ] as [string, string][]).map(([s, d]) => (
                            <p key={s} style={{ fontSize: 12, color: '#475569', margin: 0 }}><strong style={{ color: '#64748b' }}>{s}</strong> — {d}</p>
                        ))}
                    </div>
                    {/* Admin note */}
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                        <div style={{ flex: 1 }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#64748b', marginBottom: 6 }}><StickyNote size={13} /> Internal Admin Note</label>
                            <input
                                value={note}
                                onChange={e => setNote(e.target.value)}
                                placeholder="e.g. Contacted owner on 24 Feb re: billing..."
                                style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '9px 12px', color: '#e2e8f0', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                            />
                        </div>
                        <button
                            onClick={handleSaveNote}
                            disabled={noteSaving}
                            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.3)', color: '#a78bfa', borderRadius: 8, padding: '9px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}
                        >
                            {noteSaving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={14} />} Save Note
                        </button>
                    </div>
                </div>

                {/* ── Session Quota Panel ── */}
                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '20px 24px', marginBottom: 24 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <Smartphone size={14} style={{ color: '#60a5fa' }} />
                        <p style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em', margin: 0 }}>Session Quota Override</p>
                        {shop.custom_device_limit !== null && shop.custom_device_limit !== undefined && (
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: 'rgba(96,165,250,0.15)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.3)' }}>CUSTOM</span>
                        )}
                    </div>
                    <p style={{ fontSize: 12, color: '#475569', marginBottom: 16, lineHeight: 1.5 }}>
                        Override how many concurrent logged-in sessions {shop.name} is allowed. Leave blank to use the plan default ({shop.plan} plan).
                        Set to <strong style={{ color: '#e2e8f0' }}>0</strong> for unlimited sessions.
                    </p>

                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 160 }}>
                            <input
                                type="number"
                                min="0"
                                value={quotaInput}
                                onChange={e => { setQuotaInput(e.target.value); setQuotaMsg(null); }}
                                placeholder={`Plan default (${shop.plan})`}
                                style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '9px 12px', color: '#e2e8f0', fontSize: 14, outline: 'none', boxSizing: 'border-box', minWidth: 0 }}
                            />
                            <span style={{ fontSize: 12, color: '#475569', whiteSpace: 'nowrap' }}>sessions</span>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button
                                onClick={handleSaveQuota}
                                disabled={quotaSaving}
                                style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(96,165,250,0.15)', border: '1px solid rgba(96,165,250,0.3)', color: '#60a5fa', borderRadius: 8, padding: '9px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}
                            >
                                {quotaSaving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={14} />} Save
                            </button>
                            {(shop.custom_device_limit !== null && shop.custom_device_limit !== undefined) && (
                                <button
                                    onClick={() => { setQuotaInput(''); setQuotaMsg(null); handleSaveQuota(); }}
                                    title="Clear custom override — revert to plan default"
                                    style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.25)', color: '#f87171', borderRadius: 8, padding: '9px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}
                                >
                                    <X size={13} /> Reset
                                </button>
                            )}
                        </div>
                    </div>

                    {quotaMsg && (
                        <p style={{ fontSize: 12, marginTop: 10, color: quotaMsg.type === 'ok' ? '#4ade80' : '#f87171' }}>
                            {quotaMsg.type === 'ok' ? '✓' : '✗'} {quotaMsg.text}
                        </p>
                    )}
                </div>

                {/* Stats */}
                <div className="stat-cards">
                    {tabs.map(({ key, label, icon: Icon, count }) => (
                        <button key={key} className={`stat-card${tab === key ? ' active' : ''}`} onClick={() => switchTab(key)}>
                            <Icon size={20} />
                            <div>
                                <div className="stat-count">{count}</div>
                                <div className="stat-label">{label}</div>
                            </div>
                        </button>
                    ))}
                </div>

                {/* Tab Content */}
                <div className="tab-panel">
                    {tabLoading ? (
                        <div className="tab-loading">Loading {tab}…</div>
                    ) : tab === 'team' ? (
                        <TeamTable members={tabData?.members ?? []} />
                    ) : tab === 'sessions' ? (
                        <SessionsTable
                            sessions={sessionsData?.sessions ?? []}
                            killLoading={killLoading}
                            onKill={handleKillSession}
                            error={sessionsError}
                            onRefresh={() => loadTab()}
                        />
                    ) : (
                        <DataTable tab={tab} data={tabData} page={page} setPage={setPage} />
                    )}
                </div>
            </main>

            {showDelete && shop && (
                <DeleteShopModal
                    shopName={shop.name}
                    shopId={id}
                    onClose={() => setShowDelete(false)}
                    onDeleted={() => router.push('/admin/dashboard')}
                />
            )}

            {showResetPwd && shop && (
                <ResetPasswordModal
                    shopId={id}
                    shopName={shop.name}
                    ownerEmail={shop.owner?.email ?? ''}
                    onClose={() => setShowResetPwd(false)}
                />
            )}

        </div>
    );
}

function TeamTable({ members }: { members: TeamMember[] }) {
    if (!members.length) return <p style={{ color: '#475569', textAlign: 'center', padding: '40px 0' }}>No members.</p>;
    return (
        <div className="admin-table-wrap">
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
                <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                        {['Name', 'Email', 'Role', 'Status', 'Joined'].map(h => (
                            <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 12, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {members.map(m => (
                        <tr key={m.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                            <td style={tdStyle}><strong style={{ color: '#e2e8f0' }}>{m.full_name}</strong></td>
                            <td style={tdStyle}>{m.email}</td>
                            <td style={tdStyle}>
                                <span style={{ background: m.role === 'OWNER' ? 'rgba(167,139,250,0.15)' : 'rgba(99,102,241,0.1)', color: m.role === 'OWNER' ? '#a78bfa' : '#818cf8', padding: '2px 10px', borderRadius: 99, fontSize: 12, fontWeight: 600 }}>
                                    {m.role}
                                </span>
                            </td>
                            <td style={tdStyle}>
                                <span style={{ color: m.is_active ? '#4ade80' : '#f87171', fontSize: 12 }}>
                                    {m.is_active ? 'Active' : 'Inactive'}
                                </span>
                            </td>
                            <td style={tdStyle}>{new Date(m.created_at).toLocaleDateString()}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

const tdStyle: React.CSSProperties = { padding: '12px', fontSize: 14, color: '#94a3b8', verticalAlign: 'middle' };

function SessionsTable({ sessions, killLoading, onKill, error, onRefresh }: {
    sessions: SessionEntry[];
    killLoading: string | null;
    onKill: (sessionKey: string) => void;
    error?: string | null;
    onRefresh?: () => void;
}) {
    if (error) return (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <MonitorSmartphone size={22} style={{ color: '#f87171' }} />
            </div>
            <p style={{ color: '#f87171', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Failed to load sessions</p>
            <p style={{ color: '#64748b', fontSize: 12, marginBottom: 16 }}>{error}</p>
            {onRefresh && (
                <button onClick={onRefresh} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0', borderRadius: 8, padding: '8px 20px', cursor: 'pointer', fontSize: 13 }}>
                    ↺ Retry
                </button>
            )}
        </div>
    );

    const MAX_TTL = 60 * 60 * 24 * 7;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <p style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>
                    {sessions.length === 0 ? 'No active sessions' : `${sessions.length} active session${sessions.length !== 1 ? 's' : ''}`}
                </p>
                {onRefresh && (
                    <button onClick={onRefresh} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#64748b', borderRadius: 7, padding: '4px 12px', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Loader2 size={11} style={{ opacity: 0.6 }} /> Refresh
                    </button>
                )}
            </div>

            {sessions.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.07)', borderRadius: 14 }}>
                    <MonitorSmartphone size={32} style={{ color: '#334155', margin: '0 auto 10px' }} />
                    <p style={{ color: '#475569', fontSize: 13 }}>No active sessions for this shop.</p>
                    <p style={{ color: '#334155', fontSize: 11, marginTop: 4 }}>Users will appear here once they log in.</p>
                </div>
            ) : (
                sessions.map((s) => {
                    const pct = Math.max(0, Math.min(100, (s.ttl_seconds / MAX_TTL) * 100));
                    const isKilling = killLoading === s.session_key;
                    const roleColor = s.user_role === 'OWNER' ? '#a78bfa' : '#818cf8';
                    const roleBg = s.user_role === 'OWNER' ? 'rgba(167,139,250,0.15)' : 'rgba(99,102,241,0.1)';
                    return (
                        <div key={s.session_key} style={{
                            background: 'rgba(255,255,255,0.03)',
                            border: '1px solid rgba(255,255,255,0.07)',
                            borderRadius: 14,
                            padding: '16px 20px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 16,
                            transition: 'border-color 0.2s',
                        }}>
                            {/* Avatar */}
                            <div style={{
                                width: 40, height: 40, borderRadius: '50%',
                                background: roleBg, border: `1px solid ${roleColor}40`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                flexShrink: 0, fontSize: 16, fontWeight: 700, color: roleColor,
                            }}>
                                {s.user_name.charAt(0).toUpperCase()}
                            </div>

                            {/* User info */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                                    <strong style={{ color: '#e2e8f0', fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {s.user_name}
                                    </strong>
                                    <span style={{ background: roleBg, color: roleColor, fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, whiteSpace: 'nowrap' }}>
                                        {s.user_role}
                                    </span>
                                </div>
                                <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>{s.user_email}</p>
                            </div>

                            {/* Session info + TTL bar */}
                            <div style={{ minWidth: 140, flexShrink: 0 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                                    <span style={{ fontSize: 11, color: '#64748b' }}>Started {s.created_ago}</span>
                                    <span style={{ fontSize: 11, color: pct > 30 ? '#4ade80' : '#fb923c' }}>
                                        {Math.round(pct)}% left
                                    </span>
                                </div>
                                <div style={{ height: 4, background: 'rgba(255,255,255,0.07)', borderRadius: 99, overflow: 'hidden' }}>
                                    <div style={{
                                        height: '100%',
                                        width: `${pct}%`,
                                        borderRadius: 99,
                                        background: pct > 50 ? '#4ade80' : pct > 20 ? '#fb923c' : '#f87171',
                                        transition: 'width 0.4s',
                                    }} />
                                </div>
                                <p style={{ fontSize: 10, color: '#475569', marginTop: 4 }}>
                                    Session: <code style={{ letterSpacing: '0.03em' }}>{s.session_id.split('-')[0]}…</code>
                                </p>
                            </div>

                            {/* Kill button */}
                            <button
                                onClick={() => onKill(s.session_key)}
                                disabled={isKilling}
                                title="Force-logout this session"
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 6,
                                    background: isKilling ? 'rgba(239,68,68,0.05)' : 'rgba(239,68,68,0.1)',
                                    border: '1px solid rgba(239,68,68,0.3)',
                                    color: '#f87171', borderRadius: 9, padding: '8px 14px',
                                    cursor: isKilling ? 'wait' : 'pointer',
                                    fontSize: 12, fontWeight: 600, flexShrink: 0, transition: 'all 0.2s',
                                }}
                            >
                                {isKilling
                                    ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Killing…</>
                                    : <><Zap size={13} /> Kill</>}
                            </button>
                        </div>
                    );
                })
            )}
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}

function Btn({ color, bg, border, onClick, loading, disabled, children }: {
    color: string; bg: string; border: string; onClick: () => void;
    loading: boolean; disabled: boolean; children: React.ReactNode;
}) {
    return (
        <button
            onClick={onClick}
            disabled={loading || disabled}
            style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: disabled ? 'rgba(255,255,255,0.04)' : bg,
                border: `1px solid ${disabled ? 'rgba(255,255,255,0.08)' : border}`,
                color: disabled ? '#334155' : color,
                borderRadius: 8, padding: '8px 16px', cursor: disabled || loading ? 'not-allowed' : 'pointer',
                fontSize: 13, fontWeight: 600, transition: 'all 0.2s',
            }}
        >
            {loading ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : null}
            {children}
        </button>
    );
}

function DataTable({ tab, data, page, setPage }: { tab: Tab; data: any; page: number; setPage: (p: number) => void }) {
    if (!data) return null;
    const items = tab === 'team' ? data.members : data.items;
    if (!items?.length) return <p style={{ color: '#475569', textAlign: 'center', padding: '40px 0' }}>No data.</p>;

    const total = data.total || 0;
    const perPage = data.per_page || 20;
    const totalPages = Math.max(1, Math.ceil(total / perPage));

    const { id } = useParams<{ id: string }>();

    const columns: Record<Tab, string[]> = {
        tickets: ['#', 'Device', 'Issue', 'Status', 'Cost', 'Date', ''],
        customers: ['Name', 'Phone', 'Email', 'Joined'],
        team: [],
        inventory: ['Name', 'SKU', 'Qty', 'Price', 'Low Stock'],
        sessions: [],
    };

    return (
        <>
            <div className="admin-table-wrap">
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
                <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                        {columns[tab].map(h => (
                            <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 12, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {items.map((row: any) => (
                        <tr key={row.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                            {tab === 'tickets' && <>
                                <td style={tdStyle}>#{row.ticket_number}</td>
                                <td style={tdStyle}><strong style={{ color: '#e2e8f0' }}>{row.device_type}</strong>{row.device_model ? <small style={{ color: '#475569' }}> · {row.device_model}</small> : null}</td>
                                <td style={{ ...tdStyle, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.reported_issue}</td>
                                <td style={tdStyle}><StatusBadge status={row.status} /></td>
                                <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{row.final_cost ? `Rs.${Number(row.final_cost).toLocaleString('en-IN')}` : row.estimated_cost ? `~Rs.${Number(row.estimated_cost).toLocaleString('en-IN')}` : '–'}</td>
                                <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{new Date(row.created_at).toLocaleDateString()}</td>
                                <td style={tdStyle}>
                                    <Link href={`/admin/shops/${id}/tickets/${row.id}`} style={{ color: '#a78bfa', textDecoration: 'none', fontSize: 13, fontWeight: 500 }}>
                                        View
                                    </Link>
                                </td>
                            </>}
                            {tab === 'customers' && <>
                                <td style={tdStyle}><strong style={{ color: '#e2e8f0' }}>{row.name}</strong></td>
                                <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{row.phone}</td>
                                <td style={tdStyle}>{row.email || '–'}</td>
                                <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{new Date(row.created_at).toLocaleDateString()}</td>
                            </>}
                            {tab === 'inventory' && <>
                                <td style={tdStyle}><strong style={{ color: '#e2e8f0' }}>{row.name}</strong></td>
                                <td style={tdStyle}><code style={{ fontSize: 12 }}>{row.sku || '–'}</code></td>
                                <td style={tdStyle}>{row.quantity}</td>
                                <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>Rs.{Number(row.selling_price).toLocaleString('en-IN')}</td>
                                <td style={tdStyle}><span style={{ color: row.is_low_stock ? '#fb923c' : '#4ade80', fontSize: 12 }}>{row.is_low_stock ? '⚠ Low' : '✓ OK'}</span></td>
                            </>}
                        </tr>
                    ))}
                </tbody>
            </table>
            </div>
            {totalPages > 1 && (
                <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 20 }}>
                    <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0', borderRadius: 8, padding: '6px 16px', cursor: 'pointer', fontSize: 13 }}>← Prev</button>
                    <span style={{ color: '#64748b', fontSize: 13, alignSelf: 'center' }}>Page {page} of {totalPages}</span>
                    <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0', borderRadius: 8, padding: '6px 16px', cursor: 'pointer', fontSize: 13 }}>Next →</button>
                </div>
            )}
        </>
    );
}

function StatusBadge({ status }: { status: string | undefined }) {
    const colors: Record<string, string> = {
        RECEIVED: '#60a5fa', IN_PROGRESS: '#fb923c', WAITING_PARTS: '#facc15',
        READY: '#4ade80', DELIVERED: '#a78bfa', CANCELLED: '#f87171',
    };
    if (!status) return <span style={{ color: '#94a3b8', fontSize: 11 }}>—</span>;
    return (
        <span style={{ background: `${colors[status] ?? '#94a3b8'}22`, color: colors[status] ?? '#94a3b8', padding: '2px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600 }}>
            {status.replace(/_/g, ' ')}
        </span>
    );
}

function ResetPasswordModal({ shopId, shopName, ownerEmail, onClose }: {
    shopId: string; shopName: string; ownerEmail: string; onClose: () => void;
}) {
    const [newPwd, setNewPwd] = useState('');
    const [confirm, setConfirm] = useState('');
    const [saving, setSaving] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const match = newPwd === confirm && newPwd.length >= 6;

    async function handleReset() {
        if (!match) return;
        setSaving(true);
        setError(null);
        try {
            await resetShopPassword(shopId, newPwd);
            setSuccess(true);
        } catch (err: any) {
            setError(err?.response?.data?.detail || 'Failed to reset password.');
        } finally { setSaving(false); }
    }

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
            <div style={{ background: '#1a1d27', border: '1px solid rgba(167,139,250,0.3)', borderRadius: 20, padding: 36, width: '100%', maxWidth: 440, boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#a78bfa', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <KeyRound size={20} /> Reset Password
                    </h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}><X size={20} /></button>
                </div>
                <p style={{ color: '#64748b', fontSize: 13, marginBottom: 24 }}>
                    Set a new password for <strong style={{ color: '#e2e8f0' }}>{ownerEmail}</strong> ({shopName})
                </p>

                {success ? (
                    <div style={{ textAlign: 'center', padding: '20px 0' }}>
                        <p style={{ color: '#4ade80', fontSize: 16, fontWeight: 600 }}>✓ Password reset successfully!</p>
                        <button onClick={onClose} style={{ marginTop: 16, background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.3)', color: '#a78bfa', borderRadius: 10, padding: '10px 24px', cursor: 'pointer', fontSize: 14 }}>Close</button>
                    </div>
                ) : (
                    <>
                        {error && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '10px 14px', color: '#f87171', fontSize: 13, marginBottom: 16 }}>{error}</div>}

                        <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 6 }}>New Password (min 6 characters)</label>
                        <input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} placeholder="New password"
                            style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 14px', color: '#e2e8f0', fontSize: 14, outline: 'none', boxSizing: 'border-box', marginBottom: 12 }}
                        />
                        <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 6 }}>Confirm New Password</label>
                        <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Confirm password"
                            style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: `1px solid ${confirm && !match ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 10, padding: '10px 14px', color: '#e2e8f0', fontSize: 14, outline: 'none', boxSizing: 'border-box', marginBottom: 24 }}
                        />
                        {confirm && newPwd !== confirm && <p style={{ fontSize: 12, color: '#f87171', marginBottom: 12, marginTop: -18 }}>Passwords do not match</p>}

                        <div style={{ display: 'flex', gap: 12 }}>
                            <button onClick={onClose} style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', borderRadius: 10, padding: '11px 0', cursor: 'pointer', fontSize: 14 }}>Cancel</button>
                            <button onClick={handleReset} disabled={!match || saving}
                                style={{ flex: 2, background: match ? 'rgba(124,58,237,0.8)' : 'rgba(124,58,237,0.2)', color: match ? '#fff' : '#a78bfa60', border: 'none', borderRadius: 10, padding: '11px 0', cursor: match && !saving ? 'pointer' : 'not-allowed', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all 0.2s' }}>
                                {saving ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Resetting…</> : '🔑 Reset Password'}
                            </button>
                        </div>
                    </>
                )}
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
        </div>
    );
}

function DeleteShopModal({ shopName, shopId, onClose, onDeleted }: {
    shopName: string; shopId: string; onClose: () => void; onDeleted: () => void;
}) {

    const [confirm, setConfirm] = useState('');
    const [deleting, setDeleting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const match = confirm === shopName;

    async function handleDelete() {
        if (!match) return;
        setDeleting(true);
        setError(null);
        try {
            await deleteShop(shopId);
            onDeleted();
        } catch (err: any) {
            setError(err?.response?.data?.detail || 'Failed to delete shop');
            setDeleting(false);
        }
    }

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
            <div style={{ background: '#1a1d27', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 20, padding: 36, width: '100%', maxWidth: 460, boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                    <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#f87171' }}>Delete Shop</h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}><X size={20} /></button>
                </div>

                <p style={{ color: '#94a3b8', fontSize: 14, lineHeight: 1.6, margin: '0 0 16px' }}>
                    This will <strong style={{ color: '#f87171' }}>permanently delete</strong> the shop <strong style={{ color: '#fff' }}>{shopName}</strong> and ALL its data — tickets, customers, team members, and inventory. This cannot be undone.
                </p>

                {error && (
                    <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '10px 14px', color: '#f87171', fontSize: 13, marginBottom: 16 }}>{error}</div>
                )}

                <label style={{ display: 'block', fontSize: 13, color: '#64748b', marginBottom: 8 }}>
                    Type <strong style={{ color: '#e2e8f0' }}>{shopName}</strong> to confirm:
                </label>
                <input
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder={shopName}
                    style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: `1px solid ${match ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 10, padding: '10px 14px', color: '#e2e8f0', fontSize: 14, outline: 'none', boxSizing: 'border-box', marginBottom: 24 }}
                />

                <div style={{ display: 'flex', gap: 12 }}>
                    <button onClick={onClose} style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', borderRadius: 10, padding: '11px 0', cursor: 'pointer', fontSize: 14 }}>Cancel</button>
                    <button
                        onClick={handleDelete}
                        disabled={!match || deleting}
                        style={{ flex: 2, background: match ? 'rgba(239,68,68,0.8)' : 'rgba(239,68,68,0.2)', color: match ? '#fff' : '#f8717160', border: 'none', borderRadius: 10, padding: '11px 0', cursor: match && !deleting ? 'pointer' : 'not-allowed', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all 0.2s' }}
                    >
                        {deleting ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Deleting…</> : '🗑 Delete Permanently'}
                    </button>
                </div>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
        </div>
    );
}
