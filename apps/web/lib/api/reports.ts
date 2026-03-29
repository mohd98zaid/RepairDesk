import { api } from "./client";

export interface DailyReportData {
    date: string;
    tickets_created: number;
    tickets_completed: number;
    total_revenue: string;
    total_parts_cost: string;
    net_profit: string;
    avg_ticket_value: string;
    tickets_by_status: Record<string, number>;
}

export interface RangeReportData {
    from_date: string;
    to_date: string;
    days: DailyReportData[];
    totals: {
        total_revenue: string;
        total_parts_cost: string;
        net_profit: string;
        tickets_created: number;
        tickets_completed: number;
    };
}

export interface RevenueBreakdownData {
    total_revenue: string;
    parts_revenue: string;
    charges_breakdown: Record<string, string>;
}

export const reportsApi = {
    daily: async (date?: string): Promise<DailyReportData> => {
        const { data } = await api.get("/reports/daily", {
            params: date ? { report_date: date } : {},
        });
        return data;
    },

    range: async (from_date: string, to_date: string): Promise<RangeReportData> => {
        const { data } = await api.get("/reports/range", {
            params: { from_date, to_date },
        });
        return data;
    },

    revenueBreakdown: (): Promise<RevenueBreakdownData> => api.get('/reports/revenue-breakdown').then(res => res.data),
};

export const invoicesApi = {
    generate: async (ticketId: string) => {
        const { data } = await api.post(`/tickets/${ticketId}/invoice`);
        return data;
    },

    get: async (ticketId: string) => {
        const { data } = await api.get(`/tickets/${ticketId}/invoice`);
        return data as {
            id: string;
            invoice_number: string;
            total_amount: string;
            download_url: string;
            public_token: string;
            generated_at: string;
        };
    },
};
