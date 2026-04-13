'use client';

import { useEffect, useState } from 'react';

const LINKS = [
  { label: 'Tickets',   href: '#s1' },
  { label: 'Inventory', href: '#s2' },
  { label: 'Comms',     href: '#s3' },
  { label: 'Pricing',   href: '#s5' },
];

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', h, { passive: true });
    return () => window.removeEventListener('scroll', h);
  }, []);

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 transition-all duration-500"
      style={{
        background: scrolled ? 'rgba(0,0,0,0.75)' : 'transparent',
        backdropFilter: scrolled ? 'blur(20px)' : 'none',
        borderBottom: scrolled ? '1px solid rgba(255,255,255,0.05)' : 'none',
      }}
    >
      <div className="max-w-7xl mx-auto px-8 md:px-12 h-16 flex items-center justify-between">
        {/* Logo */}
        <div className="bg-white rounded-xl w-[160px] h-10 flex items-center justify-center overflow-hidden shadow-lg px-2 py-1">
          <img src="/logo.png" alt="RepairDeskz" className="w-full h-auto object-contain scale-[1.15]" />
        </div>

        {/* CTAs */}
        <div className="flex items-center gap-3">
          <a href="/login"
            className="text-sm text-slate-500 hover:text-white transition-colors font-medium hidden md:block"
          >
            Sign in
          </a>
          <a href="/register"
            className="text-sm bg-emerald-500 hover:bg-emerald-400 text-black font-bold px-5 py-2 rounded-xl transition-all"
          >
            Get Started
          </a>
        </div>
      </div>
    </nav>
  );
}
