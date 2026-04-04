'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { listShops, deleteShop, createShop, bulkShopAction, exportShopsCSV, exportShopsJSON, importShopsJSON, type ShopSummary } from '@/lib/admin-api';
import AdminNav from '@/components/admin/AdminNav';
import { Users, Ticket, Search, ChevronRight, RefreshCw, Plus, X, Loader2, Download, CheckSquare, Trash2, Upload, FileJson } from 'lucide-react';

export default function AdminDashboard() {
    const router = useRouter();
    const [shops, setShops] = useState<ShopSummary[]>([]);
    const [total, setTotal] = useState(0);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);

    // Bulk selection
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [bulkLoading, setBulkLoading] = useState(false);
    const [selectMode, setSelectMode] = useState(false);

    // JSON import/export
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState<{ created: number; skipped: number; failed: { entry: string; reason: string }[] } | null>(null);
    const [importError, setImportError] = useState<string | null>(null);

    const PER_PAGE = 12;

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, search]);

    async function load() {
        setLoading(true);
        try {
            const data = await listShops({ page, per_page: PER_PAGE, search: search || undefined });
            setShops(data.items);
            setTotal(data.total);
        } catch {
            router.push('/admin/login');
        } finally {
            setLoading(false);
        }
    }

    function toggleSelect(id: string) {
        setSelected(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    }

    function toggleAll() {
        if (selected.size === shops.length) setSelected(new Set());
        else setSelected(new Set(shops.map(s => s.id)));
    }

    async function applyBulkAction(action: string, ids?: string[]) {
        const targetIds = ids || Array.from(selected);
        if (!targetIds.length) return;
        setBulkLoading(true);
        try {
            const res = await bulkShopAction(targetIds, action);
            if (!ids) { setSelected(new Set()); setSelectMode(false); }
            await load();
            if (ids) return; // silent for single-card actions
            alert(`✓ ${res.updated} shop(s) updated to ${res.new_status}`);
        } catch (e: any) {
            alert(e?.response?.data?.detail || 'Action failed.');
        } finally {
            setBulkLoading(false);
        }
    }

    async function handleBulkDelete() {
        if (!selected.size) return;
        if (!confirm(`Delete ${selected.size} selected shop(s)? This cannot be undone.`)) return;
        setBulkLoading(true);
        let failed = 0;
        for (const id of Array.from(selected)) {
            try { await deleteShop(id); } catch { failed++; }
        }
        setSelected(new Set());
        setSelectMode(false);
        await load();
        if (failed) alert(`${failed} shop(s) failed to delete.`);
    }

    async function handleDelete(shop: ShopSummary, e: React.MouseEvent) {
        e.preventDefault();
        e.stopPropagation();
        if (!confirm(`Delete "${shop.name}"? This cannot be undone.`)) return;
        try {
            await deleteShop(shop.id);
            await load();
        } catch {
            alert('Failed to delete shop.');
        }
    }

    async function handleExportJSON() {
        try {
            const ids = selectMode && selected.size > 0 ? Array.from(selected) : undefined;
            await exportShopsJSON(ids);
        } catch { alert('Export failed.'); }
    }

    async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        setImporting(true);
        setImportResult(null);
        setImportError(null);
        try {
            const result = await importShopsJSON(file);
            setImportResult(result);
            await load();
        } catch (err: any) {
            const detail = err?.response?.data?.detail || null;
            setImportError(detail || 'Import failed. Check the file format.');
        } finally {
            setImporting(false);
            e.target.value = '';
        }
    }

    function downloadSampleJSON() {
        const sample = {
            shops: [
                {
                    name: 'My Shop',
                    phone: '+91 9876543210',
                    plan: 'free',
                    shop_status: 'ACTIVE',
                    owner: {
                        full_name: 'John Doe',
                        email: 'john@myshop.com',
                        password: 'optional_password',
                    },
                },
            ],
        };
        const blob = new Blob([JSON.stringify(sample, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'shops_import_template.json';
        a.click();
        URL.revokeObjectURL(url);
    }

    const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

    return (
        <div className="admin-layout">
            <AdminNav />

            <main className="admin-main">
                <header className="admin-header">
                    <div>
                        <h1>All Shops</h1>
                        <p>{total} shop{total !== 1 ? 's' : ''} registered on the platform</p>
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                        <button className="icon-btn" onClick={load} title="Refresh">
                            <RefreshCw size={18} />
                        </button>
                        <button className="icon-btn" onClick={exportShopsCSV} title="Export shops CSV">
                            <Download size={18} />
                        </button>
                        <button className="icon-btn" onClick={handleExportJSON} title="Export shops JSON">
                            <FileJson size={18} />
                        </button>
                        <button className="icon-btn" onClick={() => fileInputRef.current?.click()} title="Import shops from JSON" disabled={importing}>
                            {importing ? <Loader2 size={18} className="spin" /> : <Upload size={18} />}
                        </button>
                        <input ref={fileInputRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImportFile} />
                        <button className="icon-btn" onClick={() => { setSelectMode(v => !v); setSelected(new Set()); }}
                            title="Bulk select mode" style={{ color: selectMode ? '#a78bfa' : undefined }}>
                            <CheckSquare size={18} />
                        </button>
                        <button className="create-btn" onClick={() => setShowCreate(true)}>
                            <Plus size={16} /> New Shop
                        </button>
                    </div>
                </header>

                {/* Import result banner */}
                {importResult && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 12, padding: '10px 16px', marginBottom: 16, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 13, color: '#4ade80', fontWeight: 600 }}>✓ Import complete:</span>
                        <span style={{ fontSize: 13, color: '#cbd5e1' }}>{importResult.created} created</span>
                        <span style={{ fontSize: 13, color: '#94a3b8' }}>{importResult.skipped} skipped (duplicates)</span>
                        {importResult.failed.length > 0 && <span style={{ fontSize: 13, color: '#f87171' }}>{importResult.failed.length} failed</span>}
                        <button onClick={() => setImportResult(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#475569', cursor: 'pointer' }}><X size={14} /></button>
                    </div>
                )}

                {/* Import error banner */}
                {importError && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.22)', borderRadius: 12, padding: '10px 16px', marginBottom: 16, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 13, color: '#f87171', fontWeight: 600 }}>✕ {importError}</span>
                        <button onClick={downloadSampleJSON}
                            style={{ marginLeft: 8, display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', borderRadius: 8, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                            <Download size={12} /> Download Sample Template
                        </button>
                        <button onClick={() => setImportError(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#475569', cursor: 'pointer' }}><X size={14} /></button>
                    </div>
                )}

                {/* Bulk action toolbar */}
                {selectMode && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.25)', borderRadius: 12, padding: '10px 16px', marginBottom: 20, flexWrap: 'wrap' }}>
                        <button onClick={toggleAll} style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: '#e2e8f0', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                            {selected.size === shops.length ? 'Deselect All' : 'Select All'}
                        </button>
                        <span style={{ color: '#a78bfa', fontSize: 13, fontWeight: 600 }}>{selected.size} selected</span>
                        {selected.size > 0 && (
                            <>
                                {(['reactivate', 'restrict', 'block', 'deactivate'] as const).map(action => (
                                    <button key={action} onClick={() => applyBulkAction(action)} disabled={bulkLoading}
                                        style={{ background: action === 'reactivate' ? 'rgba(74,222,128,0.15)' : action === 'restrict' ? 'rgba(251,191,36,0.15)' : action === 'block' ? 'rgba(239,68,68,0.15)' : 'rgba(148,163,184,0.1)', border: `1px solid ${action === 'reactivate' ? 'rgba(74,222,128,0.3)' : action === 'restrict' ? 'rgba(251,191,36,0.3)' : action === 'block' ? 'rgba(239,68,68,0.3)' : 'rgba(148,163,184,0.2)'}`, color: action === 'reactivate' ? '#4ade80' : action === 'restrict' ? '#fbbf24' : action === 'block' ? '#f87171' : '#94a3b8', borderRadius: 8, padding: '6px 14px', cursor: bulkLoading ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 600, textTransform: 'capitalize' }}>
                                        {bulkLoading ? '…' : action}
                                    </button>
                                ))}
                                <button onClick={handleBulkDelete} disabled={bulkLoading}
                                    style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.35)', color: '#f87171', borderRadius: 8, padding: '6px 14px', cursor: bulkLoading ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}>
                                    <Trash2 size={12} /> {bulkLoading ? '…' : 'Delete'}
                                </button>
                            </>
                        )}
                        <button onClick={() => { setSelectMode(false); setSelected(new Set()); }} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#475569', cursor: 'pointer' }}><X size={16} /></button>
                    </div>
                )}

                {/* Search */}
                <div className="admin-search-bar">
                    <Search size={18} />
                    <input
                        type="text"
                        placeholder="Search shops by name…"
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                    />
                </div>

                {loading ? (
                    <div className="admin-loading">Loading shops…</div>
                ) : shops.length === 0 ? (
                    <div className="admin-empty">No shops found.</div>
                ) : (
                    <div className="shop-grid">
                        {shops.map((shop) => (
                            <div key={shop.id}
                                className={`shop-card${selectMode && selected.has(shop.id) ? ' selected' : ''}${selectMode ? ' no-flip' : ''}`}
                                style={{ position: 'relative', cursor: 'pointer' }}
                                onClick={selectMode
                                    ? () => toggleSelect(shop.id)
                                    : () => router.push(`/admin/shops/${shop.id}`)}
                            >

                                {/* Checkbox overlay in select mode */}
                                {selectMode && (
                                    <div style={{ position: 'absolute', top: 12, right: 12, width: 20, height: 20, borderRadius: 6, border: `2px solid ${selected.has(shop.id) ? '#a78bfa' : 'rgba(255,255,255,0.3)'}`, background: selected.has(shop.id) ? '#7c3aed' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s', zIndex: 10 }}>
                                        {selected.has(shop.id) && <span style={{ color: '#fff', fontSize: 12, fontWeight: 700 }}>✓</span>}
                                    </div>
                                )}

                                {(() => {
                                    const status = (shop.shop_status || (shop.is_active ? 'ACTIVE' : 'INACTIVE')).toUpperCase();
                                    const label = status.charAt(0) + status.slice(1).toLowerCase();
                                    const accent = status === 'BLOCKED' ? '#ef4444' : status === 'RESTRICTED' ? '#f59e0b' : status === 'INACTIVE' ? '#64748b' : '#7c3aed';
                                    const created = new Date(shop.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
                                    return (
                                        <div className="shop-card__flipper">
                                            {/* ── FRONT ── */}
                                            <div className="shop-card__front">
                                                <div className="shop-card__accent" style={{ background: accent }} />
                                                <div className="shop-card__body">
                                                    <div className="shop-card__top">
                                                        <div className="shop-icon">
                                                            <span className="shop-initials">{shop.name.charAt(0).toUpperCase()}</span>
                                                        </div>
                                                        <div className="shop-card__title">
                                                            <h3 className="shop-card__name">{shop.name}</h3>
                                                            <span className={`badge badge--${status.toLowerCase()}`}>{label}</span>
                                                        </div>
                                                    </div>
                                                    <div className="shop-card__meta">
                                                        {shop.owner && <span className="shop-card__owner">{shop.owner.full_name}</span>}
                                                        <span className="shop-card__email">{shop.email || shop.owner?.email}</span>
                                                    </div>
                                                    <div className="shop-card__stats">
                                                        <span><Ticket size={13} />{shop.ticket_count} tickets</span>
                                                        <span><Users size={13} />{shop.member_count} members</span>
                                                    </div>
                                                    <div className="shop-card__hint">Hover to see more ↗</div>
                                                </div>
                                            </div>

                                            {/* ── BACK ── */}
                                            <div className="shop-card__back" style={{ borderTop: `3px solid ${accent}` }}>
                                                <div className="shop-card__back-body">
                                                    <div className="shop-back__top">
                                                        <div className="shop-icon" style={{ width: 32, height: 32 }}>
                                                            <span className="shop-initials" style={{ fontSize: 13 }}>{shop.name.charAt(0).toUpperCase()}</span>
                                                        </div>
                                                        <div>
                                                            <div className="shop-back__name">{shop.name}</div>
                                                            <span className={`badge badge--${status.toLowerCase()}`}>{label}</span>
                                                        </div>
                                                    </div>
                                                    <div className="shop-back__stats">
                                                        <div className="shop-back__stat">
                                                            <span className="shop-back__stat-val">{shop.ticket_count}</span>
                                                            <span className="shop-back__stat-lbl">Tickets</span>
                                                        </div>
                                                        <div className="shop-back__stat-divider" />
                                                        <div className="shop-back__stat">
                                                            <span className="shop-back__stat-val">{shop.member_count}</span>
                                                            <span className="shop-back__stat-lbl">Members</span>
                                                        </div>
                                                        <div className="shop-back__stat-divider" />
                                                        <div className="shop-back__stat">
                                                            <span className="shop-back__stat-val">{new Date(shop.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                                                            <span className="shop-back__stat-lbl">Joined</span>
                                                        </div>
                                                    </div>
                                                    {/* Action grid on back */}
                                                    <div className="shop-back__grid">
                                                        <button className="shop-back__act shop-back__act--green"
                                                            onClick={(e) => { e.stopPropagation(); applyBulkAction('reactivate', [shop.id]); }}
                                                            title="Activate">
                                                            ✓ Activate
                                                        </button>
                                                        <button className="shop-back__act shop-back__act--amber"
                                                            onClick={(e) => { e.stopPropagation(); applyBulkAction('restrict', [shop.id]); }}
                                                            title="Restrict">
                                                            ⚠ Restrict
                                                        </button>
                                                        <button className="shop-back__act shop-back__act--red"
                                                            onClick={(e) => { e.stopPropagation(); applyBulkAction('block', [shop.id]); }}
                                                            title="Block">
                                                            ✕ Block
                                                        </button>
                                                        <button className="shop-back__act shop-back__act--del"
                                                            onClick={(e) => handleDelete(shop, e)}
                                                            title="Delete">
                                                            <Trash2 size={11} /> Delete
                                                        </button>
                                                    </div>
                                                    <div className="shop-back__nav-hint">Click card to open →</div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>
                        ))}
                    </div>
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="admin-pagination">
                        <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>← Prev</button>
                        <span>Page {page} of {totalPages}</span>
                        <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next →</button>
                    </div>
                )}
            </main>

            {/* Create Shop Modal */}
            {showCreate && (
                <CreateShopModal
                    onClose={() => setShowCreate(false)}
                    onCreated={() => { setShowCreate(false); load(); }}
                />
            )}

        </div>
    );
}

function CreateShopModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
    const [form, setForm] = useState({ shop_name: '', owner_name: '', email: '', password: '', phone: '' });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
        setForm(f => ({ ...f, [k]: e.target.value }));

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setSaving(true);
        try {
            await createShop(form);
            onCreated();
        } catch (err: any) {
            setError(err?.response?.data?.detail || 'Failed to create shop');
        } finally {
            setSaving(false);
        }
    }

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
            <div style={{ background: '#1a1d27', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, padding: 36, width: '100%', maxWidth: 480, boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                    <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#fff' }}>Create New Shop</h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: 4 }}><X size={20} /></button>
                </div>

                {error && (
                    <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '10px 14px', color: '#f87171', fontSize: 14, marginBottom: 18 }}>
                        {error}
                    </div>
                )}

                <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {([
                        ['shop_name', 'Shop Name', 'text', 'e.g. TechFix Mumbai', true],
                        ['owner_name', 'Owner Name', 'text', 'e.g. Rahul Sharma', true],
                        ['email', 'Owner Email', 'email', 'e.g. rahul@techfix.in', true],
                        ['password', 'Password', 'password', 'Min. 6 characters', true],
                        ['phone', 'Phone (optional)', 'tel', '+91 98765 43210', false],
                    ] as [keyof typeof form, string, string, string, boolean][]).map(([key, label, type, ph, req]) => (
                        <div key={key}>
                            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#94a3b8', marginBottom: 6 }}>{label}</label>
                            <input
                                type={type}
                                placeholder={ph}
                                value={form[key]}
                                onChange={set(key)}
                                required={req}
                                style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 14px', color: '#e2e8f0', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
                            />
                        </div>
                    ))}

                    <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                        <button type="button" onClick={onClose} style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', borderRadius: 10, padding: '11px 0', cursor: 'pointer', fontSize: 14 }}>
                            Cancel
                        </button>
                        <button type="submit" disabled={saving} style={{ flex: 2, background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', color: '#fff', border: 'none', borderRadius: 10, padding: '11px 0', cursor: saving ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: saving ? 0.7 : 1 }}>
                            {saving ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Creating…</> : 'Create Shop'}
                        </button>
                    </div>
                </form>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
        </div>
    );
}
