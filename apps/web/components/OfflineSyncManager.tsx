"use client";

import { useEffect, useState } from "react";
import { CloudOff, CloudSync } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { syncDB } from "@/lib/db";
import { api } from "@/lib/api/client";

export function OfflineSyncManager() {
    const [isOnline, setIsOnline] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);

    // Only count truly PENDING (not FAILED) mutations
    const pendingCount = useLiveQuery(
        () => syncDB.mutations.where({ status: "PENDING" }).count(),
        []
    ) ?? null; // null = Dexie not yet initialized

    // On mount: purge stale FAILED records so they don't pollute the queue count
    useEffect(() => {
        syncDB.mutations.where({ status: "FAILED" }).delete().catch(() => {});
    }, []);

    // Monitor network status
    useEffect(() => {
        setIsOnline(navigator.onLine);
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);

        window.addEventListener("online", handleOnline);
        window.addEventListener("offline", handleOffline);

        return () => {
            window.removeEventListener("online", handleOnline);
            window.removeEventListener("offline", handleOffline);
        };
    }, []);

    // Trigger sync when coming back online and there are pending mutations
    useEffect(() => {
        if (isOnline && pendingCount && pendingCount > 0 && !isSyncing) {
            syncPendingMutations();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOnline, pendingCount]);

    const syncPendingMutations = async () => {
        setIsSyncing(true);
        try {
            const pending = await syncDB.mutations.where({ status: "PENDING" }).sortBy("created_at");

            for (const item of pending) {
                try {
                    await api.request({
                        method: item.method,
                        url: item.url,
                        data: item.data,
                        headers: item.headers,
                    });

                    if (item.id) {
                        await syncDB.mutations.delete(item.id);
                    }
                } catch (err: any) {
                    // Network still down — stop and wait
                    if (err.isOfflineQueued || !navigator.onLine) break;

                    // Hard server error (4xx) — mark failed so it doesn't block the queue
                    if (err.response && item.id) {
                        await syncDB.mutations.update(item.id, {
                            status: "FAILED",
                            error: err.response?.data?.detail || err.message,
                        });
                    }
                }
            }
        } finally {
            setIsSyncing(false);
        }
    };

    // Hide badge when: Dexie not ready yet, OR online with nothing pending and not syncing
    if (pendingCount === null) return null;
    if (isOnline && pendingCount === 0 && !isSyncing) return null;

    return (
        <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border shadow-sm transition-all duration-300 ${
                !isOnline
                    ? "bg-warning/20 text-warning border-warning/30"
                    : "bg-primary/20 text-primary border-primary/30"
            }`}
        >
            {!isOnline ? (
                <>
                    <CloudOff className="w-3.5 h-3.5" />
                    <span>Offline{pendingCount > 0 ? ` (${pendingCount} pending)` : ""}</span>
                </>
            ) : (
                <>
                    <CloudSync className="w-3.5 h-3.5 animate-spin" />
                    <span>Syncing {pendingCount}...</span>
                </>
            )}
        </div>
    );
}
