'use client';

import { useEffect, useRef, useState } from 'react';

/* ─────────────────────────────────────────
   Tiny utility: animate a counter up
───────────────────────────────────────── */
function useCountUp(target: number, duration = 1800, start = false) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!start) return;
    let startTime: number | null = null;
    const step = (ts: number) => {
      if (!startTime) startTime = ts;
      const progress = Math.min((ts - startTime) / duration, 1);
      setValue(Math.floor(progress * target));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target, duration, start]);
  return value;
}

/* ─────────────────────────────────────────
   Intersection observer hook
───────────────────────────────────────── */
function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setInView(true); },
      { threshold }
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, inView };
}

/* ─────────────────────────────────────────
   Stat card with animated counter
───────────────────────────────────────── */
function Stat({ value, suffix, label, inView }: { value: number; suffix: string; label: string; inView: boolean }) {
  const count = useCountUp(value, 1600, inView);
  return (
    <div className="text-center px-8">
      <div className="text-5xl md:text-6xl font-black text-white tracking-tight">
        {count}{suffix}
      </div>
      <div className="text-slate-500 text-sm mt-2 font-medium tracking-wide uppercase">{label}</div>
    </div>
  );
}

/* ─────────────────────────────────────────
   Feature card
───────────────────────────────────────── */
function FeatureCard({ icon, title, desc, tag }: { icon: string; title: string; desc: string; tag?: string }) {
  return (
    <div
      className="group relative rounded-2xl p-px overflow-hidden transition-all duration-300 hover:-translate-y-1"
      style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02))' }}
    >
      {/* gradient border on hover */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl"
        style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.4), rgba(16,185,129,0.05))' }}
      />
      <div
        className="relative rounded-2xl p-7 h-full"
        style={{ background: 'rgba(10,10,20,0.85)', backdropFilter: 'blur(12px)' }}
      >
        {tag && (
          <span className="inline-block mb-4 text-[10px] font-bold tracking-[0.25em] uppercase px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            {tag}
          </span>
        )}
        <div className="text-3xl mb-4">{icon}</div>
        <h3 className="text-white font-bold text-lg mb-2">{title}</h3>
        <p className="text-slate-500 text-sm leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   Pricing card
───────────────────────────────────────── */
function PricingCard({
  name, price, period = '/mo', desc, features, cta, highlight = false,
}: {
  name: string; price: string; period?: string; desc: string;
  features: string[]; cta: string; highlight?: boolean;
}) {
  return (
    <div
      className={`relative rounded-3xl p-px transition-all duration-300 hover:-translate-y-2 ${highlight ? 'scale-[1.03]' : ''}`}
      style={{
        background: highlight
          ? 'linear-gradient(135deg, rgba(16,185,129,0.6), rgba(16,185,129,0.1))'
          : 'linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.02))',
      }}
    >
      {highlight && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-emerald-500 text-black text-[11px] font-black px-4 py-1 rounded-full uppercase tracking-widest">
          Most Popular
        </div>
      )}
      <div
        className="rounded-3xl p-8 h-full flex flex-col"
        style={{ background: highlight ? 'rgba(10,20,15,0.95)' : 'rgba(10,10,20,0.90)', backdropFilter: 'blur(20px)' }}
      >
        <div className="mb-6">
          <div className="text-xs font-bold tracking-[0.3em] uppercase text-slate-500 mb-2">{name}</div>
          <div className="flex items-end gap-1 mb-2">
            <span className="text-5xl font-black text-white">{price}</span>
            {price !== 'Free' && <span className="text-slate-500 mb-2 font-medium">{period}</span>}
          </div>
          <p className="text-slate-500 text-sm">{desc}</p>
        </div>
        <ul className="space-y-3 flex-1 mb-8">
          {features.map((f) => (
            <li key={f} className="flex items-center gap-3 text-sm text-slate-400">
              <span className="text-emerald-400 flex-shrink-0 font-bold">✓</span> {f}
            </li>
          ))}
        </ul>
        <button
          className={`w-full py-4 rounded-2xl font-bold text-sm transition-all ${
            highlight
              ? 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-lg shadow-emerald-500/25'
              : 'border border-white/10 hover:bg-white/5 text-white'
          }`}
        >
          {cta}
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   FAQ item
───────────────────────────────────────── */
function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="border border-white/6 rounded-2xl overflow-hidden transition-all duration-200"
      style={{ background: 'rgba(255,255,255,0.02)' }}
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-7 py-5 text-left group"
      >
        <span className="text-white font-semibold text-sm md:text-base pr-4">{q}</span>
        <span
          className="text-emerald-400 text-xl flex-shrink-0 transition-transform duration-300"
          style={{ transform: open ? 'rotate(45deg)' : 'rotate(0deg)' }}
        >
          +
        </span>
      </button>
      <div
        className="overflow-hidden transition-all duration-300"
        style={{ maxHeight: open ? '500px' : '0px' }}
      >
        <p className="px-7 pb-6 text-slate-500 text-sm leading-relaxed">{a}</p>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   Testimonial card
───────────────────────────────────────── */
function Testimonial({ quote, name, role, initials }: { quote: string; name: string; role: string; initials: string }) {
  return (
    <div
      className="rounded-2xl p-7 flex flex-col gap-5"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <div className="text-emerald-400 text-2xl">"</div>
      <p className="text-slate-300 text-sm leading-relaxed flex-1">"{quote}"</p>
      <div className="flex items-center gap-3 pt-2 border-t border-white/5">
        <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-black text-sm flex-shrink-0">
          {initials}
        </div>
        <div>
          <div className="text-white font-semibold text-sm">{name}</div>
          <div className="text-slate-600 text-xs">{role}</div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   Section label
───────────────────────────────────────── */
const Label = ({ text }: { text: string }) => (
  <div className="flex items-center justify-center gap-3 mb-5">
    <span className="h-px w-8 bg-emerald-500/60" />
    <span className="text-emerald-400 text-xs font-mono tracking-[0.3em] uppercase">{text}</span>
    <span className="h-px w-8 bg-emerald-500/60" />
  </div>
);

/* ═══════════════════════════════════════════
   MAIN EXPORT
═══════════════════════════════════════════ */
export function LandingContent() {
  const { ref: statsRef, inView: statsInView } = useInView();

  return (
    <div
      className="relative text-white"
      style={{ background: 'linear-gradient(180deg, #000000 0%, #060610 8%, #080818 100%)' }}
    >
      {/* ── STATS BAR ── */}
      <section ref={statsRef} className="border-y border-white/5 py-14">
        <div className="max-w-5xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-10 divide-x divide-white/5">
          <Stat value={2400}  suffix="+"  label="Repairs Tracked"    inView={statsInView} />
          <Stat value={98}    suffix="%"  label="Customer Satisfaction" inView={statsInView} />
          <Stat value={60}    suffix="s"  label="Avg Ticket Creation" inView={statsInView} />
          <Stat value={350}   suffix="+"  label="Shops Onboarded"    inView={statsInView} />
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" className="max-w-7xl mx-auto px-6 md:px-10 py-28">
        <div className="text-center mb-16">
          <Label text="Everything You Need" />
          <h2 className="text-4xl md:text-6xl font-extrabold tracking-tight text-white mb-5">
            Built for repair shops.<br />
            <span className="text-emerald-400">Engineered to scale.</span>
          </h2>
          <p className="text-slate-500 max-w-xl mx-auto text-lg leading-relaxed">
            Every feature designed around the real workflow of independent repair professionals — not generic business software.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          <FeatureCard
            icon="⚡"
            title="Lightning Ticket Flow"
            desc="Create a fully detailed repair ticket — customer info, device, issue, parts — in under 60 seconds with smart auto-fill and barcode scanning."
            tag="Core"
          />
          <FeatureCard
            icon="📦"
            title="Smart Inventory"
            desc="Real-time parts tracking with auto-deduction on ticket completion. Low-stock alerts, supplier management, and purchase orders built-in."
            tag="Inventory"
          />
          <FeatureCard
            icon="💬"
            title="WhatsApp Automation"
            desc="Customers get automatic updates on every status change — received, in progress, ready for pickup — without you lifting a finger."
            tag="Comms"
          />
          <FeatureCard
            icon="🤖"
            title="AI Assistant"
            desc="Ask questions in plain English: 'How many iPhone screens did we replace this month?' or 'Show me all pending Sony tickets'. Instant answers."
            tag="AI"
          />
          <FeatureCard
            icon="📊"
            title="Revenue Analytics"
            desc="Full profit & loss reports, per-technician performance, busiest hours, most repaired brands. Know your numbers at a glance."
          />
          <FeatureCard
            icon="🔒"
            title="Offline-First PWA"
            desc="Works without internet. Install it on any device — iOS, Android, desktop. All data syncs automatically when you're back online."
          />
          <FeatureCard
            icon="🧾"
            title="Digital Invoices"
            desc="Generate beautiful, printable or PDF invoices instantly. E-signature support and customer approval flow built in."
          />
          <FeatureCard
            icon="👥"
            title="Multi-Technician"
            desc="Assign tickets to different technicians, track individual workloads, set permissions and roles for bench staff vs managers."
          />
          <FeatureCard
            icon="🔗"
            title="QR Tracking"
            desc="Print QR labels for devices on the bench. Scan on any phone to instantly pull up the full repair history and current status."
          />
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how-it-works" className="py-28 relative overflow-hidden">
        {/* faint background grid */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: 'linear-gradient(rgba(16,185,129,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(16,185,129,0.03) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />
        <div className="max-w-7xl mx-auto px-6 md:px-10 relative">
          <div className="text-center mb-20">
            <Label text="Process" />
            <h2 className="text-4xl md:text-6xl font-extrabold tracking-tight text-white">
              Up and running in <span className="text-emerald-400">minutes</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8 relative">
            {/* connector lines */}
            <div className="hidden md:block absolute top-12 left-1/3 right-1/3 h-px bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent" />

            {[
              { step: '01', title: 'Create your shop', desc: 'Sign up, set your shop name, logo and working hours. Takes 2 minutes. No credit card needed.' },
              { step: '02', title: 'Add devices & parts', desc: 'Import your parts catalogue or add them on the fly. RepairDesk auto-suggests common device configurations.' },
              { step: '03', title: 'Start taking tickets', desc: 'Receive a device, scan or search the customer, open a ticket. Your digital shop diary is live.' },
            ].map(({ step, title, desc }) => (
              <div key={step} className="flex flex-col items-center text-center">
                <div
                  className="w-24 h-24 rounded-3xl flex items-center justify-center mb-6 text-emerald-400 font-black text-2xl"
                  style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}
                >
                  {step}
                </div>
                <h3 className="text-white font-bold text-xl mb-3">{title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed max-w-xs">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURE HIGHLIGHT: TICKET ── */}
      <section className="max-w-7xl mx-auto px-6 md:px-10 py-24">
        <div className="grid md:grid-cols-2 gap-16 items-center">
          <div>
            <Label text="Ticket Management" />
            <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight text-white mb-6">
              Every repair.<br />
              <span className="text-emerald-400">Fully documented.</span>
            </h2>
            <p className="text-slate-500 text-lg leading-relaxed mb-8">
              From the moment a device walks in to the second it walks out — every diagnostic note, replaced part, technician action, and customer message is logged and searchable forever.
            </p>
            <ul className="space-y-4">
              {[
                'Barcode & QR scan for instant device ID',
                'Photo documentation of incoming damage',
                'Per-part cost tracking with auto margin calculation',
                'Customer digital signature on completion',
                'Full audit trail — who did what and when',
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-slate-400 text-sm">
                  <span className="text-emerald-400 font-bold mt-0.5 flex-shrink-0">→</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* mock ticket card */}
          <div
            className="rounded-3xl p-8"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            <div className="flex items-center justify-between mb-6">
              <span className="text-emerald-400 text-xs font-mono font-bold tracking-widest">#TKT-2847</span>
              <span className="text-[11px] bg-blue-500/15 text-blue-400 border border-blue-500/20 rounded-full px-3 py-1 font-bold uppercase tracking-wider">In Progress</span>
            </div>
            <div className="space-y-4 mb-6">
              <div>
                <div className="text-slate-600 text-xs uppercase tracking-wider mb-1">Device</div>
                <div className="text-white font-semibold">iPhone 16 Pro Max — 256GB Desert Titanium</div>
              </div>
              <div>
                <div className="text-slate-600 text-xs uppercase tracking-wider mb-1">Issue</div>
                <div className="text-slate-300 text-sm">Cracked screen, Face ID not functioning after drop</div>
              </div>
              <div>
                <div className="text-slate-600 text-xs uppercase tracking-wider mb-1">Parts</div>
                <div className="space-y-2">
                  {[
                    { part: 'OEM Display Assembly', price: '£149' },
                    { part: 'Face ID Flex Cable', price: '£28' },
                  ].map(({ part, price }) => (
                    <div key={part} className="flex justify-between text-sm">
                      <span className="text-slate-400">{part}</span>
                      <span className="text-white font-medium">{price}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div
              className="flex items-center justify-between rounded-xl px-5 py-4"
              style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)' }}
            >
              <span className="text-slate-400 text-sm font-medium">Total (incl. labour)</span>
              <span className="text-emerald-400 font-black text-xl">£230</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── FEATURE HIGHLIGHT: WHATSAPP ── */}
      <section className="max-w-7xl mx-auto px-6 md:px-10 py-24">
        <div className="grid md:grid-cols-2 gap-16 items-center">
          {/* WhatsApp chat mockup */}
          <div
            className="rounded-3xl p-6 order-2 md:order-1"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-white/5">
              <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-500/20 flex items-center justify-center text-emerald-400 text-lg">💬</div>
              <div>
                <div className="text-white font-semibold text-sm">RepairDesk Notifications</div>
                <div className="text-slate-600 text-xs">via WhatsApp</div>
              </div>
            </div>
            <div className="space-y-3">
              {[
                { msg: "📥 Your iPhone 16 Pro Max has been received. Ticket #TKT-2847 has been opened. We'll keep you updated!", time: '10:02 AM', type: 'in' },
                { msg: '🔧 Good news! Our technician has started working on your device. Estimated completion: 2 hours.', time: '11:45 AM', type: 'in' },
                { msg: '✅ Your device is repaired and ready for collection! Visit us at your convenience. Total: £230.', time: '2:17 PM', type: 'in' },
              ].map(({ msg, time }) => (
                <div key={time} className="flex flex-col items-start max-w-[90%]">
                  <div
                    className="rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-slate-300 leading-relaxed"
                    style={{ background: 'rgba(37,211,102,0.08)', border: '1px solid rgba(37,211,102,0.12)' }}
                  >
                    {msg}
                  </div>
                  <span className="text-slate-700 text-[10px] mt-1 ml-1">{time}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="order-1 md:order-2">
            <Label text="Customer Comms" />
            <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight text-white mb-6">
              Keep customers<br />
              <span className="text-emerald-400">in the loop.</span>
            </h2>
            <p className="text-slate-500 text-lg leading-relaxed mb-8">
              Stop fielding "Is my phone ready?" calls. RepairDesk sends automatic WhatsApp messages at every status change so customers always know exactly where their device is.
            </p>
            <ul className="space-y-4">
              {[
                'Triggered automatically on status change',
                'Customisable message templates',
                'Delivery receipts logged on the ticket',
                'Works with your existing WhatsApp Business number',
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-slate-400 text-sm">
                  <span className="text-emerald-400 font-bold mt-0.5 flex-shrink-0">→</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section className="py-28 relative">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 60% 40% at 50% 50%, rgba(16,185,129,0.04), transparent)' }}
        />
        <div className="max-w-7xl mx-auto px-6 md:px-10 relative">
          <div className="text-center mb-16">
            <Label text="Social Proof" />
            <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight text-white">
              Loved by repair pros
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            <Testimonial
              quote="We used to track repairs in a notebook. RepairDesk cut our admin time by 70%. The WhatsApp notifications alone stopped 30 calls a week."
              name="Tariq Hussain"
              role="Owner, TechFix Manchester"
              initials="TH"
            />
            <Testimonial
              quote="The inventory auto-deduction is a game changer. I used to lose track of parts constantly. Now my stock counts are always accurate to the penny."
              name="Priya Mehta"
              role="Manager, iRepair Bristol"
              initials="PM"
            />
            <Testimonial
              quote="Set it up in 20 minutes. By the end of day one I&apos;d processed 12 tickets. The QR tracking means any of my 3 technicians can pick up any job instantly."
              name="James O'Neill"
              role="Founder, Gadget Clinic Dublin"
              initials="JO"
            />
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="pricing" className="max-w-7xl mx-auto px-6 md:px-10 py-28">
        <div className="text-center mb-16">
          <Label text="Pricing" />
          <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight text-white mb-4">
            Simple, honest pricing
          </h2>
          <p className="text-slate-500 max-w-md mx-auto">No hidden fees. No per-ticket charges. Cancel any time.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-6 items-start">
          <PricingCard
            name="Starter"
            price="Free"
            desc="Perfect for testing the water. No card required."
            features={[
              'Up to 30 tickets / month',
              '1 technician account',
              'Basic inventory tracking',
              'PDF invoices',
              'Email support',
            ]}
            cta="Get Started Free"
          />
          <PricingCard
            name="Pro"
            price="£29"
            desc="For busy single-location repair shops."
            features={[
              'Unlimited tickets',
              '3 technician accounts',
              'Full inventory + auto-deduction',
              'WhatsApp automation',
              'Revenue analytics',
              'AI Assistant',
              'QR device labels',
              'Priority support',
            ]}
            cta="Start 14-Day Free Trial"
            highlight
          />
          <PricingCard
            name="Business"
            price="£79"
            desc="Multi-location shops and growing chains."
            features={[
              'Everything in Pro',
              'Unlimited technicians',
              'Multi-location dashboard',
              'Custom branding on invoices',
              'API access',
              'Dedicated account manager',
              'SLA support',
            ]}
            cta="Talk to Sales"
          />
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="max-w-3xl mx-auto px-6 py-24">
        <div className="text-center mb-14">
          <Label text="FAQ" />
          <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight text-white">
            Common questions
          </h2>
        </div>
        <div className="space-y-3">
          {[
            { q: 'How long does setup take?', a: 'Most shops are fully operational within 30 minutes. Create your account, add your business details, import or manually add a few parts, and start taking tickets. No training session needed.' },
            { q: 'Does it work offline?', a: 'Yes. RepairDesk is a Progressive Web App (PWA) that caches all your data locally. You can create tickets, update statuses and record parts usage without any internet connection. Everything syncs automatically when you reconnect.' },
            { q: 'Can I migrate my existing data?', a: 'We support CSV import for customers, parts catalogue and historical tickets. Our support team can also help with custom imports from popular systems like RepairShopr, RepairDesk.com, or Fixably.' },
            { q: 'How does WhatsApp integration work?', a: 'RepairDesk connects to your existing WhatsApp Business account via the official Cloud API. Messages are sent automatically when you change a ticket status — no manual effort required. You keep full control of your number.' },
            { q: 'Is my data secure?', a: 'All data is encrypted in transit (TLS 1.3) and at rest. We run on enterprise cloud infrastructure with daily backups. You own your data and can export it at any time in full.' },
            { q: 'What happens if I exceed the Starter limits?', a: "You'll get a gentle in-app notification and a prompt to upgrade. We'll never suddenly block access or delete your data." },
          ].map(({ q, a }) => (
            <FAQItem key={q} q={q} a={a} />
          ))}
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section className="py-32 relative overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 50%, rgba(16,185,129,0.08), transparent 70%)' }}
        />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: 'linear-gradient(rgba(16,185,129,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(16,185,129,0.04) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />
        <div className="relative max-w-3xl mx-auto px-6 text-center">
          <Label text="Get Started Today" />
          <h2 className="text-5xl md:text-7xl font-black tracking-tighter text-white mb-6 leading-tight">
            Your shop.<br />
            <span className="text-emerald-400">Fully digital.</span>
          </h2>
          <p className="text-slate-500 text-lg mb-10 max-w-xl mx-auto leading-relaxed">
            Join 350+ repair shops already running on RepairDeskz. Free forever to start — no card needed.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="/register"
              className="px-12 py-5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-lg transition-all hover:scale-105 shadow-2xl shadow-emerald-500/25"
            >
              Start Free — No Card Required
            </a>
            <a
              href="/login"
              className="px-12 py-5 rounded-2xl border border-white/10 hover:bg-white/5 text-white font-bold text-lg transition-all"
            >
              Sign In
            </a>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-white/5">
        <div className="max-w-7xl mx-auto px-6 md:px-10 py-16 grid md:grid-cols-4 gap-10">
          <div className="md:col-span-1">
            <div className="mb-4 inline-flex bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-xl border border-white/10">
              <img 
                src="/logo.png" 
                alt="RepairDeskz" 
                className="h-7 w-auto object-contain" 
              />
            </div>
            <p className="text-slate-600 text-sm leading-relaxed">
              The digital operating system for independent repair professionals.
            </p>
          </div>
          {[
            {
              heading: 'Product',
              links: ['Features', 'Pricing', 'Changelog', 'Roadmap'],
            },
            {
              heading: 'Resources',
              links: ['Documentation', 'Support', 'Status', 'Blog'],
            },
            {
              heading: 'Company',
              links: ['About', 'Privacy Policy', 'Terms of Service', 'Contact'],
            },
          ].map(({ heading, links }) => (
            <div key={heading}>
              <div className="text-slate-400 font-semibold text-sm mb-4 uppercase tracking-wider">{heading}</div>
              <ul className="space-y-2">
                {links.map((link) => (
                  <li key={link}>
                    <a href="#" className="text-slate-600 hover:text-slate-400 text-sm transition-colors">
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-white/5 py-6 px-10 flex flex-col md:flex-row items-center justify-between gap-3">
          <p className="text-slate-700 text-xs">© 2026 RepairDeskz. All rights reserved.</p>
          <p className="text-slate-700 text-xs font-mono">v2.0 // Built for repair professionals</p>
        </div>
      </footer>
    </div>
  );
}
