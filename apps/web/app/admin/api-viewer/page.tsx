'use client';
import { useState, useEffect } from 'react';
import AdminNav from '@/components/admin/AdminNav';
import { getAdminMe } from '@/lib/admin-api';
import { useRouter } from 'next/navigation';
import { Server, ExternalLink, RefreshCw, Maximize2, Minimize2 } from 'lucide-react';

export default function ApiViewerPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [fullscreen, setFullscreen] = useState(false);

    const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
    const docsUrl = apiBaseUrl.replace(/\/api\/v1\/?$/, '/docs');
    const redocUrl = apiBaseUrl.replace(/\/api\/v1\/?$/, '/redoc');

    useEffect(() => {
        // Verify admin session
        getAdminMe()
            .then(() => setLoading(false))
            .catch((e: any) => {
                if (e?.response?.status === 401) { router.push('/admin/login'); return; }
                setLoading(false);
            });
    }, []);

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
            <main className="admin-main" style={{ padding: fullscreen ? 0 : undefined }}>
                {!fullscreen && (
                    <header className="admin-header">
                        <div>
                            <h1 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Server size={22} style={{ color: '#a78bfa' }} /> API Documentation
                            </h1>
                            <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0' }}>
                                FastAPI Swagger UI — Interactive API explorer
                            </p>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <a href={docsUrl} target="_blank" rel="noopener noreferrer"
                                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, textDecoration: 'none' }}>
                                <ExternalLink size={15} /> Open in New Tab
                            </a>
                            <a href={redocUrl} target="_blank" rel="noopener noreferrer"
                                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, textDecoration: 'none' }}>
                                <ExternalLink size={15} /> ReDoc
                            </a>
                            <button onClick={() => setFullscreen(true)}
                                style={{ background: 'rgba(124,58,237,0.3)', border: '1px solid rgba(124,58,237,0.4)', color: '#c4b5fd', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                                <Maximize2 size={15} /> Fullscreen
                            </button>
                        </div>
                    </header>
                )}

                {fullscreen && (
                    <button onClick={() => setFullscreen(false)}
                        style={{ position: 'fixed', top: 12, right: 12, zIndex: 1000, background: 'rgba(15,17,23,0.9)', border: '1px solid rgba(255,255,255,0.2)', color: '#c4b5fd', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, backdropFilter: 'blur(8px)' }}>
                        <Minimize2 size={14} /> Exit Fullscreen
                    </button>
                )}

                <div style={{
                    borderRadius: fullscreen ? 0 : 16,
                    overflow: 'hidden',
                    border: fullscreen ? 'none' : '1px solid rgba(255,255,255,0.08)',
                    height: fullscreen ? '100vh' : 'calc(100vh - 180px)',
                    background: '#fff',
                }}>
                    <iframe
                        src={docsUrl}
                        style={{ width: '100%', height: '100%', border: 'none' }}
                        title="FastAPI Documentation"
                    />
                </div>
            </main>
        </div>
    );
}
