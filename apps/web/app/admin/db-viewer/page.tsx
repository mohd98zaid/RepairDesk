'use client';
import { useState, useEffect, useCallback } from 'react';
import AdminNav from '@/components/admin/AdminNav';
import { getAdminMe } from '@/lib/admin-api';
import { useRouter } from 'next/navigation';
import { Database, Play, Table2, RefreshCw, AlertTriangle, ChevronDown, ChevronUp, Copy, Check } from 'lucide-react';
import axios from 'axios';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

// Pre-built queries for common admin operations
const PRESET_QUERIES = [
    { label: 'All Tables', query: "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;" },
    { label: 'Shops', query: "SELECT id, name, email, phone, plan, shop_status, created_at FROM shops ORDER BY created_at DESC LIMIT 50;" },
    { label: 'Users', query: "SELECT id, full_name, email, role, is_active, shop_id, created_at FROM users ORDER BY created_at DESC LIMIT 50;" },
    { label: 'Tickets', query: "SELECT id, ticket_number, device_type, status, final_cost, shop_id, created_at FROM tickets ORDER BY created_at DESC LIMIT 50;" },
    { label: 'Customers', query: "SELECT id, full_name, email, phone, shop_id, created_at FROM customers ORDER BY created_at DESC LIMIT 50;" },
    { label: 'Inventory', query: "SELECT id, name, sku, quantity, price, shop_id FROM inventory_items ORDER BY created_at DESC LIMIT 50;" },
    { label: 'Plans', query: "SELECT id, name, slug, price_monthly, price_yearly, is_active, is_public, sort_order FROM plans ORDER BY sort_order;" },
    { label: 'Features', query: "SELECT id, key, name, feature_type, default_value, is_active FROM features ORDER BY key;" },
    { label: 'Subscriptions', query: "SELECT s.id, s.shop_id, p.name as plan_name, s.status, s.billing_cycle, s.created_at FROM subscriptions s JOIN plans p ON s.plan_id = p.id ORDER BY s.created_at DESC LIMIT 50;" },
    { label: 'DB Size', query: "SELECT pg_database.datname, pg_size_pretty(pg_database_size(pg_database.datname)) FROM pg_database ORDER BY pg_database_size(pg_database.datname) DESC;" },
    { label: 'Table Sizes', query: "SELECT relname AS table_name, pg_size_pretty(pg_total_relation_size(relid)) AS total_size, pg_size_pretty(pg_table_size(relid)) AS data_size, pg_size_pretty(pg_indexes_size(relid)) AS index_size FROM pg_catalog.pg_statio_user_tables ORDER BY pg_total_relation_size(relid) DESC;" },
    { label: 'Row Counts', query: "SELECT relname AS table, n_live_tup AS row_count FROM pg_stat_user_tables ORDER BY n_live_tup DESC;" },
    { label: 'Active Locks', query: "SELECT pid, usename, application_name, state, query FROM pg_stat_activity WHERE state != 'idle' ORDER BY state;" },
    { label: 'Indexes', query: "SELECT indexname, tablename, indexdef FROM pg_indexes WHERE schemaname = 'public' ORDER BY tablename, indexname;" },
];

interface QueryResult {
    columns: string[];
    rows: any[][];
    rowCount: number;
    duration: number;
    error?: string;
}

export default function DbViewerPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [query, setQuery] = useState(PRESET_QUERIES[0].query);
    const [executing, setExecuting] = useState(false);
    const [result, setResult] = useState<QueryResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [showPresets, setShowPresets] = useState(true);
    const [copied, setCopied] = useState(false);
    const [tables, setTables] = useState<string[]>([]);
    const [selectedTable, setSelectedTable] = useState<string | null>(null);
    const [tableInfo, setTableInfo] = useState<QueryResult | null>(null);

    useEffect(() => {
        getAdminMe()
            .then(() => { setLoading(false); loadTables(); })
            .catch((e: any) => {
                if (e?.response?.status === 401) { router.push('/admin/login'); return; }
                setLoading(false);
            });
    }, []);

    async function executeQuery(sql?: string) {
        const q = sql || query;
        if (!q.trim()) return;
        setExecuting(true);
        setError(null);
        setResult(null);
        const start = performance.now();
        try {
            const res = await axios.post(`${API_BASE}/admin/db/query`, { query: q }, { withCredentials: true });
            const duration = Math.round(performance.now() - start);
            setResult({ ...res.data, duration });
        } catch (e: any) {
            if (e?.response?.status === 401) { router.push('/admin/login'); return; }
            setError(e?.response?.data?.detail || e?.message || 'Query failed');
        } finally {
            setExecuting(false);
        }
    }

    async function loadTables() {
        try {
            const res = await axios.post(`${API_BASE}/admin/db/query`, {
                query: "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;"
            }, { withCredentials: true });
            if (res.data?.rows) {
                setTables(res.data.rows.map((r: any[]) => r[0]));
            }
        } catch { /* ignore */ }
    }

    async function inspectTable(tableName: string) {
        setSelectedTable(tableName);
        setQuery(`SELECT * FROM ${tableName} LIMIT 50;`);
        executeQuery(`SELECT * FROM ${tableName} LIMIT 50;`);
    }

    function copyResult() {
        if (!result) return;
        const header = result.columns.join('\t');
        const rows = result.rows.map(r => r.map(c => c === null ? 'NULL' : String(c)).join('\t')).join('\n');
        navigator.clipboard.writeText(`${header}\n${rows}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }

    if (loading) {
        return (
            <div className="admin-layout">
                <AdminNav />
                <main className="admin-main">
                    <div style={{ textAlign: 'center', padding: 80, color: '#475569' }}>Loading…</div>
                </main>
            </div>
        );
    }

    return (
        <div className="admin-layout">
            <AdminNav />
            <main className="admin-main">
                <header className="admin-header">
                    <div>
                        <h1 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Database size={22} style={{ color: '#a78bfa' }} /> Database Viewer
                        </h1>
                        <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0' }}>
                            Query PostgreSQL database — Full admin access
                        </p>
                    </div>
                </header>

                <div style={{ display: 'grid', gridTemplateColumns: tables.length > 0 ? '200px 1fr' : '1fr', gap: 16, height: 'calc(100vh - 180px)' }}>
                    {/* Table Browser Sidebar */}
                    {tables.length > 0 && (
                        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 12, overflowY: 'auto' }}>
                            <p style={{ margin: '0 0 10px', fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                Tables ({tables.length})
                            </p>
                            {tables.map(t => (
                                <button key={t} onClick={() => inspectTable(t)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                                        padding: '6px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
                                        fontSize: 12, fontWeight: 500, textAlign: 'left',
                                        background: selectedTable === t ? 'rgba(124,58,237,0.3)' : 'transparent',
                                        color: selectedTable === t ? '#c4b5fd' : '#94a3b8',
                                        marginBottom: 2,
                                    }}>
                                    <Table2 size={13} /> {t}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Main Query Area */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, overflow: 'hidden' }}>
                        {/* Preset Queries */}
                        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '12px 16px' }}>
                            <button onClick={() => setShowPresets(!showPresets)}
                                style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 12, fontWeight: 600, padding: 0, width: '100%', justifyContent: 'space-between' }}>
                                <span>Quick Queries</span>
                                {showPresets ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </button>
                            {showPresets && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                                    {PRESET_QUERIES.map(p => (
                                        <button key={p.label} onClick={() => { setQuery(p.query); executeQuery(p.query); }}
                                            style={{ background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.25)', color: '#c4b5fd', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>
                                            {p.label}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Query Editor */}
                        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 16 }}>
                            <textarea
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) executeQuery(); }}
                                placeholder="Enter SQL query… (Ctrl+Enter to execute)"
                                style={{
                                    width: '100%', minHeight: 80, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: 10, padding: 12, color: '#e2e8f0', fontSize: 13, fontFamily: 'monospace',
                                    resize: 'vertical', outline: 'none',
                                }}
                            />
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                                <span style={{ fontSize: 11, color: '#475569' }}>Ctrl+Enter to execute</span>
                                <button onClick={() => executeQuery()} disabled={executing}
                                    style={{
                                        background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8,
                                        padding: '8px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center',
                                        gap: 6, fontSize: 13, fontWeight: 600, opacity: executing ? 0.6 : 1,
                                    }}>
                                    {executing ? <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Play size={14} />}
                                    {executing ? 'Executing…' : 'Execute'}
                                </button>
                            </div>
                        </div>

                        {/* Error Display */}
                        {error && (
                            <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                                <AlertTriangle size={16} style={{ color: '#f87171', flexShrink: 0, marginTop: 2 }} />
                                <p style={{ margin: 0, fontSize: 13, color: '#fca5a5', fontFamily: 'monospace' }}>{error}</p>
                            </div>
                        )}

                        {/* Results Table */}
                        {result && (
                            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                    <span style={{ fontSize: 12, color: '#64748b' }}>
                                        {result.columns.length > 0
                                            ? `${result.rowCount} row${result.rowCount !== 1 ? 's' : ''} returned`
                                            : `${result.rowCount} row${result.rowCount !== 1 ? 's' : ''} affected`
                                        } • {result.duration}ms
                                    </span>
                                    <button onClick={copyResult}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied ? '#4ade80' : '#64748b', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                                        {copied ? <Check size={13} /> : <Copy size={13} />}
                                        {copied ? 'Copied!' : 'Copy'}
                                    </button>
                                </div>
                                <div style={{ overflow: 'auto', flex: 1 }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                        <thead>
                                            <tr>
                                                {result.columns.map((col, i) => (
                                                    <th key={i} style={{
                                                        padding: '8px 12px', textAlign: 'left', color: '#94a3b8',
                                                        fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.08)',
                                                        background: 'rgba(255,255,255,0.02)', whiteSpace: 'nowrap',
                                                        position: 'sticky', top: 0,
                                                    }}>{col}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {result.rows.map((row, ri) => (
                                                <tr key={ri} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}
                                                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                                                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                                    {row.map((cell, ci) => (
                                                        <td key={ci} style={{
                                                            padding: '6px 12px', color: cell === null ? '#475569' : '#e2e8f0',
                                                            fontFamily: 'monospace', fontSize: 11, whiteSpace: 'nowrap',
                                                            maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis',
                                                            fontStyle: cell === null ? 'italic' : 'normal',
                                                        }}
                                                            title={cell === null ? 'NULL' : String(cell)}>
                                                            {cell === null ? 'NULL' : String(cell)}
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    {result.rows.length === 0 && (
                                        <p style={{ textAlign: 'center', padding: 30, color: '#475569', fontSize: 13 }}>No rows returned</p>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </main>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
