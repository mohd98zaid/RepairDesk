'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminNav from '@/components/admin/AdminNav';
import { getAnalytics, type AnalyticsData } from '@/lib/admin-api';
import { TrendingUp, Store, Ticket, Users, IndianRupee, RefreshCw, BarChart2, TrendingUp as LineIcon, PieChart } from 'lucide-react';

const RUPEE = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

const STATUS_COLORS: Record<string, string> = {
    ACTIVE: '#4ade80', RESTRICTED: '#fbbf24', BLOCKED: '#f87171', INACTIVE: '#64748b',
};
const TICKET_COLORS: Record<string, string> = {
    RECEIVED: '#60a5fa', IN_PROGRESS: '#a78bfa', WAITING_PARTS: '#fbbf24',
    READY: '#34d399', DELIVERED: '#4ade80', CANCELLED: '#f87171',
};

// ─── SVG Bar Chart ──────────────────────────────────────────────────────────
function BarChart({ values, labels, color = '#7c3aed', height = 120 }: { values: number[]; labels: string[]; color?: string; height?: number }) {
    const max = Math.max(...values, 1);
    const W = 600; const H = height; const pad = 8;
    const barW = (W - pad * (values.length + 1)) / values.length;
    return (
        <svg viewBox={`0 0 ${W} ${H + 20}`} style={{ width: '100%', height: H + 20 }}>
            {values.map((v, i) => {
                const bh = Math.max(4, Math.round((v / max) * H));
                const x = pad + i * (barW + pad);
                return (
                    <g key={i}>
                        <rect x={x} y={H - bh} width={barW} height={bh} rx={4}
                            fill={color} fillOpacity={i === values.length - 1 ? 1 : 0.5 + (i / values.length) * 0.5}>
                            <title>{labels[i]}: {v}</title>
                        </rect>
                        <text x={x + barW / 2} y={H + 14} textAnchor="middle" fontSize={9} fill="#475569">{labels[i]}</text>
                    </g>
                );
            })}
        </svg>
    );
}

// ─── SVG Line Chart ─────────────────────────────────────────────────────────
function LineChart({ values, labels, color = '#7c3aed', height = 120 }: { values: number[]; labels: string[]; color?: string; height?: number }) {
    const max = Math.max(...values, 1);
    const W = 600; const H = height; const px = 20; const py = 8;
    const xStep = (W - px * 2) / Math.max(values.length - 1, 1);
    const pts = values.map((v, i) => ({ x: px + i * xStep, y: py + (1 - v / max) * (H - py * 2) }));
    const polyline = pts.map(p => `${p.x},${p.y}`).join(' ');
    const area = `M${pts[0].x},${H} ` + pts.map(p => `L${p.x},${p.y}`).join(' ') + ` L${pts[pts.length - 1].x},${H} Z`;
    return (
        <svg viewBox={`0 0 ${W} ${H + 20}`} style={{ width: '100%', height: H + 20 }}>
            <defs>
                <linearGradient id={`lg-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.25" />
                    <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
            </defs>
            <path d={area} fill={`url(#lg-${color.replace('#', '')})`} />
            <polyline points={polyline} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
            {pts.map((p, i) => (
                <g key={i}>
                    <circle cx={p.x} cy={p.y} r={4} fill={color} stroke="#0f1117" strokeWidth={1.5}>
                        <title>{labels[i]}: {values[i]}</title>
                    </circle>
                    <text x={p.x} y={H + 14} textAnchor="middle" fontSize={9} fill="#475569">{labels[i]}</text>
                </g>
            ))}
        </svg>
    );
}

// ─── SVG Donut Chart ─────────────────────────────────────────────────────────
function DonutChart({ data, colorMap }: { data: Record<string, number>; colorMap: Record<string, string> }) {
    const entries = Object.entries(data).filter(([, v]) => v > 0);
    const total = entries.reduce((s, [, v]) => s + v, 0) || 1;
    const R = 70; const cx = 90; const cy = 80; let angle = -Math.PI / 2;
    const slices = entries.map(([k, v]) => {
        const sweep = (v / total) * 2 * Math.PI;
        const x1 = cx + R * Math.cos(angle); const y1 = cy + R * Math.sin(angle);
        angle += sweep;
        const x2 = cx + R * Math.cos(angle); const y2 = cy + R * Math.sin(angle);
        const large = sweep > Math.PI ? 1 : 0;
        return { k, v, color: colorMap[k] || '#94a3b8', d: `M${cx},${cy} L${x1},${y1} A${R},${R} 0 ${large},1 ${x2},${y2} Z` };
    });
    if (entries.length === 0) return <p style={{ color: '#475569', fontSize: 13 }}>No data yet</p>;
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <svg viewBox="0 0 180 160" style={{ width: 130, flexShrink: 0 }}>
                {slices.map(s => <path key={s.k} d={s.d} fill={s.color} stroke="#0f1117" strokeWidth={1.5}><title>{s.k}: {s.v}</title></path>)}
                <circle cx={cx} cy={cy} r={R * 0.55} fill="#0f1117" />
                <text x={cx} y={cy - 5} textAnchor="middle" fontSize={11} fill="#e2e8f0" fontWeight="700">{total}</text>
                <text x={cx} y={cy + 10} textAnchor="middle" fontSize={8} fill="#64748b">total</text>
            </svg>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: 1 }}>
                {slices.map(s => (
                    <div key={s.k} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <div style={{ width: 8, height: 8, borderRadius: 2, background: s.color, flexShrink: 0 }} />
                        <span style={{ fontSize: 11, color: '#94a3b8', flex: 1, textTransform: 'capitalize' }}>{s.k.replace('_', ' ')}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: s.color }}>{s.v}</span>
                        <span style={{ fontSize: 10, color: '#475569' }}>({Math.round((s.v / total) * 100)}%)</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ─── Horizontal Bar List ─────────────────────────────────────────────────────
function BarList({ data, colorMap }: { data: Record<string, number>; colorMap: Record<string, string> }) {
    const total = Object.values(data).reduce((a, b) => a + b, 0) || 1;
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Object.entries(data).map(([status, count]) => {
                const color = colorMap[status] || '#94a3b8';
                const pct = Math.round((count / total) * 100);
                return (
                    <div key={status}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                            <span style={{ color: '#94a3b8', textTransform: 'capitalize' }}>{status.replace('_', ' ')}</span>
                            <span style={{ color, fontWeight: 700 }}>{count} <span style={{ color: '#475569', fontWeight: 400 }}>({pct}%)</span></span>
                        </div>
                        <div style={{ height: 5, borderRadius: 99, background: 'rgba(255,255,255,0.05)' }}>
                            <div style={{ width: `${pct}%`, height: '100%', borderRadius: 99, background: color, transition: 'width 0.4s ease' }} />
                        </div>
                    </div>
                );
            })}
            {Object.keys(data).length === 0 && <p style={{ color: '#475569', fontSize: 13 }}>No data yet</p>}
        </div>
    );
}

// ─── Chart Toggle Button Group ───────────────────────────────────────────────
type TrendType = 'bar' | 'line';
type PieType = 'list' | 'donut';

function ChartToggle<T extends string>({ value, options, onChange }: { value: T; options: { key: T; icon: React.ReactNode; label: string }[]; onChange: (v: T) => void }) {
    return (
        <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: 3 }}>
            {options.map(o => (
                <button key={o.key} onClick={() => onChange(o.key)} title={o.label}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, transition: 'all 0.15s', background: value === o.key ? 'rgba(124,58,237,0.4)' : 'transparent', color: value === o.key ? '#c4b5fd' : '#475569' }}>
                    {o.icon} {o.label}
                </button>
            ))}
        </div>
    );
}

// ─── Trend Chart Panel ───────────────────────────────────────────────────────
function TrendPanel({ title, values, labels, color }: { title: string; values: number[]; labels: string[]; color: string }) {
    const [type, setType] = useState<TrendType>('bar');
    return (
        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <p style={{ margin: 0, fontWeight: 700, color: '#e2e8f0' }}>{title}</p>
                <ChartToggle<TrendType> value={type} onChange={setType} options={[
                    { key: 'bar', icon: <BarChart2 size={12} />, label: 'Bar' },
                    { key: 'line', icon: <LineIcon size={12} />, label: 'Line' },
                ]} />
            </div>
            {type === 'bar'
                ? <BarChart values={values} labels={labels} color={color} />
                : <LineChart values={values} labels={labels} color={color} />}
        </div>
    );
}

// ─── Status Breakdown Panel ──────────────────────────────────────────────────
function StatusPanel({ title, data, colorMap }: { title: string; data: Record<string, number>; colorMap: Record<string, string> }) {
    const [type, setType] = useState<PieType>('donut');
    return (
        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <p style={{ margin: 0, fontWeight: 700, color: '#e2e8f0' }}>{title}</p>
                <ChartToggle<PieType> value={type} onChange={setType} options={[
                    { key: 'donut', icon: <PieChart size={12} />, label: 'Donut' },
                    { key: 'list', icon: <BarChart2 size={12} />, label: 'Bars' },
                ]} />
            </div>
            {type === 'donut' ? <DonutChart data={data} colorMap={colorMap} /> : <BarList data={data} colorMap={colorMap} />}
        </div>
    );
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function AnalyticsPage() {
    const router = useRouter();
    const [data, setData] = useState<AnalyticsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

    useEffect(() => {
        if (!localStorage.getItem('adminToken')) { router.push('/admin/login'); return; }
        load();
    }, []);

    async function load() {
        setLoading(true);
        try { const d = await getAnalytics(); setData(d); setLastUpdated(new Date()); }
        catch { router.push('/admin/login'); }
        finally { setLoading(false); }
    }

    return (
        <div className="admin-layout">
            <AdminNav />
            <main className="admin-main">
                <header className="admin-header">
                    <div>
                        <h1 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <TrendingUp size={22} style={{ color: '#a78bfa' }} /> Platform Analytics
                        </h1>
                        <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0' }}>
                            {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : 'Loading…'}
                        </p>
                    </div>
                    <button onClick={load} disabled={loading} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                        <RefreshCw size={15} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} /> Refresh
                    </button>
                </header>

                {loading && !data ? (
                    <div style={{ textAlign: 'center', padding: 80, color: '#475569' }}>Loading analytics…</div>
                ) : data ? (
                    <>
                        {/* KPI Cards */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginBottom: 28 }}>
                            {[
                                { label: 'Total Shops', value: data.totals.shops, icon: Store, color: '#60a5fa', sub: `${data.totals.active_shops} active` },
                                { label: 'Total Tickets', value: data.totals.tickets, icon: Ticket, color: '#a78bfa', sub: 'Platform wide' },
                                { label: 'Total Users', value: data.totals.users, icon: Users, color: '#34d399', sub: 'Staff & owners' },
                                { label: 'Total Revenue', value: RUPEE(data.totals.revenue), icon: IndianRupee, color: '#fbbf24', sub: 'All time' },
                            ].map(({ label, value, icon: Icon, color, sub }) => (
                                <div key={label} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 20 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                                        <p style={{ margin: 0, fontSize: 12, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
                                        <div style={{ width: 34, height: 34, borderRadius: 10, background: `${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', color }}><Icon size={17} /></div>
                                    </div>
                                    <p style={{ margin: 0, fontSize: 26, fontWeight: 800, color: '#fff' }}>{value}</p>
                                    <p style={{ margin: '4px 0 0', fontSize: 12, color: '#475569' }}>{sub}</p>
                                </div>
                            ))}
                        </div>

                        {/* Trend Charts Row — each has Bar / Line toggle */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
                            <TrendPanel title="Monthly Tickets" values={data.monthly.map(m => m.tickets)} labels={data.monthly.map(m => m.month.split(' ')[0])} color="#a78bfa" />
                            <TrendPanel title="Monthly Revenue (₹)" values={data.monthly.map(m => m.revenue)} labels={data.monthly.map(m => m.month.split(' ')[0])} color="#fbbf24" />
                        </div>

                        {/* Status Breakdowns — Donut / Bar toggle */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.5fr', gap: 20, marginBottom: 24 }}>
                            <StatusPanel title="Shops by Status" data={data.shops_by_status} colorMap={STATUS_COLORS} />
                            <StatusPanel title="Tickets by Status" data={data.tickets_by_status} colorMap={TICKET_COLORS} />

                            {/* Top Shops */}
                            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 24 }}>
                                <p style={{ margin: '0 0 16px', fontWeight: 700, color: '#e2e8f0' }}>Top Shops by Revenue</p>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    {data.top_shops.map((s, i) => (
                                        <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <span style={{ width: 22, height: 22, borderRadius: 6, background: 'rgba(124,58,237,0.2)', color: '#a78bfa', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <p style={{ margin: 0, fontSize: 13, color: '#e2e8f0', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</p>
                                                <p style={{ margin: 0, fontSize: 11, color: '#64748b' }}>{s.tickets} tickets</p>
                                            </div>
                                            <span style={{ fontSize: 13, fontWeight: 700, color: '#fbbf24' }}>{RUPEE(s.revenue)}</span>
                                        </div>
                                    ))}
                                    {data.top_shops.length === 0 && <p style={{ color: '#475569', fontSize: 13 }}>No data yet</p>}
                                </div>
                            </div>
                        </div>

                        {/* New Shops trend — full width, bar/line toggle */}
                        <TrendPanel title="New Shops Per Month" values={data.monthly.map(m => m.new_shops)} labels={data.monthly.map(m => m.month)} color="#34d399" />
                    </>
                ) : null}
            </main>
        </div>
    );
}
