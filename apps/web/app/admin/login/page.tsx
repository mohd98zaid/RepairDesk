'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminLogin } from '@/lib/admin-api';
import { ShieldCheck, Loader2 } from 'lucide-react';

export default function AdminLoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const data = await adminLogin(email, password);
            localStorage.setItem('adminToken', data.access_token);
            router.push('/admin/dashboard');
        } catch {
            setError('Invalid admin credentials. Please try again.');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="admin-login-root">
            <div className="admin-login-card">
                <div className="admin-login-brand">
                    <ShieldCheck size={36} />
                    <h1>Admin Panel</h1>
                    <p>RepairDesk Platform Administration</p>
                </div>

                <form onSubmit={handleSubmit} className="admin-login-form">
                    {error && <div className="admin-login-error">{error}</div>}

                    <div className="form-group">
                        <label htmlFor="admin-email">Admin Email</label>
                        <input
                            id="admin-email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="admin@repairdesk.app"
                            required
                            autoFocus
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="admin-password">Password</label>
                        <input
                            id="admin-password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••••"
                            required
                        />
                    </div>

                    <button type="submit" className="btn-admin-login" disabled={loading}>
                        {loading ? <Loader2 size={18} className="spin" /> : <ShieldCheck size={18} />}
                        {loading ? 'Signing in…' : 'Sign in as Admin'}
                    </button>
                </form>

                <p className="admin-login-back">
                    <a href="/">← Back to RepairDesk</a>
                </p>
            </div>

            <style jsx>{`
        .admin-login-root {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #0f0c29, #302b63, #24243e);
          padding: 24px;
        }
        .admin-login-card {
          background: rgba(255,255,255,0.06);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 20px;
          padding: 48px 40px;
          width: 100%;
          max-width: 420px;
          box-shadow: 0 32px 80px rgba(0,0,0,0.4);
        }
        .admin-login-brand {
          text-align: center;
          margin-bottom: 36px;
          color: #fff;
        }
        .admin-login-brand svg { color: #a78bfa; margin-bottom: 12px; }
        .admin-login-brand h1 { font-size: 26px; font-weight: 700; margin: 0; }
        .admin-login-brand p { font-size: 13px; color: rgba(255,255,255,0.55); margin-top: 6px; }
        .admin-login-error {
          background: rgba(239,68,68,0.15);
          border: 1px solid rgba(239,68,68,0.3);
          color: #fca5a5;
          border-radius: 10px;
          padding: 12px 16px;
          font-size: 14px;
          margin-bottom: 20px;
        }
        .admin-login-form .form-group { margin-bottom: 18px; }
        .admin-login-form label {
          display: block;
          font-size: 13px;
          color: rgba(255,255,255,0.7);
          margin-bottom: 6px;
          font-weight: 500;
        }
        .admin-login-form input {
          width: 100%;
          padding: 12px 16px;
          background: rgba(255,255,255,0.08);
          border: 1px solid rgba(255,255,255,0.15);
          border-radius: 10px;
          color: #fff;
          font-size: 15px;
          box-sizing: border-box;
          transition: border-color 0.2s;
        }
        .admin-login-form input:focus {
          outline: none;
          border-color: #a78bfa;
          background: rgba(167,139,250,0.08);
        }
        .admin-login-form input::placeholder { color: rgba(255,255,255,0.3); }
        .btn-admin-login {
          width: 100%;
          padding: 14px;
          background: linear-gradient(135deg, #7c3aed, #a78bfa);
          color: #fff;
          border: none;
          border-radius: 12px;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          margin-top: 8px;
          transition: opacity 0.2s, transform 0.1s;
        }
        .btn-admin-login:hover:not(:disabled) { opacity: 0.9; transform: translateY(-1px); }
        .btn-admin-login:disabled { opacity: 0.6; cursor: not-allowed; }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .admin-login-back {
          text-align: center;
          margin-top: 24px;
          font-size: 13px;
        }
        .admin-login-back a { color: rgba(255,255,255,0.45); text-decoration: none; }
        .admin-login-back a:hover { color: rgba(255,255,255,0.75); }
      `}</style>
        </div>
    );
}
