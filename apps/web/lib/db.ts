import Dexie, { type Table } from "dexie";

export interface PendingMutation {
    id?: number;
    method: string;
    url: string;
    headers?: Record<string, string>;
    data?: any;
    created_at: number;
    status: "PENDING" | "FAILED";
    error?: string;
}

export class SyncDatabase extends Dexie {
    mutations!: Table<PendingMutation, number>;

    constructor() {
        super("RepairDeskSyncDB");
        this.version(1).stores({
            mutations: "++id, created_at, status"
        });
    }
}

export const syncDB = new SyncDatabase();

/**
 * Push a failed or offline mutation to the queue.
 */
export async function queueMutation(config: any) {
    try {
        await syncDB.mutations.add({
            method: config.method?.toUpperCase() || "POST",
            url: config.url || "",
            headers: config.headers,
            data: config.data ? JSON.parse(typeof config.data === "string" ? config.data : JSON.stringify(config.data)) : undefined,
            created_at: Date.now(),
            status: "PENDING",
        });
    } catch (err) {
        console.error("Failed to queue mutation:", err);
    }
}
