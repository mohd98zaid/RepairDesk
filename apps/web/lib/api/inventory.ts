import type { InventoryItem } from "@/types";
import { api } from "./client";

export interface InventoryListParams {
    search?: string;
    low_stock_only?: boolean;
    page?: number;
    per_page?: number;
}

export interface CreateItemPayload {
    name: string;
    sku?: string;
    description?: string;
    purchase_price: string;
    selling_price: string;
    quantity: number;
    low_stock_threshold: number;
}

export const inventoryApi = {
    list: async (params: InventoryListParams = {}) => {
        const { data } = await api.get("/inventory", { params });
        return data;
    },

    get: async (id: string) => {
        const { data } = await api.get(`/inventory/${id}`);
        return data;
    },

    create: async (payload: CreateItemPayload) => {
        const { data } = await api.post("/inventory", payload);
        return data;
    },

    update: async (id: string, payload: Partial<CreateItemPayload>) => {
        const { data } = await api.patch(`/inventory/${id}`, payload);
        return data;
    },

    adjustStock: async (id: string, delta: number, notes?: string) => {
        const { data } = await api.post(`/inventory/${id}/stock`, { delta, notes });
        return data;
    },

    delete: async (id: string) => {
        await api.delete(`/inventory/${id}`);
    },

    // Parts on ticket
    getTicketParts: async (ticketId: string) => {
        const { data } = await api.get(`/tickets/${ticketId}/parts`);
        return data.parts as Array<{
            id: string;
            inventory_item_id: string;
            name: string;
            quantity_used: number;
            unit_selling_price: string;
            unit_purchase_price: string;
            line_total: string;
        }>;
    },

    addPartToTicket: async (ticketId: string, inventory_item_id: string, quantity_used: number) => {
        const { data } = await api.post(`/tickets/${ticketId}/parts`, {
            inventory_item_id,
            quantity_used,
        });
        return data;
    },

    removePartFromTicket: async (ticketId: string, partId: string) => {
        await api.delete(`/tickets/${ticketId}/parts/${partId}`);
    },
};

// --- Vendors API ---
export interface CreateVendorPayload {
    name: string;
    contact_name?: string;
    email?: string;
    phone?: string;
    address?: string;
    website?: string;
    notes?: string;
}

export const vendorsApi = {
    list: async () => {
        const { data } = await api.get<import("@/types").Vendor[]>("/vendors");
        return data;
    },
    get: async (id: string) => {
        const { data } = await api.get<import("@/types").Vendor>(`/vendors/${id}`);
        return data;
    },
    create: async (payload: CreateVendorPayload) => {
        const { data } = await api.post<import("@/types").Vendor>("/vendors", payload);
        return data;
    },
    update: async (id: string, payload: Partial<CreateVendorPayload>) => {
        const { data } = await api.patch<import("@/types").Vendor>(`/vendors/${id}`, payload);
        return data;
    }
};

// --- Purchase Orders API ---
export interface CreatePOItemPayload {
    inventory_item_id: string;
    quantity: number;
    unit_cost: string;
}

export interface CreatePOPayload {
    vendor_id: string;
    po_number: string;
    status?: "DRAFT" | "ORDERED" | "RECEIVED" | "CANCELLED";
    notes?: string;
    items: CreatePOItemPayload[];
}

export const purchaseOrdersApi = {
    list: async () => {
        const { data } = await api.get<import("@/types").PurchaseOrder[]>("/purchase-orders");
        return data;
    },
    get: async (id: string) => {
        const { data } = await api.get<import("@/types").PurchaseOrder>(`/purchase-orders/${id}`);
        return data;
    },
    create: async (payload: CreatePOPayload) => {
        const { data } = await api.post<import("@/types").PurchaseOrder>("/purchase-orders", payload);
        return data;
    },
    updateStatus: async (id: string, status: "DRAFT" | "ORDERED" | "RECEIVED" | "CANCELLED", notes?: string) => {
        const { data } = await api.patch<import("@/types").PurchaseOrder>(`/purchase-orders/${id}`, { status, notes });
        return data;
    }
};
