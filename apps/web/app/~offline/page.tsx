'use client';
import { WifiOff } from "lucide-react";
import Link from "next/link";

export default function OfflinePage() {
  return (
    <main className="min-h-screen bg-[#02040A] flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="bg-emerald-500/10 w-24 h-24 rounded-full flex items-center justify-center mx-auto border border-emerald-500/20 shadow-2xl shadow-emerald-500/10">
          <WifiOff className="w-12 h-12 text-emerald-500" />
        </div>
        
        <div className="space-y-2">
          <h1 className="text-3xl font-black text-white tracking-tighter">
            YOU'RE <span className="text-emerald-500">OFFLINE</span>!
          </h1>
          <p className="text-slate-400 text-sm md:text-base leading-relaxed">
            It looks like you've lost your connection. RepairDeskz works offline, but this specific page hasn't been cached yet.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 pt-4">
          <button 
            onClick={() => window.location.reload()}
            className="w-full py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-sm transition-all hover:scale-[1.02] shadow-xl shadow-emerald-500/30"
          >
            Retry Connection
          </button>
          
          <Link 
            href="/"
            className="w-full py-4 rounded-2xl border border-white/10 hover:bg-white/5 text-slate-300 font-bold text-sm transition-all text-center"
          >
            Back to Home
          </Link>
        </div>

        <div className="pt-8 opacity-20">
          <p className="text-[10px] text-slate-500 font-mono tracking-[0.3em] uppercase">
            RepairDeskz // Offline Fallback
          </p>
        </div>
      </div>
    </main>
  );
}
