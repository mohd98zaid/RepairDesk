"use client";

import { WifiOff } from "lucide-react";
import Link from "next/link";

export default function OfflinePage() {
    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
            <div className="p-5 rounded-full bg-muted mb-5">
                <WifiOff className="w-10 h-10 text-muted-foreground" />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-2">You&apos;re offline</h1>
            <p className="text-muted-foreground text-sm mb-6 max-w-sm">
                RepairDesk needs an internet connection to load fresh data.
                Please check your network and try again.
            </p>
            <button
                onClick={() => window.location.reload()}
                className="px-5 py-2.5 rounded-lg gradient-primary text-white font-medium text-sm hover:opacity-90 transition"
            >
                Try again
            </button>
            <Link href="/tickets" className="mt-3 text-indigo-400 hover:text-indigo-300 text-sm">
                View cached tickets
            </Link>
        </div>
    );
}
