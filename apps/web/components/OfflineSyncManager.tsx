"use client";

import { useEffect, useState } from "react";
import { CloudOff, CloudSync, CheckCircle2 } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { syncDB } from "@/lib/db";
import { api } from "@/lib/api/client";

export function OfflineSyncManager() {
    const [isOnline, setIsOnline] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);

    // Auto-update pending mutations count
    const pendingCount = useLiveQuery(() => syncDB.mutations.where({ status: "PENDING" }).count(), []) || 0;

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

    // Trigger sync when coming back online
    useEffect(() => {
        if (isOnline && pendingCount > 0 && !isSyncing) {
            syncPendingMutations();
        }
    }, [isOnline, pendingCount, isSyncing]);

    const syncPendingMutations = async () => {
        setIsSyncing(true);
        try {
            const pending = await syncDB.mutations.where({ status: "PENDING" }).sortBy("created_at");

            for (const item of pending) {
                try {
                    // Send request. Use standard api client.
                    await api.request({
                        method: item.method,
                        url: item.url,
                        data: item.data,
                        headers: item.headers,
                    });

                    // On success, delete from queue
                    if (item.id) {
                        await syncDB.mutations.delete(item.id);
                    }
                } catch (err: any) {
                    // If it's another network error, stop syncing and wait
                    if (err.isOfflineQueued || !navigator.onLine) {
                        break;
                    }

                    // If it's a hard validation error (400, 422), mark as failed so it doesn't block
                    if (err.response && item.id) {
                        await syncDB.mutations.update(item.id, {
                            status: "FAILED",
                            error: err.response?.data?.detail || err.message
                        });
                    }
                }
            }
        } finally {
            setIsSyncing(false);
        }
    };

    if (pendingCount === 0 && isOnline) return null;

    return (
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border shadow-sm transition-all duration-300 ${isOnline ? (isSyncing ? "bg-primary/20 text-primary border-primary/30" : "bg-success/20 text-success border-success/30") : "bg-warning/20 text-warning border-warning/30"}`}>
            {!isOnline ? (
                <>
                    <CloudOff className="w-3.5 h-3.5" />
                    <span>Offline ({pendingCount} pending)</span>
                </>
            ) : isSyncing ? (
                <>
                    <CloudSync className="w-3.5 h-3.5 animate-spin" />
                    <span>Syncing {pendingCount}...</span>
                </>
            ) : (
                <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Synced</span>
                </>
            )}
        </div>
    );
}
