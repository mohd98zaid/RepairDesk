export type UserRole = "OWNER" | "TECHNICIAN";

export type Plan = "free" | "pro" | "business";

export interface AuthUser {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  shop_id: string;
  avatar_data?: string;
}

export interface Shop {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  pincode: string | null;
  gst_number: string | null;
  logo_data: string | null;
  plan: Plan;
  is_active: boolean;
  currency?: string;
  currency_symbol?: string;
  created_at: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string;
  notes?: string;
  ticket_count?: number;
  total_spent?: string;
}

export type TicketStatus =
  | "RECEIVED"
  | "IN_PROGRESS"
  | "WAITING_PARTS"
  | "READY"
  | "DELIVERED"
  | "CANCELLED";

export interface TicketSummary {
  id: string;
  ticket_number: number;
  status: TicketStatus;
  device_type: string;
  device_model: string | null;
  reported_issue: string;
  estimated_cost: string | null;
  final_cost: string | null;
  profit: string | null;
  customer: Customer;
  assigned_to: { id: string; full_name: string } | null;
  created_at: string;
  updated_at?: string;
  sla_deadline?: string | null;
  pre_repair_checklist?: Record<string, any> | null;
  customer_signature?: string | null;
  warranty_days?: number | null;
}

export interface TicketPart {
  id: string;
  inventory_item_id: string;
  name: string;
  quantity_used: number;
  unit_selling_price: string;
  unit_purchase_price: string;
}

export interface StatusLog {
  from_status: TicketStatus | null;
  to_status: TicketStatus;
  notes: string | null;
  changed_by: string;
  changed_at: string;
}

export interface TicketImage {
  id: string;
  url: string;
  filename: string;
}

export interface TicketCharge {
  id: string;
  ticket_id: string;
  name: string;
  amount: string;
  created_at: string;
}

export interface TicketDetail extends TicketSummary {
  technician_notes: string | null;
  final_cost: string | null;
  parts_cost: string;
  profit: string | null;
  images: { id: string; url: string; filename: string }[];
  parts: { id: string; inventory_item_id: string; name: string; quantity: number; cost: string }[];
  charges: { id: string; name: string; amount: string }[];
  status_logs: { id: string; from_status: string | null; to_status: string; notes: string | null; changed_by: string; changed_at: string }[];
  pre_repair_checklist?: Record<string, any> | null;
  customer_signature?: string | null;
  customer_rating?: number | null;
  customer_feedback?: string | null;
}

export interface InventoryItem {
  id: string;
  name: string;
  sku: string | null;
  purchase_price: string;
  selling_price: string;
  quantity: number;
  low_stock_threshold: number;
  is_low_stock: boolean;
  created_at: string;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  total_amount: string;
  download_url: string;
  public_url: string;
  generated_at: string;
}

export interface PaginatedResponse<T> {
  total: number;
  page: number;
  per_page: number;
  pages: number;
  items: T[];
}

export interface DailyReport {
  date: string;
  total_revenue: string;
  total_parts_cost: string;
  net_profit: string;
  tickets_created: number;
  tickets_completed: number;
  tickets_by_status: Record<TicketStatus, number>;
}

export interface ApiError {
  detail: string;
  code: string;
}

export interface Vendor {
  id: string;
  shop_id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  website: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type POStatus = "DRAFT" | "ORDERED" | "RECEIVED" | "CANCELLED";

export interface POItem {
  id: string;
  po_id: string;
  inventory_item_id: string;
  quantity: number;
  unit_cost: string;
  created_at: string;
}

export interface PurchaseOrder {
  id: string;
  shop_id: string;
  vendor_id: string;
  po_number: string;
  status: POStatus;
  total_amount: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  items: POItem[];
}
