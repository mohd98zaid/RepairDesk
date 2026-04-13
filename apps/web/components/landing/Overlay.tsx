'use client';
import Link from 'next/link';

/* ─────────────────────────────────────────────────────────
   Utilities
───────────────────────────────────────────────────────── */
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const range = (p: number, start: number, dur: number) => clamp((p - start) / dur);
const bell  = (p: number, start: number, dur: number) => Math.sin(range(p, start, dur) * Math.PI);

/* ─────────────────────────────────────────────────────────
   Tiny atoms
───────────────────────────────────────────────────────── */
const Tag = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-center gap-2 mb-3">
    <span className="h-px w-5 bg-emerald-500" />
    <span className="text-emerald-400 text-[10px] font-mono tracking-[0.3em] uppercase">{children}</span>
  </div>
);

const Check = ({ children }: { children: React.ReactNode }) => (
  <li className="flex items-start gap-2.5 text-slate-300 text-sm leading-relaxed">
    <span className="mt-0.5 text-emerald-400 font-black flex-shrink-0 text-xs">✓</span>
    <span>{children}</span>
  </li>
);

const Pill = ({ children }: { children: React.ReactNode }) => (
  <span className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-slate-400 text-[10px] font-bold tracking-widest uppercase">
    {children}
  </span>
);

/* ─────────────────────────────────────────────────────────
   Progress bar
───────────────────────────────────────────────────────── */
const ProgressBar = ({ p }: { p: number }) => (
  <div className="fixed top-0 left-0 right-0 z-50 h-[2px] pointer-events-none">
    <div
      className="h-full transition-none"
      style={{
        width: `${p * 100}%`,
        background: 'linear-gradient(90deg, transparent, #10b981, transparent)',
        boxShadow: '0 0 8px rgba(16,185,129,0.9)',
      }}
    />
  </div>
);

/* ─────────────────────────────────────────────────────────
   Scroll hint
───────────────────────────────────────────────────────── */
const ScrollHint = ({ visible }: { visible: boolean }) => (
  <div
    className="fixed bottom-8 left-1/2 z-30 pointer-events-none flex flex-col items-center gap-1.5 transition-all duration-500"
    style={{
      opacity: visible ? 1 : 0,
      transform: `translateX(-50%) translateY(${visible ? 0 : 12}px)`,
    }}
  >
    <span className="text-[9px] text-slate-500 font-mono tracking-[0.35em] uppercase">Scroll</span>
    <svg width="14" height="26" viewBox="0 0 14 26" fill="none"
      style={{ animation: 'bob 1.6s ease-in-out infinite' }}>
      <path d="M7 0L7 22M2 17L7 22L12 17"
        stroke="rgba(16,185,129,0.7)" strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
    <style>{`@keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(5px)}}`}</style>
  </div>
);

/* ─────────────────────────────────────────────────────────
   Glass card — dark backdrop for readability over video
───────────────────────────────────────────────────────── */
const Glass = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div
    className={`rounded-2xl md:rounded-3xl px-5 py-5 md:px-8 md:py-7 ${className}`}
    style={{
      background: 'rgba(2, 4, 10, 0.88)',
      backdropFilter: 'blur(28px) saturate(180%)',
      WebkitBackdropFilter: 'blur(28px) saturate(180%)',
      border: '1px solid rgba(255,255,255,0.09)',
      boxShadow: '0 28px 60px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.04)',
    }}
  >
    {children}
  </div>
);

/* ─────────────────────────────────────────────────────────
   Panel — fixed overlay
   Mobile:  vertically centred, full-width card
   Desktop: left / right / center aligned
───────────────────────────────────────────────────────── */
function Panel({
  opacity, side = 'left', children,
}: { opacity: number; side?: 'left' | 'right' | 'center'; children: React.ReactNode }) {
  const desktopAlign = {
    left:   'md:items-start  md:pl-16 lg:pl-24',
    right:  'md:items-end    md:pr-16 lg:pr-24',
    center: 'md:items-center md:px-8',
  }[side];

  return (
    <div
      className="fixed inset-0 z-20 flex flex-col justify-center items-center px-4"
      style={{
        opacity,
        transition: 'opacity 0.15s ease',
        visibility: opacity > 0.02 ? 'visible' : 'hidden',
        pointerEvents: opacity > 0.05 ? 'auto' : 'none'
      }}
    >
      <div className={`w-full h-full flex flex-col justify-center items-center ${desktopAlign}`}>
        {children}
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════
   MAIN EXPORT
═════════════════════════════════════════════════════════ */
export function Overlay({ scrollProgress: p }: { scrollProgress: number }) {
  const pct = Math.round(p * 100);

  const op = [
    1 - range(p, 0, 0.12),   // 0 Hero
    bell(p, 0.08, 0.24),      // 1 Tickets    peak 20 %
    bell(p, 0.29, 0.24),      // 2 Inventory  peak 41 %
    bell(p, 0.49, 0.24),      // 3 WhatsApp   peak 61 %
    bell(p, 0.68, 0.20),      // 4 AI         peak 78 %
    range(p, 0.84, 0.16),     // 5 Journey    100 %
  ];

  const activeLabel =
    p < 0.08 ? 'HERO'
    : p < 0.32 ? '01_TICKETS'
    : p < 0.52 ? '02_INVENTORY'
    : p < 0.72 ? '03_COMMS'
    : p < 0.84 ? '04_INSIGHTS'
    : '05_START';

  return (
    <div className="relative w-full">
      {/* 700 vh scroll spacer */}
      <div className="h-[700vh] w-full pointer-events-none" />

      <ProgressBar p={p} />
      <ScrollHint visible={p < 0.04} />

      {/* Debug HUD — desktop only */}
      <div className="fixed bottom-4 left-4 z-30 pointer-events-none hidden md:block">
        <p className="text-[9px] text-slate-700 font-mono tracking-[0.3em] uppercase">REPAIR_DESKZ // SYS_OK</p>
        <p className="text-[9px] text-emerald-900 font-mono tracking-[0.3em] uppercase mt-0.5">
          {activeLabel} // {pct.toString().padStart(3, '0')}%
        </p>
      </div>

      {/* ══════════════════ 0 — HERO ══════════════════ */}
      <Panel opacity={op[0]} side="left">
        <Glass className="w-full md:max-w-lg">
          <Tag>Digital OS for Repair Shops</Tag>
          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black tracking-tight text-white leading-[1.0] mb-3">
            Repair<span className="text-emerald-400">Deskz</span>
          </h1>
          <p className="text-slate-400 text-sm md:text-base leading-relaxed mb-5 max-w-sm">
            The complete command centre for modern repair shops.{' '}
            <span className="text-white font-medium">Tickets, parts, customers — all in one place.</span>
          </p>
          <div className="flex flex-wrap gap-3 mb-5">
            <Link href="/register"
              className="px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-sm transition-all hover:scale-105 shadow-lg shadow-emerald-500/25">
              Start Free →
            </Link>
            <Link href="/login"
              className="px-6 py-3 rounded-xl border border-white/10 hover:bg-white/5 text-slate-300 font-bold text-sm transition-all">
              Sign In
            </Link>
          </div>
          <div className="flex flex-wrap gap-5">
            {[['350+', 'Shops'], ['98%', 'Satisfaction'], ['60s', 'Avg Ticket']].map(([n, l]) => (
              <div key={l} className="flex items-center gap-1.5">
                <span className="text-lg font-black text-white">{n}</span>
                <span className="text-slate-600 text-[10px] font-medium uppercase tracking-widest">{l}</span>
              </div>
            ))}
          </div>
        </Glass>
      </Panel>

      {/* ══════════════════ 1 — TICKETS ══════════════════ */}
      <Panel opacity={op[1]} side="left">
        <Glass className="w-full md:max-w-sm">
          <Tag>01 — Ticket Management</Tag>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-white leading-[1.05] mb-3">
            Tickets in<br />
            <span className="text-emerald-400">60 seconds.</span>
          </h2>
          <p className="text-slate-400 text-sm leading-relaxed mb-4">
            Customer info, device, fault, parts — one seamless flow. No paper, no confusion.
          </p>
          <ul className="space-y-2 mb-4">
            <Check>Barcode &amp; QR scan for instant device ID</Check>
            <Check>Auto-fill returning customer data</Check>
            <Check>Photo documentation of inbound damage</Check>
            <Check>Assign to technician in one tap</Check>
          </ul>
          <div className="flex gap-2 flex-wrap">
            <Pill>Smart I/O</Pill><Pill>Instant</Pill><Pill>Paperless</Pill>
          </div>
        </Glass>
      </Panel>

      {/* ══════════════════ 2 — INVENTORY ══════════════════ */}
      <Panel opacity={op[2]} side="right">
        <Glass className="w-full md:max-w-sm">
          <Tag>02 — Inventory</Tag>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-white leading-[1.05] mb-3">
            Parts, always<br />
            <span className="text-emerald-400">accounted for.</span>
          </h2>
          <p className="text-slate-400 text-sm leading-relaxed mb-4">
            Real-time stock with auto-deduction on ticket completion. Know your margins to the last screw.
          </p>
          <ul className="space-y-2 mb-4">
            <Check>Auto-deduction on ticket completion</Check>
            <Check>Low-stock alerts before you run out</Check>
            <Check>Supplier management &amp; purchase orders</Check>
            <Check>Per-part cost &amp; margin tracking</Check>
          </ul>
          <div className="grid grid-cols-3 gap-2 pt-3 border-t border-white/5">
            {[['0', 'Lost Parts'], ['100%', 'Accuracy'], ['2 min', 'Reorder']].map(([n, l]) => (
              <div key={l} className="text-center">
                <div className="text-base font-black text-emerald-400">{n}</div>
                <div className="text-slate-600 text-[9px] font-bold uppercase tracking-wider">{l}</div>
              </div>
            ))}
          </div>
        </Glass>
      </Panel>

      {/* ══════════════════ 3 — WHATSAPP ══════════════════ */}
      <Panel opacity={op[3]} side="left">
        <Glass className="w-full md:max-w-sm">
          <Tag>03 — Customer Comms</Tag>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-white leading-[1.05] mb-3">
            Customers stay<br />
            <span className="text-emerald-400">in the loop.</span>
          </h2>
          <p className="text-slate-400 text-sm leading-relaxed mb-4">
            Automatic WhatsApp updates fire on every status change — no manual effort required.
          </p>
          <div className="space-y-2 mb-4">
            {[
              { icon: '📥', text: 'Device received. Ticket #2847 open.' },
              { icon: '🔧', text: 'Repair started — est. 2 hours.' },
              { icon: '✅', text: 'Ready for pickup! Total: £230.' },
            ].map(({ icon, text }) => (
              <div key={icon}
                className="flex items-start gap-2.5 rounded-xl px-3 py-2.5 text-xs text-slate-300 leading-relaxed"
                style={{ background: 'rgba(37,211,102,0.07)', border: '1px solid rgba(37,211,102,0.12)' }}>
                <span className="flex-shrink-0">{icon}</span>{text}
              </div>
            ))}
          </div>
          <div className="flex gap-2 flex-wrap">
            <Pill>Auto-send</Pill><Pill>WhatsApp Business</Pill>
          </div>
        </Glass>
      </Panel>

      {/* ══════════════════ 4 — AI & ANALYTICS ══════════════════ */}
      <Panel opacity={op[4]} side="right">
        <Glass className="w-full md:max-w-sm">
          <Tag>04 — AI &amp; Insights</Tag>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-white leading-[1.05] mb-3">
            Ask your shop<br />
            <span className="text-emerald-400">anything.</span>
          </h2>
          <p className="text-slate-400 text-sm leading-relaxed mb-4">
            Natural language AI plus full revenue analytics — per-technician performance, busiest hours, most-repaired brands.
          </p>
          <div className="space-y-2 mb-4">
            {[
              '"How many screens did we replace this week?"',
              '"Show all pending Samsung tickets"',
              '"Which tech has the best close rate?"',
            ].map((q) => (
              <div key={q}
                className="rounded-xl px-3 py-2.5 text-xs text-slate-300 font-mono leading-relaxed"
                style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.15)' }}>
                {q}
              </div>
            ))}
          </div>
          <div className="flex gap-2 flex-wrap">
            <Pill>AI Assistant</Pill><Pill>Analytics</Pill>
          </div>
        </Glass>
      </Panel>

      {/* ══════════════════ 5 — START YOUR JOURNEY ══════════════════ */}
      <Panel opacity={op[5]} side="center">
        <Glass className="w-full md:max-w-lg text-center">
          <Tag>Ready?</Tag>
          <h2
            className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black tracking-tighter text-white leading-[1.0] mb-4"
            style={{ textShadow: '0 0 60px rgba(16,185,129,0.35)' }}
          >
            Start your<br />
            <span className="text-emerald-400">journey.</span>
          </h2>
          <p className="text-slate-400 text-sm md:text-base leading-relaxed mb-6 max-w-sm mx-auto">
            Join 350+ repair shops already on RepairDeskz. Free to start — no credit card, no commitment.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-6">
            <Link href="/register"
              className="px-8 py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-sm transition-all hover:scale-105 shadow-xl shadow-emerald-500/30">
              Get Started Free →
            </Link>
            <Link href="/login"
              className="px-8 py-4 rounded-2xl border border-white/10 hover:bg-white/5 text-slate-300 font-bold text-sm transition-all">
              Sign In
            </Link>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-4">
            {['Free forever plan', 'No card required', 'Up in 5 minutes', 'Cancel any time'].map((t) => (
              <div key={t} className="flex items-center gap-1.5 text-slate-500 text-xs">
                <span className="text-emerald-500 font-black text-[10px]">✓</span>{t}
              </div>
            ))}
          </div>
        </Glass>
      </Panel>
    </div>
  );
}
