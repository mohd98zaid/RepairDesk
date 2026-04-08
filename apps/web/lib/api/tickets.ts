import type { TicketSummary, TicketDetail } from "@/types";
import { api } from "./client";

export interface ListTicketsParams {
  status?: string;
  customer_id?: string;
  from_date?: string;
  to_date?: string;
  search?: string;
  page?: number;
  per_page?: number;
}

export interface CreateTicketPayload {
  customer_id?: string;
  customer_phone?: string;
  customer_name?: string;
  device_type: string;
  device_model?: string;
  reported_issue: string;
  estimated_cost?: string;
  final_cost?: string;
  assigned_to?: string;
  image_keys?: string[];
  initial_charges?: { name: string; amount: string }[];
  pre_repair_checklist?: object | null;
  customer_signature?: string | null;
  warranty_days?: number;
  sla_deadline?: string;
  sla_hours?: number;
}

export const ticketsApi = {
  list: async (params: ListTicketsParams = {}) => {
    const { data } = await api.get("/tickets", { params });
    return data;
  },

  get: async (id: string): Promise<TicketDetail> => {
    const { data } = await api.get(`/tickets/${id}`);
    return data;
  },

  create: async (payload: CreateTicketPayload) => {
    const { data } = await api.post("/tickets", payload);
    return data;
  },

  update: async (id: string, payload: Partial<CreateTicketPayload>) => {
    const { data } = await api.patch(`/tickets/${id}`, payload);
    return data;
  },

  assign: async (id: string, assigned_to: string | null) => {
    const { data } = await api.patch(`/tickets/${id}/assign`, { assigned_to });
    return data;
  },

  changeStatus: async (id: string, status: string, notes?: string) => {
    const { data } = await api.post(`/tickets/${id}/status`, { status, notes });
    return data;
  },

  presignImage: async (id: string, filename: string, content_type: string) => {
    const { data } = await api.post(`/tickets/${id}/images/presign`, { filename, content_type });
    return data as { upload_url: string; object_key: string; form_data: Record<string, string> };
  },

  createCheckout: async (id: string, description: string) => {
    const { data } = await api.post("/payments/create-checkout-session", {
      ticket_id: id,
      description,
    });
    return data as { url: string };
  },

  confirmImage: async (id: string, object_key: string, filename: string, size_bytes: number) => {
    const { data } = await api.post(`/tickets/${id}/images/confirm`, {
      object_key, filename, size_bytes
    });
    return data;
  },

  addPart: async (id: string, inventory_item_id: string, quantity_used: number) => {
    const { data } = await api.post(`/tickets/${id}/parts`, {
      inventory_item_id,
      quantity_used,
    });
    return data;
  },

  removePart: async (id: string, part_id: string) => {
    const { data } = await api.delete(`/tickets/${id}/parts/${part_id}`);
    return data;
  },

  addCharge: async (id: string, payload: { name: string; amount: string }) => {
    const { data } = await api.post(`/tickets/${id}/charges`, payload);
    return data;
  },

  removeCharge: async (id: string, charge_id: string) => {
    const { data } = await api.delete(`/tickets/${id}/charges/${charge_id}`);
    return data;
  },

  submitRating: async (id: string, rating: number, feedback?: string) => {
    const { data } = await api.post(`/tickets/${id}/rating`, { rating, feedback });
    return data as { ok: boolean; customer_rating: number; customer_feedback: string | null };
  },

  delete: async (id: string) => {
    await api.delete(`/tickets/${id}`);
  },

  getPublicInfo: async (id: string) => {
    // Public endpoint — use a plain fetch so no auth header is sent
    const baseUrl = typeof window !== "undefined"
      ? (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000")
      : (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000");
    const res = await fetch(`${baseUrl}/tickets/${id}/public-info`);
    if (!res.ok) throw new Error("Ticket not found");
    return res.json() as Promise<{
      id: string; ticket_number: number; device_type: string;
      device_model: string | null; status: string;
      customer_rating: number | null; customer_feedback: string | null;
    }>;
  },
};

export const shopsApi = {
  getMyShop: async () => {
    const { data } = await api.get("/shops/me");
    return data as import("@/types").Shop;
  },
};

export const customersApi = {
  list: async (search?: string, page = 1, per_page = 20) => {
    const { data } = await api.get("/customers", { params: { search, page, per_page } });
    return data;
  },

  create: async (payload: { name: string; phone: string; email?: string; notes?: string }) => {
    const { data } = await api.post("/customers", payload);
    return data;
  },

  get: async (id: string) => {
    const { data } = await api.get(`/customers/${id}`);
    return data;
  },

  update: async (id: string, payload: Partial<{ name: string; phone: string; email: string; notes: string }>) => {
    const { data } = await api.patch(`/customers/${id}`, payload);
    return data;
  },
};
