'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminNav from '@/components/admin/AdminNav';
import { getAuditLogs, type AuditEntry } from '@/lib/admin-api';
import { ClipboardList, RefreshCw } from 'lucide-react';

const ACTION_COLORS: Record<string, string> = {
    IMPERSONATE: '#a78bfa',
    EXPORT: '#60a5fa',
    BROADCAST: '#fbbf24',
    BULK_ACTION: '#f87171',
    RESTRICT: '#fbbf24',
    BLOCK: '#f87171',
    REACTIVATE: '#4ade80',
    DEACTIVATE: '#94a3b8',
};

export default function AuditLogsPage() {
    const router = useRouter();
    const [logs, setLogs] = useState<AuditEntry[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const PER_PAGE = 50;

    useEffect(() => {
        if (!localStorage.getItem('adminToken')) { router.push('/admin/login'); return; }
        load();
    }, [page]);

    async function load() {
        setLoading(true);
        try {
            const data = await getAuditLogs(page, PER_PAGE);
            setLogs(data.items);
            setTotal(data.total);
        } catch { router.push('/admin/login'); }
        finally { setLoading(false); }
    }

    const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

    function fmt(ts: string) {
        const d = new Date(ts);
        return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    }

    return (
        <div className="admin-layout">
            <AdminNav />
            <main className="admin-main">
                <header className="admin-header">
                    <div>
                        <h1 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <ClipboardList size={22} style={{ color: '#60a5fa' }} /> Audit Log
                        </h1>
                        <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0' }}>{total} admin actions recorded this session</p>
                    </div>
                    <button onClick={load} disabled={loading} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                        <RefreshCw size={15} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} /> Refresh
                    </button>
                </header>

                {loading ? (
                    <div style={{ textAlign: 'center', padding: 80, color: '#475569' }}>Loading audit log…</div>
                ) : logs.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 80, color: '#475569' }}>
                        <ClipboardList size={40} style={{ opacity: 0.3, display: 'block', margin: '0 auto 12px' }} />
                        <p>No audit entries yet.</p>
                        <p style={{ fontSize: 13 }}>Actions like impersonation, CSV exports, and bulk operations will appear here.</p>
                    </div>
                ) : (
                    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                                    {['Action', 'Admin', 'Target', 'Detail', 'Timestamp'].map(h => (
                                        <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {logs.map((log, i) => (
                                    <tr key={log.id} style={{ borderBottom: i < logs.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none', transition: 'background 0.15s' }}
                                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                        <td style={{ padding: '12px 16px' }}>
                                            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99, background: `${ACTION_COLORS[log.action] || '#94a3b8'}20`, color: ACTION_COLORS[log.action] || '#94a3b8' }}>
                                                {log.action}
                                            </span>
                                        </td>
                                        <td style={{ padding: '12px 16px', fontSize: 13, color: '#94a3b8' }}>{log.admin}</td>
                                        <td style={{ padding: '12px 16px', fontSize: 12, color: '#64748b', fontFamily: 'monospace' }}>{log.target || '—'}</td>
                                        <td style={{ padding: '12px 16px', fontSize: 13, color: '#e2e8f0', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.detail || '—'}</td>
                                        <td style={{ padding: '12px 16px', fontSize: 12, color: '#475569', whiteSpace: 'nowrap' }}>{fmt(log.timestamp)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {totalPages > 1 && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 24 }}>
                        <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0', borderRadius: 8, padding: '8px 18px', cursor: 'pointer', fontSize: 14 }}>← Prev</button>
                        <span style={{ fontSize: 14, color: '#64748b' }}>Page {page} of {totalPages}</span>
                        <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0', borderRadius: 8, padding: '8px 18px', cursor: 'pointer', fontSize: 14 }}>Next →</button>
                    </div>
                )}
            </main>
        </div>
    );
}
