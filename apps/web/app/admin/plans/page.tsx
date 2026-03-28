'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminNav from '@/components/admin/AdminNav';
import {
    listPlans, createPlan, updatePlan, deletePlan,
    listFeatures, createFeature, deleteFeature, setPlanFeature, removePlanFeature,
    getSubscriptionStats, listSubscriptions,
    type PlanData, type FeatureData, type SubscriptionStats, type SubscriptionItem,
} from '@/lib/admin-api';
import { CreditCard, Plus, Trash2, Check, X, RefreshCw, Eye, EyeOff, Users, IndianRupee, Package, Square, CheckSquare } from 'lucide-react';

export default function PlansPage() {
    const router = useRouter();
    const [plans, setPlans] = useState<PlanData[]>([]);
    const [features, setFeatures] = useState<FeatureData[]>([]);
    const [stats, setStats] = useState<SubscriptionStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState<'plans' | 'features' | 'subscriptions'>('plans');

    // Create plan form
    const [showCreate, setShowCreate] = useState(false);
    const [newPlan, setNewPlan] = useState({ name: '', slug: '', description: '', price_monthly: '0', price_yearly: '0', is_public: true, sort_order: 0 });
    const [newPlanFeatures, setNewPlanFeatures] = useState<Record<string, string>>({});

    // Create feature form
    const [showCreateFeature, setShowCreateFeature] = useState(false);
    const [newFeature, setNewFeature] = useState({ key: '', name: '', description: '', feature_type: 'boolean', default_value: 'false' });

    // Plan features editing (which plan's features panel is open)
    const [editingPlanFeatures, setEditingPlanFeatures] = useState<string | null>(null);

    // Subscriptions list
    const [subs, setSubs] = useState<SubscriptionItem[]>([]);
    const [subsTotal, setSubsTotal] = useState(0);

    useEffect(() => {
        if (!localStorage.getItem('adminToken')) { router.push('/admin/login'); return; }
        load();
    }, []);

    async function load() {
        setLoading(true);
        try {
            const [p, f, s] = await Promise.all([listPlans(), listFeatures(), getSubscriptionStats()]);
            setPlans(p);
            setFeatures(f);
            setStats(s);
        } catch { router.push('/admin/login'); }
        finally { setLoading(false); }
    }

    async function loadSubs() {
        try {
            const data = await listSubscriptions({ page: 1, per_page: 50 });
            setSubs(data.items);
            setSubsTotal(data.total);
        } catch { /* */ }
    }

    async function handleCreatePlan() {
        if (!newPlan.name || !newPlan.slug) return;
        try {
            const plan = await createPlan(newPlan);
            // Apply selected features
            for (const [featureId, value] of Object.entries(newPlanFeatures)) {
                await setPlanFeature(plan.id, featureId, value);
            }
            setShowCreate(false);
            setNewPlan({ name: '', slug: '', description: '', price_monthly: '0', price_yearly: '0', is_public: true, sort_order: 0 });
            setNewPlanFeatures({});
            await load();
        } catch (e: any) { alert(e?.response?.data?.detail || 'Failed to create plan'); }
    }

    async function handleDeletePlan(id: string) {
        if (!confirm('Delete this plan? Active subscriptions will block deletion.')) return;
        try { await deletePlan(id); await load(); }
        catch (e: any) { alert(e?.response?.data?.detail || 'Failed to delete plan'); }
    }

    async function handleToggleActive(plan: PlanData) {
        try { await updatePlan(plan.id, { is_active: !plan.is_active }); await load(); }
        catch (e: any) { alert(e?.response?.data?.detail || 'Failed'); }
    }

    async function handleTogglePublic(plan: PlanData) {
        try { await updatePlan(plan.id, { is_public: !plan.is_public }); await load(); }
        catch (e: any) { alert(e?.response?.data?.detail || 'Failed'); }
    }

    async function handleCreateFeature() {
        if (!newFeature.key || !newFeature.name) return;
        try {
            await createFeature(newFeature);
            setShowCreateFeature(false);
            setNewFeature({ key: '', name: '', description: '', feature_type: 'boolean', default_value: 'false' });
            await load();
        } catch (e: any) { alert(e?.response?.data?.detail || 'Failed to create feature'); }
    }

    async function handleDeleteFeature(id: string, name: string) {
        if (!confirm(`Delete feature "${name}"? This will remove it from all plans.`)) return;
        try { await deleteFeature(id); await load(); }
        catch (e: any) { alert(e?.response?.data?.detail || 'Failed to delete feature'); }
    }

    async function handleTogglePlanFeature(planId: string, feature: FeatureData, isCurrentlyEnabled: boolean) {
        if (isCurrentlyEnabled) {
            // Remove feature from plan
            try { await removePlanFeature(planId, feature.id); await load(); }
            catch (e: any) { alert(e?.response?.data?.detail || 'Failed'); }
        } else {
            // Add feature to plan with default value
            const defaultVal = feature.feature_type === 'boolean' ? 'true' : feature.default_value;
            try { await setPlanFeature(planId, feature.id, defaultVal); await load(); }
            catch (e: any) { alert(e?.response?.data?.detail || 'Failed'); }
        }
    }

    async function handleUpdatePlanFeatureValue(planId: string, featureId: string, value: string) {
        try { await setPlanFeature(planId, featureId, value); await load(); }
        catch (e: any) { alert(e?.response?.data?.detail || 'Failed'); }
    }

    function handleToggleNewPlanFeature(featureId: string, feature: FeatureData) {
        setNewPlanFeatures(prev => {
            const next = { ...prev };
            if (next[featureId]) {
                delete next[featureId];
            } else {
                next[featureId] = feature.feature_type === 'boolean' ? 'true' : feature.default_value;
            }
            return next;
        });
    }

    useEffect(() => { if (tab === 'subscriptions') loadSubs(); }, [tab]);

    // Helper: check if a plan has a specific feature
    function planHasFeature(plan: PlanData, featureId: string): { enabled: boolean; value: string } {
        const pf = plan.features.find(f => f.feature_id === featureId);
        return pf ? { enabled: true, value: pf.value } : { enabled: false, value: '' };
    }

    return (
        <div className="admin-layout">
            <AdminNav />
            <main className="admin-main">
                <header className="admin-header">
                    <div>
                        <h1 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <CreditCard size={22} style={{ color: '#a78bfa' }} /> Plans & Billing
                        </h1>
                        <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0' }}>
                            Manage subscription plans, features, and billing
                        </p>
                    </div>
                    <button onClick={load} disabled={loading}
                        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                        <RefreshCw size={15} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} /> Refresh
                    </button>
                </header>

                {/* KPI Cards */}
                {stats && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
                        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 20 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                                <p style={{ margin: 0, fontSize: 12, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Active Subscriptions</p>
                                <Users size={17} style={{ color: '#60a5fa' }} />
                            </div>
                            <p style={{ margin: 0, fontSize: 26, fontWeight: 800, color: '#fff' }}>{stats.active_subscriptions}</p>
                        </div>
                        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 20 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                                <p style={{ margin: 0, fontSize: 12, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>MRR</p>
                                <IndianRupee size={17} style={{ color: '#fbbf24' }} />
                            </div>
                            <p style={{ margin: 0, fontSize: 26, fontWeight: 800, color: '#fff' }}>₹{stats.mrr.toLocaleString()}</p>
                        </div>
                        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 20 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                                <p style={{ margin: 0, fontSize: 12, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Free Shops</p>
                                <Package size={17} style={{ color: '#94a3b8' }} />
                            </div>
                            <p style={{ margin: 0, fontSize: 26, fontWeight: 800, color: '#fff' }}>{stats.free_shops}</p>
                        </div>
                        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 20 }}>
                            <p style={{ margin: '0 0 8px', fontSize: 12, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Plan Distribution</p>
                            {stats.plan_distribution.map(p => (
                                <div key={p.slug} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#e2e8f0', marginBottom: 4 }}>
                                    <span>{p.name}</span>
                                    <span style={{ fontWeight: 700, color: '#a78bfa' }}>{p.count}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Tabs */}
                <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 4, width: 'fit-content' }}>
                    {(['plans', 'features', 'subscriptions'] as const).map(t => (
                        <button key={t} onClick={() => setTab(t)}
                            style={{ padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, textTransform: 'capitalize',
                                background: tab === t ? 'rgba(124,58,237,0.4)' : 'transparent',
                                color: tab === t ? '#c4b5fd' : '#64748b' }}>
                            {t}
                        </button>
                    ))}
                </div>

                {/* ─── Plans Tab ─── */}
                {tab === 'plans' && (
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
                            <button onClick={() => setShowCreate(!showCreate)}
                                style={{ background: 'rgba(124,58,237,0.3)', border: '1px solid rgba(124,58,237,0.4)', color: '#c4b5fd', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                                <Plus size={15} /> Create Plan
                            </button>
                        </div>

                        {/* ── Create Plan Form ── */}
                        {showCreate && (
                            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 20, marginBottom: 20 }}>
                                <h3 style={{ margin: '0 0 12px', color: '#e2e8f0', fontSize: 15 }}>Create New Plan</h3>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                    {[
                                        { key: 'name', label: 'Name', placeholder: 'Pro' },
                                        { key: 'slug', label: 'Slug', placeholder: 'pro' },
                                        { key: 'price_monthly', label: 'Monthly Price (₹)', placeholder: '999' },
                                        { key: 'price_yearly', label: 'Yearly Price (₹)', placeholder: '9999' },
                                    ].map(f => (
                                        <div key={f.key}>
                                            <label style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 4 }}>{f.label}</label>
                                            <input value={(newPlan as any)[f.key]} onChange={e => setNewPlan(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder}
                                                style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 12px', color: '#e2e8f0', fontSize: 13, outline: 'none' }} />
                                        </div>
                                    ))}
                                    <div style={{ gridColumn: '1 / -1' }}>
                                        <label style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 4 }}>Description</label>
                                        <input value={newPlan.description} onChange={e => setNewPlan(p => ({ ...p, description: e.target.value }))} placeholder="For growing businesses"
                                            style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 12px', color: '#e2e8f0', fontSize: 13, outline: 'none' }} />
                                    </div>
                                </div>

                                {/* ── Feature Checkboxes for New Plan ── */}
                                <div style={{ marginTop: 16 }}>
                                    <label style={{ display: 'block', fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 8, textTransform: 'uppercase' }}>Select Features</label>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 6 }}>
                                        {features.map(f => {
                                            const checked = !!newPlanFeatures[f.id];
                                            return (
                                                <label key={f.id}
                                                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, cursor: 'pointer', background: checked ? 'rgba(124,58,237,0.15)' : 'rgba(255,255,255,0.03)', border: `1px solid ${checked ? 'rgba(124,58,237,0.3)' : 'rgba(255,255,255,0.06)'}` }}>
                                                    <input type="checkbox" checked={checked}
                                                        onChange={() => handleToggleNewPlanFeature(f.id, f)}
                                                        style={{ accentColor: '#7c3aed', width: 16, height: 16, cursor: 'pointer' }} />
                                                    <div style={{ flex: 1 }}>
                                                        <span style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 500 }}>{f.name}</span>
                                                        <span style={{ fontSize: 11, color: '#64748b', marginLeft: 6 }}>({f.key})</span>
                                                    </div>
                                                    {checked && f.feature_type !== 'boolean' && (
                                                        <input
                                                            value={newPlanFeatures[f.id]}
                                                            onChange={e => setNewPlanFeatures(p => ({ ...p, [f.id]: e.target.value }))}
                                                            onClick={e => e.stopPropagation()}
                                                            placeholder={f.feature_type === 'numeric' ? '100 or unlimited' : 'value'}
                                                            style={{ width: 90, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '3px 8px', color: '#e2e8f0', fontSize: 12, outline: 'none', textAlign: 'right' }} />
                                                    )}
                                                </label>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                                    <button onClick={handleCreatePlan} style={{ background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                                        <Check size={14} /> Create
                                    </button>
                                    <button onClick={() => { setShowCreate(false); setNewPlanFeatures({}); }} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontSize: 13 }}>
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* ── Plans Grid ── */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
                            {plans.map(plan => (
                                <div key={plan.id} style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${plan.is_active ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)'}`, borderRadius: 16, padding: 20, opacity: plan.is_active ? 1 : 0.5 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                                        <div>
                                            <h3 style={{ margin: 0, color: '#e2e8f0', fontSize: 18, fontWeight: 700 }}>{plan.name}</h3>
                                            <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>{plan.slug}</p>
                                        </div>
                                        <div style={{ display: 'flex', gap: 4 }}>
                                            <button onClick={() => handleTogglePublic(plan)} title={plan.is_public ? 'Public' : 'Hidden'}
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: plan.is_public ? '#4ade80' : '#64748b', padding: 4 }}>
                                                {plan.is_public ? <Eye size={14} /> : <EyeOff size={14} />}
                                            </button>
                                            <button onClick={() => handleToggleActive(plan)} title={plan.is_active ? 'Active' : 'Disabled'}
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: plan.is_active ? '#4ade80' : '#f87171', padding: 4 }}>
                                                {plan.is_active ? <Check size={14} /> : <X size={14} />}
                                            </button>
                                            <button onClick={() => handleDeletePlan(plan.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f87171', padding: 4 }}>
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                    {plan.description && <p style={{ margin: '0 0 8px', fontSize: 13, color: '#94a3b8' }}>{plan.description}</p>}
                                    <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
                                        <div><span style={{ fontSize: 11, color: '#64748b' }}>Monthly</span><p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#fbbf24' }}>₹{plan.price_monthly}</p></div>
                                        <div><span style={{ fontSize: 11, color: '#64748b' }}>Yearly</span><p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#fbbf24' }}>₹{plan.price_yearly}</p></div>
                                    </div>

                                    {/* ── Feature Checkboxes for Plan ── */}
                                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12 }}>
                                        <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
                                            FEATURES ({plan.features.length})
                                        </span>
                                        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                            {features.map(f => {
                                                const { enabled, value } = planHasFeature(plan, f.id);
                                                return (
                                                    <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', borderRadius: 6, background: enabled ? 'rgba(124,58,237,0.1)' : 'transparent' }}>
                                                        <button
                                                            onClick={() => handleTogglePlanFeature(plan.id, f, enabled)}
                                                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: enabled ? '#7c3aed' : '#475569', display: 'flex', alignItems: 'center' }}>
                                                            {enabled ? <CheckSquare size={15} /> : <Square size={15} />}
                                                        </button>
                                                        <span style={{ flex: 1, fontSize: 12, color: enabled ? '#e2e8f0' : '#64748b' }}>{f.name}</span>
                                                        {enabled && f.feature_type !== 'boolean' && (
                                                            <input
                                                                defaultValue={value}
                                                                onBlur={e => { if (e.target.value !== value) handleUpdatePlanFeatureValue(plan.id, f.id, e.target.value); }}
                                                                style={{ width: 80, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '2px 6px', color: '#a78bfa', fontSize: 12, textAlign: 'right', outline: 'none' }} />
                                                        )}
                                                        {enabled && f.feature_type === 'boolean' && (
                                                            <span style={{ fontSize: 11, color: '#4ade80', fontWeight: 600 }}>ON</span>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* ─── Features Tab ─── */}
                {tab === 'features' && (
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
                            <button onClick={() => setShowCreateFeature(!showCreateFeature)}
                                style={{ background: 'rgba(124,58,237,0.3)', border: '1px solid rgba(124,58,237,0.4)', color: '#c4b5fd', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                                <Plus size={15} /> Create Feature
                            </button>
                        </div>
                        {showCreateFeature && (
                            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 20, marginBottom: 20 }}>
                                <h3 style={{ margin: '0 0 12px', color: '#e2e8f0', fontSize: 15 }}>Create Feature</h3>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                    <div><label style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 4 }}>Key</label>
                                        <input value={newFeature.key} onChange={e => setNewFeature(p => ({ ...p, key: e.target.value }))} placeholder="ticket_limit"
                                            style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 12px', color: '#e2e8f0', fontSize: 13, outline: 'none' }} /></div>
                                    <div><label style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 4 }}>Name</label>
                                        <input value={newFeature.name} onChange={e => setNewFeature(p => ({ ...p, name: e.target.value }))} placeholder="Ticket Limit"
                                            style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 12px', color: '#e2e8f0', fontSize: 13, outline: 'none' }} /></div>
                                    <div><label style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 4 }}>Type</label>
                                        <select value={newFeature.feature_type} onChange={e => setNewFeature(p => ({ ...p, feature_type: e.target.value }))}
                                            style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 12px', color: '#e2e8f0', fontSize: 13, outline: 'none' }}>
                                            <option value="boolean">Boolean</option>
                                            <option value="numeric">Numeric</option>
                                            <option value="string">String</option>
                                        </select></div>
                                    <div><label style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 4 }}>Default Value</label>
                                        <input value={newFeature.default_value} onChange={e => setNewFeature(p => ({ ...p, default_value: e.target.value }))} placeholder="false"
                                            style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 12px', color: '#e2e8f0', fontSize: 13, outline: 'none' }} /></div>
                                </div>
                                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                                    <button onClick={handleCreateFeature} style={{ background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Create</button>
                                    <button onClick={() => setShowCreateFeature(false)} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
                                </div>
                            </div>
                        )}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {features.map(f => (
                                <div key={f.id} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ flex: 1 }}>
                                        <p style={{ margin: 0, color: '#e2e8f0', fontWeight: 600, fontSize: 14 }}>{f.name}</p>
                                        <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>{f.key} · {f.feature_type} · default: {f.default_value}</p>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ fontSize: 11, color: '#64748b', background: 'rgba(255,255,255,0.06)', padding: '3px 8px', borderRadius: 6 }}>{f.feature_type}</span>
                                        <button onClick={() => handleDeleteFeature(f.id, f.name)}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f87171', padding: 4, opacity: 0.6 }}
                                            title="Delete feature">
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                            {features.length === 0 && <p style={{ color: '#475569', fontSize: 14, textAlign: 'center', padding: 40 }}>No features yet. Create one above.</p>}
                        </div>
                    </div>
                )}

                {/* ─── Subscriptions Tab ─── */}
                {tab === 'subscriptions' && (
                    <div>
                        <p style={{ color: '#64748b', fontSize: 13, marginBottom: 16 }}>{subsTotal} active subscription(s)</p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {subs.map(s => (
                                <div key={s.id} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <p style={{ margin: 0, color: '#e2e8f0', fontWeight: 600 }}>{s.shop_name}</p>
                                        <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>
                                            {s.plan_name} · {s.billing_cycle} · {s.status}
                                        </p>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <p style={{ margin: 0, fontSize: 12, color: '#94a3b8' }}>
                                            {new Date(s.current_period_start).toLocaleDateString()} → {new Date(s.current_period_end).toLocaleDateString()}
                                        </p>
                                    </div>
                                </div>
                            ))}
                            {subs.length === 0 && <p style={{ color: '#475569', fontSize: 14, textAlign: 'center', padding: 40 }}>No subscriptions yet</p>}
                        </div>
                    </div>
                )}
            </main>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
