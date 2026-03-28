'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminNav from '@/components/admin/AdminNav';
import { createBroadcast, listBroadcasts, type BroadcastEntry } from '@/lib/admin-api';
import { Megaphone, Send, AlertTriangle, Info, Wrench, X, Loader2 } from 'lucide-react';

const TYPE_CONFIG = {
    INFO: { label: 'Info', icon: Info, color: '#60a5fa', bg: 'rgba(96,165,250,0.15)' },
    WARNING: { label: 'Warning', icon: AlertTriangle, color: '#fbbf24', bg: 'rgba(251,191,36,0.15)' },
    MAINTENANCE: { label: 'Maintenance', icon: Wrench, color: '#a78bfa', bg: 'rgba(167,139,250,0.15)' },
};

export default function BroadcastPage() {
    const router = useRouter();
    const [broadcasts, setBroadcasts] = useState<BroadcastEntry[]>([]);
    const [title, setTitle] = useState('');
    const [message, setMessage] = useState('');
    const [type, setType] = useState<'INFO' | 'WARNING' | 'MAINTENANCE'>('INFO');
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        if (!localStorage.getItem('adminToken')) { router.push('/admin/login'); return; }
        load();
    }, []);

    async function load() {
        try { setBroadcasts(await listBroadcasts()); } catch { /* silent */ }
    }

    async function send() {
        if (!title.trim() || !message.trim()) return;
        setSending(true); setError(null); setSuccess(false);
        try {
            await createBroadcast(title, message, type);
            setSuccess(true);
            setTitle(''); setMessage(''); setType('INFO');
            await load();
            setTimeout(() => setSuccess(false), 3000);
        } catch (e: any) {
            setError(e?.response?.data?.detail || 'Failed to send broadcast.');
        } finally { setSending(false); }
    }

    function fmt(ts: string) {
        return new Date(ts).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    }

    return (
        <div className="admin-layout">
            <AdminNav />
            <main className="admin-main">
                <header className="admin-header">
                    <div>
                        <h1 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Megaphone size={22} style={{ color: '#fbbf24' }} /> Broadcast Messages
                        </h1>
                        <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0' }}>Send platform-wide notices to all shop owners</p>
                    </div>
                </header>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 24 }}>
                    {/* Compose */}
                    <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 24 }}>
                        <h2 style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0', margin: '0 0 20px' }}>Compose Broadcast</h2>

                        {error && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '10px 14px', color: '#f87171', fontSize: 13, marginBottom: 16 }}>{error}</div>}
                        {success && <div style={{ background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 10, padding: '10px 14px', color: '#4ade80', fontSize: 13, marginBottom: 16 }}>✓ Broadcast sent to all shops!</div>}

                        {/* Type selector */}
                        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                            {(Object.keys(TYPE_CONFIG) as Array<keyof typeof TYPE_CONFIG>).map(t => {
                                const cfg = TYPE_CONFIG[t];
                                const active = type === t;
                                const Icon = cfg.icon;
                                return (
                                    <button key={t} onClick={() => setType(t)}
                                        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 0', borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: `1px solid ${active ? cfg.color : 'rgba(255,255,255,0.1)'}`, background: active ? cfg.bg : 'transparent', color: active ? cfg.color : '#64748b', transition: 'all 0.2s' }}>
                                        <Icon size={13} /> {cfg.label}
                                    </button>
                                );
                            })}
                        </div>

                        <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 6 }}>Title</label>
                        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Scheduled maintenance on 1st March"
                            style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 14px', color: '#e2e8f0', fontSize: 14, outline: 'none', boxSizing: 'border-box', marginBottom: 12 }}
                        />
                        <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 6 }}>Message</label>
                        <textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Write your message to all shop owners…" rows={5}
                            style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 14px', color: '#e2e8f0', fontSize: 14, outline: 'none', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }}
                        />
                        <button onClick={send} disabled={!title.trim() || !message.trim() || sending}
                            style={{ marginTop: 16, width: '100%', background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', color: '#fff', border: 'none', borderRadius: 10, padding: '12px', fontSize: 14, fontWeight: 600, cursor: (!title.trim() || !message.trim() || sending) ? 'not-allowed' : 'pointer', opacity: (!title.trim() || !message.trim()) ? 0.5 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                            {sending ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Sending…</> : <><Send size={15} /> Send to All Shops</>}
                        </button>
                    </div>

                    {/* History */}
                    <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 24 }}>
                        <h2 style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0', margin: '0 0 20px' }}>Sent Broadcasts <span style={{ color: '#475569', fontWeight: 400, fontSize: 13 }}>({broadcasts.length})</span></h2>

                        {broadcasts.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '40px 0', color: '#475569' }}>
                                <Megaphone size={32} style={{ opacity: 0.3, display: 'block', margin: '0 auto 10px' }} />
                                <p>No broadcasts sent yet.</p>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 500, overflowY: 'auto' }}>
                                {broadcasts.map(b => {
                                    const cfg = TYPE_CONFIG[b.type as keyof typeof TYPE_CONFIG] || TYPE_CONFIG.INFO;
                                    const Icon = cfg.icon;
                                    return (
                                        <div key={b.id} style={{ border: `1px solid ${cfg.color}30`, borderRadius: 12, padding: 16, background: cfg.bg }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                                <Icon size={14} style={{ color: cfg.color }} />
                                                <span style={{ fontSize: 12, fontWeight: 700, color: cfg.color }}>{cfg.label}</span>
                                                <span style={{ marginLeft: 'auto', fontSize: 11, color: '#475569' }}>{fmt(b.created_at)}</span>
                                            </div>
                                            <p style={{ margin: '0 0 4px', fontWeight: 700, color: '#e2e8f0', fontSize: 14 }}>{b.title}</p>
                                            <p style={{ margin: 0, color: '#94a3b8', fontSize: 13, lineHeight: 1.5 }}>{b.message}</p>
                                            <p style={{ margin: '8px 0 0', fontSize: 11, color: '#475569' }}>Sent by {b.sent_by}</p>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}
