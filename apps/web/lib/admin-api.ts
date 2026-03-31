import axios from 'axios';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

const adminAxios = axios.create({ baseURL: `${API_BASE}/admin` });

// Attach admin token to every request
adminAxios.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('adminToken');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ─── Auth ───
export async function adminLogin(email: string, password: string) {
  const res = await adminAxios.post('/auth/login', { email, password });
  return res.data as { access_token: string; user: { email: string; role: string } };
}

export async function getAdminMe() {
  const res = await adminAxios.get('/auth/me');
  return res.data;
}

// ─── Shops ───
export async function listShops(params?: { page?: number; per_page?: number; search?: string }) {
  const res = await adminAxios.get('/shops', { params });
  return res.data as {
    total: number; page: number; per_page: number;
    items: ShopSummary[];
  };
}

export async function getShop(id: string) {
  const res = await adminAxios.get(`/shops/${id}`);
  return res.data as ShopDetail;
}

export async function getShopTickets(id: string, params?: { page?: number; status?: string }) {
  const res = await adminAxios.get(`/shops/${id}/tickets`, { params });
  return res.data;
}

export async function getShopTicket(shopId: string, ticketId: string) {
  const res = await adminAxios.get(`/shops/${shopId}/tickets/${ticketId}`);
  return res.data;
}

export async function getShopTicketInvoice(shopId: string, ticketId: string) {
  const res = await adminAxios.get(`/shops/${shopId}/tickets/${ticketId}/invoice`);
  return res.data;
}

export async function getShopCustomers(id: string, params?: { page?: number }) {
  const res = await adminAxios.get(`/shops/${id}/customers`, { params });
  return res.data;
}

export async function getShopTeam(id: string) {
  const res = await adminAxios.get(`/shops/${id}/team`);
  return res.data as { members: TeamMember[] };
}

export async function getShopInventory(id: string, params?: { page?: number }) {
  const res = await adminAxios.get(`/shops/${id}/inventory`, { params });
  return res.data;
}

export async function createShop(data: {
  shop_name: string; owner_name: string; email: string; password: string; phone?: string;
}) {
  const res = await adminAxios.post('/shops', data);
  return res.data as ShopSummary & { owner: { id: string; full_name: string; email: string } };
}

export async function deleteShop(id: string) {
  await adminAxios.delete(`/shops/${id}`);
}

export async function updateShop(id: string, payload: {
  shop_status?: string;
  admin_note?: string | null;
  custom_device_limit?: number | null;
}) {
  const res = await adminAxios.patch(`/shops/${id}`, payload);
  return res.data as { id: string; shop_status: string; admin_note: string | null; custom_device_limit: number | null };
}

export async function restrictShop(id: string) {
  const res = await adminAxios.post(`/shops/${id}/restrict`);
  return res.data;
}

export async function blockShop(id: string) {
  const res = await adminAxios.post(`/shops/${id}/block`);
  return res.data;
}

export async function deactivateShop(id: string) {
  const res = await adminAxios.post(`/shops/${id}/deactivate`);
  return res.data;
}

export async function reactivateShop(id: string) {
  const res = await adminAxios.post(`/shops/${id}/reactivate`);
  return res.data;
}

export async function updateShopNote(id: string, note: string) {
  const res = await adminAxios.patch(`/shops/${id}/note`, { note });
  return res.data;
}

export async function resetShopPassword(shopId: string, newPassword: string, userId?: string) {
  const res = await adminAxios.post(`/shops/${shopId}/reset-password`, {
    new_password: newPassword,
    ...(userId ? { user_id: userId } : {}),
  });
  return res.data as { ok: boolean; email: string; message: string };
}

export async function exportShopsJSON(ids?: string[]) {
  const params = ids && ids.length ? `?ids=${ids.join(',')}` : '';
  const res = await adminAxios.get(`/export/shops/json${params}`, { responseType: 'blob' });
  const date = new Date().toISOString().slice(0, 10);
  const filename = ids && ids.length
    ? `shops_selected_${ids.length}_${date}.json`
    : `shops_export_${date}.json`;
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importShopsJSON(file: File): Promise<{ ok: boolean; created: number; skipped: number; failed: { entry: string; reason: string }[] }> {
  const form = new FormData();
  form.append('file', file);
  const res = await adminAxios.post('/import/shops', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

export async function getAnalytics() {
  const res = await adminAxios.get('/analytics');
  return res.data as AnalyticsData;
}

export async function getAuditLogs(page = 1, perPage = 50) {
  const res = await adminAxios.get('/audit-logs', { params: { page, per_page: perPage } });
  return res.data as { total: number; page: number; per_page: number; items: AuditEntry[] };
}

export async function impersonateShop(shopId: string) {
  const res = await adminAxios.post(`/shops/${shopId}/impersonate`);
  return res.data as { access_token: string; owner_email: string; shop_name: string; expires_in_minutes: number };
}

export async function globalSearch(q: string) {
  const res = await adminAxios.get('/search', { params: { q } });
  return res.data as { query: string; results: SearchResult[]; counts: Record<string, number> };
}

export async function createBroadcast(title: string, message: string, type = 'INFO') {
  const res = await adminAxios.post('/broadcast', { title, message, type });
  return res.data as BroadcastEntry;
}

export async function listBroadcasts() {
  const res = await adminAxios.get('/broadcasts');
  return res.data as BroadcastEntry[];
}

export async function bulkShopAction(shopIds: string[], action: string) {
  const res = await adminAxios.post('/shops/bulk-action', { shop_ids: shopIds, action });
  return res.data as { ok: boolean; updated: number; action: string; new_status: string };
}

export async function exportShopsCSV() {
  const res = await adminAxios.get('/export/shops', { responseType: 'blob' });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = `shops_export_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportTicketsCSV(shopId?: string) {
  const params = shopId ? { shop_id: shopId } : {};
  const res = await adminAxios.get('/export/tickets', { params, responseType: 'blob' });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tickets_export_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function getShopSessions(shopId: string) {
  const res = await adminAxios.get(`/shops/${shopId}/sessions`);
  return res.data as { total: number; sessions: SessionEntry[] };
}

export async function killShopSession(shopId: string, sessionKey: string) {
  const res = await adminAxios.delete(`/shops/${shopId}/sessions/${sessionKey}`);
  return res.data as { ok: boolean; message: string };
}

// ─── Types ───
export interface ShopSummary {
  id: string; name: string; email: string; phone: string | null;
  is_active: boolean; shop_status?: string; created_at: string;
  ticket_count: number; member_count: number;
  owner: { full_name: string; email: string } | null;
}

export interface ShopDetail extends ShopSummary {
  owner: { id: string; full_name: string; email: string } | null;
  stats: { tickets: number; customers: number; members: number; inventory_items: number };
  shop_status: string;
  admin_note: string | null;
  custom_device_limit: number | null;
  plan: string;
}

export interface TeamMember {
  id: string; full_name: string; email: string; role: string;
  is_active: boolean; created_at: string;
}

export interface AnalyticsData {
  totals: { shops: number; active_shops: number; tickets: number; users: number; revenue: number };
  shops_by_status: Record<string, number>;
  tickets_by_status: Record<string, number>;
  plan_distribution: Record<string, number>;
  subscriptions: SubscriptionStats;
  monthly: { month: string; tickets: number; revenue: number; new_shops: number }[];
  top_shops: { id: string; name: string; revenue: number; tickets: number }[];
}

export interface AuditEntry {
  id: string; action: string; admin: string; target: string; detail: string; timestamp: string;
}

export interface SearchResult {
  type: 'shop' | 'user' | 'ticket';
  id: string; title: string; subtitle: string; status?: string; shop_id?: string;
}

export interface BroadcastEntry {
  id: string; title: string; message: string; type: string; sent_by: string; created_at: string;
}

export interface SessionEntry {
  user_id: string;
  user_name: string;
  user_email: string;
  user_role: string;
  session_id: string;
  session_key: string;
  ttl_seconds: number;
  ttl_max: number;
  created_ago: string;
}

// ─── Billing ───
const billingAxios = axios.create({ baseURL: `${API_BASE}/billing` });
billingAxios.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('adminToken');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export async function listPlans() {
  const res = await billingAxios.get('/admin/plans');
  return res.data as PlanData[];
}

export async function createPlan(data: { name: string; slug: string; description?: string; price_monthly: string; price_yearly: string; is_public: boolean; sort_order: number }) {
  const res = await billingAxios.post('/admin/plans', data);
  return res.data as PlanData;
}

export async function updatePlan(id: string, data: Partial<{ name: string; description: string; price_monthly: string; price_yearly: string; is_active: boolean; is_public: boolean; sort_order: number }>) {
  const res = await billingAxios.patch(`/admin/plans/${id}`, data);
  return res.data as PlanData;
}

export async function deletePlan(id: string) {
  await billingAxios.delete(`/admin/plans/${id}`);
}

export async function listFeatures() {
  const res = await billingAxios.get('/admin/features');
  return res.data as FeatureData[];
}

export async function createFeature(data: { key: string; name: string; description?: string; feature_type: string; default_value: string }) {
  const res = await billingAxios.post('/admin/features', data);
  return res.data as FeatureData;
}

export async function deleteFeature(id: string) {
  await billingAxios.delete(`/admin/features/${id}`);
}

export async function setPlanFeature(planId: string, featureId: string, value: string) {
  const res = await billingAxios.post(`/admin/plans/${planId}/features`, { feature_id: featureId, value });
  return res.data;
}

export async function removePlanFeature(planId: string, featureId: string) {
  await billingAxios.delete(`/admin/plans/${planId}/features/${featureId}`);
}

export async function getSubscriptionStats() {
  const res = await billingAxios.get('/admin/subscriptions/stats');
  return res.data as SubscriptionStats;
}

export async function listSubscriptions(params?: { page?: number; per_page?: number; status?: string }) {
  const res = await billingAxios.get('/admin/subscriptions', { params });
  return res.data as { total: number; page: number; per_page: number; items: SubscriptionItem[] };
}

export async function subscribeShop(shopId: string, planId: string, billingCycle = 'monthly') {
  const res = await billingAxios.post(`/admin/shops/${shopId}/subscribe`, { plan_id: planId, billing_cycle: billingCycle });
  return res.data;
}

export async function cancelShopSubscription(shopId: string) {
  const res = await billingAxios.post(`/admin/shops/${shopId}/cancel-subscription`);
  return res.data;
}

export interface PlanFeatureItem {
  feature_id: string; feature_key: string; feature_name: string; feature_type: string; value: string;
}

export interface PlanData {
  id: string; name: string; slug: string; description: string | null;
  price_monthly: string; price_yearly: string;
  is_active: boolean; is_public: boolean; sort_order: number;
  created_at: string; features: PlanFeatureItem[];
}

export interface FeatureData {
  id: string; key: string; name: string; description: string | null;
  feature_type: string; default_value: string; is_active: boolean; created_at: string;
}

export interface SubscriptionStats {
  active_subscriptions: number; mrr: number;
  plan_distribution: { name: string; slug: string; count: number }[];
  free_shops: number;
}

export interface SubscriptionItem {
  id: string; shop_id: string; shop_name: string;
  plan_id: string; plan_name: string; plan_slug: string;
  status: string; billing_cycle: string;
  current_period_start: string; current_period_end: string;
  features: Record<string, string>; created_at: string;
}

