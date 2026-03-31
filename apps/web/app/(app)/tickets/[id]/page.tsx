"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
    ArrowLeft,
    Clock,
    IndianRupee,
    Loader2,
    Smartphone,
    User,
    Activity,
    ImageIcon,
    ChevronDown,
    FileText,
    Download,
    MessageSquare,
    Star,
    Printer,
    Edit2,
    Check,
    X as XIcon,
    Trash2,
    Shield,
    CreditCard,
    CheckCircle,
    Plus,
    QrCode,
    MessageCircle,
    Phone as PhoneIcon,
} from "lucide-react";
import { ticketsApi } from "@/lib/api/tickets";
import { invoicesApi } from "@/lib/api/reports";
import { teamApi } from "@/lib/api/team";
import { StatusBadge } from "@/components/tickets/StatusBadge";
import { PartsSelector } from "@/components/tickets/PartsSelector";
import { useAuthStore } from "@/store/authStore";
import { fmtTicketId } from "@/lib/utils/ticketId";
import type { TicketDetail } from "@/types";
import { PreRepairChecklist, type ChecklistItem, defaultChecklist } from "@/components/tickets/PreRepairChecklist";
import { buildStatusUpdateMessage, buildFeedbackMessage, openWhatsApp, openSMS } from "@/lib/messaging";

const STATUS_TRANSITIONS: Record<string, string[]> = {
    RECEIVED: ["IN_PROGRESS", "WAITING_PARTS", "CANCELLED"],
    IN_PROGRESS: ["WAITING_PARTS", "READY", "CANCELLED"],
    WAITING_PARTS: ["IN_PROGRESS", "READY", "CANCELLED"],
    READY: ["DELIVERED", "CANCELLED"],
    DELIVERED: [],
    CANCELLED: [],
};

const STATUS_LABELS: Record<string, string> = {
    IN_PROGRESS: "Mark In Progress",
    WAITING_PARTS: "Waiting on Parts",
    READY: "Mark Ready",
    DELIVERED: "Mark Delivered",
    CANCELLED: "Cancel Ticket",
};

// ── Quick Reply templates ─────────────────────────────────────
const QUICK_REPLIES = [
    { label: "Parts ordered", text: "Parts have been ordered and are on their way. We'll notify you once they arrive and repair begins." },
    { label: "Ready for pickup", text: "Great news! Your device has been repaired and is ready for pickup. Please visit us at your convenience." },
    { label: "Diagnosis done", text: "We've completed the initial diagnosis. Please confirm the estimated cost to proceed with the repair." },
    { label: "Waiting approval", text: "Repair is on hold. Awaiting your approval to proceed. Please get in touch at your earliest." },
    { label: "Repair complete", text: "Your device has been successfully repaired and tested. Everything is working perfectly!" },
];

// ── Star Rating component ─────────────────────────────────────
function StarRating({ ticket, onUpdate }: { ticket: TicketDetail; onUpdate: (t: TicketDetail) => void }) {
    const existing = ticket.customer_rating ?? 0;
    const [hover, setHover] = useState(0);
    const [saving, setSaving] = useState(false);

    async function saveRating(r: number) {
        setSaving(true);
        try {
            await ticketsApi.submitRating(ticket.id, r, ticket.customer_feedback ?? undefined);
            const updated = await ticketsApi.get(ticket.id);
            onUpdate(updated);
        } catch { /**/ } finally { setSaving(false); }
    }

    const display = hover || existing;
    const labels = ['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent'];

    return (
        <div className="bg-card border border-border shadow-sm rounded-xl p-5">
            <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <Star className="w-4 h-4 text-warning" /> Customer Rating
            </h2>
            {existing > 0 ? (
                <div className="text-center py-2">
                    <div className="flex justify-center gap-1 mb-2">
                        {[1, 2, 3, 4, 5].map(s => (
                            <Star key={s} className={`w-6 h-6 ${s <= existing ? 'text-warning fill-warning' : 'text-muted-foreground opacity-50'}`} />
                        ))}
                    </div>
                    <p className="text-warning text-sm font-semibold">{labels[existing]}</p>
                    {ticket.customer_feedback && (
                        <p className="text-xs text-muted-foreground mt-1 italic">"{ticket.customer_feedback}"</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">Submitted by customer</p>
                </div>
            ) : (
                <div className="text-center">
                    <p className="text-xs text-muted-foreground mb-3">No rating yet. Set manually if needed:</p>
                    <div className="flex justify-center gap-2 mb-2">
                        {[1, 2, 3, 4, 5].map(s => (
                            <button key={s}
                                onMouseEnter={() => setHover(s)}
                                onMouseLeave={() => setHover(0)}
                                onClick={() => saveRating(s)}
                                disabled={saving}
                                className="transition-transform hover:scale-125 disabled:opacity-50">
                                <Star className={`w-7 h-7 transition-colors ${s <= display ? 'text-warning fill-warning' : 'text-muted-foreground opacity-50'}`} />
                            </button>
                        ))}
                    </div>
                    {saving && <Loader2 className="w-4 h-4 animate-spin mx-auto text-primary" />}
                    {hover > 0 && <p className="text-xs text-warning font-medium">{labels[hover]}</p>}
                </div>
            )}
        </div>
    );
}

// ── Print Ticket Invoice / Label ──────────────────────────────
function PrintLabel({ ticket, shopName }: {
    ticket: TicketDetail;
    shopName?: string;
}) {
    function handlePrint() {
        const win = window.open("", "_blank", "width=800,height=680");
        if (!win) return;

        const ticketId   = `RD-${String(ticket.ticket_number).padStart(5, "0")}`;
        const qrUrl      = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(ticket.id)}`;
        const trackUrl   = `${window.location.origin}/feedback/${ticket.id}`;
        const createdAt  = new Date(ticket.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
        const now        = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

        const partsCost  = parseFloat(ticket.parts_cost || "0");
        const charges    = ticket.charges || [];
        const chargesTotal = charges.reduce((s, c) => s + parseFloat(c.amount || "0"), 0);
        const finalCost  = parseFloat(ticket.final_cost || "0") || (partsCost + chargesTotal);

        const STATUS_MAP: Record<string, string> = {
            RECEIVED: "Received", IN_PROGRESS: "In Progress",
            WAITING_PARTS: "Waiting for Parts", READY: "Ready for Pickup",
            DELIVERED: "Delivered", CANCELLED: "Cancelled",
        };

        const sig = ticket.customer_signature;

        const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>Repair Invoice — ${ticketId}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: "Segoe UI", Arial, sans-serif;
    background: #fff;
    color: #1a1a2e;
    font-size: 13px;
    padding: 32px;
    max-width: 720px;
    margin: 0 auto;
  }

  /* ── Header ────────────────────────────────── */
  .header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding-bottom: 20px;
    border-bottom: 3px solid #4f46e5;
    margin-bottom: 20px;
  }
  .brand-name {
    font-size: 22px;
    font-weight: 800;
    color: #4f46e5;
    letter-spacing: -0.5px;
  }
  .brand-sub {
    font-size: 11px;
    color: #6b7280;
    margin-top: 2px;
  }
  .invoice-meta { text-align: right; }
  .invoice-meta .invoice-id {
    font-size: 18px;
    font-weight: 800;
    color: #1a1a2e;
    letter-spacing: 1px;
  }
  .invoice-meta .invoice-date {
    font-size: 11px;
    color: #6b7280;
    margin-top: 4px;
  }

  /* ── Status pill ───────────────────────────── */
  .status-pill {
    display: inline-block;
    padding: 3px 12px;
    border-radius: 99px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.5px;
    margin-top: 6px;
    text-transform: uppercase;
  }
  .status-RECEIVED      { background:#dbeafe; color:#1d4ed8; }
  .status-IN_PROGRESS   { background:#fef3c7; color:#b45309; }
  .status-WAITING_PARTS { background:#ffedd5; color:#c2410c; }
  .status-READY         { background:#dcfce7; color:#15803d; }
  .status-DELIVERED     { background:#ede9fe; color:#6d28d9; }
  .status-CANCELLED     { background:#fee2e2; color:#b91c1c; }

  /* ── 2-col info block ──────────────────────── */
  .info-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin-bottom: 20px;
  }
  .info-box {
    background: #f8f9ff;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    padding: 14px 16px;
  }
  .info-box-title {
    font-size: 10px;
    font-weight: 700;
    color: #9ca3af;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    margin-bottom: 10px;
  }
  .info-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 6px;
    gap: 8px;
  }
  .info-label { color: #6b7280; font-size: 12px; white-space: nowrap; }
  .info-value { color: #1a1a2e; font-size: 12px; font-weight: 600; text-align: right; max-width: 180px; word-break: break-word; }

  /* ── Charges table ─────────────────────────── */
  .section-title {
    font-size: 10px;
    font-weight: 700;
    color: #9ca3af;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    margin-bottom: 8px;
  }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  thead tr { background: #f3f4f6; }
  th {
    text-align: left;
    padding: 7px 10px;
    font-size: 11px;
    font-weight: 700;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  th:last-child { text-align: right; }
  td { padding: 8px 10px; font-size: 12px; color: #374151; border-bottom: 1px solid #f3f4f6; }
  td:last-child { text-align: right; font-weight: 600; color: #1a1a2e; }
  .total-row td { border-top: 2px solid #e5e7eb; border-bottom: none; font-weight: 700; font-size: 13px; color: #1a1a2e; }
  .total-row td:last-child { color: #4f46e5; font-size: 15px; }

  /* ── Footer row ────────────────────────────── */
  .footer-row {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    margin-top: 16px;
    gap: 16px;
  }
  .qr-block { text-align: center; }
  .qr-block img { border: 1px solid #e5e7eb; border-radius: 6px; padding: 4px; }
  .qr-caption { font-size: 9px; color: #9ca3af; margin-top: 4px; }

  .sig-block {
    flex: 1;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    padding: 12px 16px;
    min-height: 80px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }
  .sig-label { font-size: 10px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.7px; margin-bottom: 4px; }
  .sig-img { max-height: 64px; max-width: 200px; object-fit: contain; }

  .terms-block {
    flex: 1;
    font-size: 10px;
    color: #9ca3af;
    line-height: 1.6;
  }
  .terms-block strong { color: #6b7280; display: block; margin-bottom: 4px; }

  .track-block {
    text-align: center;
    border: 1px dashed #c4b5fd;
    border-radius: 8px;
    padding: 8px 14px;
    background: #faf5ff;
  }
  .track-label { font-size: 10px; color: #7c3aed; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; }
  .track-url   { font-size: 10px; color: #6d28d9; margin-top: 2px; word-break: break-all; }

  @media print {
    body { padding: 16px; }
    @page { margin: 8mm; size: A4; }
  }
</style>
</head>
<body>

<!-- ── Header ── -->
<div class="header">
  <div>
    <div class="brand-name">${escHtml(shopName || "RepairDesk")}</div>
    <div class="brand-sub">Professional Repair Management</div>
    <div class="status-pill status-${ticket.status}">${escHtml(STATUS_MAP[ticket.status] || ticket.status)}</div>
  </div>
  <div class="invoice-meta">
    <div class="invoice-id">${escHtml(ticketId)}</div>
    <div class="invoice-date">Created: ${escHtml(createdAt)}</div>
    <div class="invoice-date">Printed: ${escHtml(now)}</div>
  </div>
</div>

<!-- ── Info grid ── -->
<div class="info-grid">
  <!-- Customer -->
  <div class="info-box">
    <div class="info-box-title">Customer</div>
    ${ticket.customer ? `
    <div class="info-row"><span class="info-label">Name</span><span class="info-value">${escHtml(ticket.customer.name)}</span></div>
    <div class="info-row"><span class="info-label">Phone</span><span class="info-value">${escHtml(ticket.customer.phone)}</span></div>
    ` : `<div class="info-value" style="color:#9ca3af">—</div>`}
  </div>
  <!-- Device -->
  <div class="info-box">
    <div class="info-box-title">Device</div>
    <div class="info-row"><span class="info-label">Type</span><span class="info-value">${escHtml(ticket.device_type)}</span></div>
    ${ticket.device_model ? `<div class="info-row"><span class="info-label">Model</span><span class="info-value">${escHtml(ticket.device_model)}</span></div>` : ""}
    <div class="info-row"><span class="info-label">Issue</span><span class="info-value">${escHtml(ticket.reported_issue)}</span></div>
    ${ticket.warranty_days ? `<div class="info-row"><span class="info-label">Warranty</span><span class="info-value">${ticket.warranty_days} days</span></div>` : ""}
  </div>
</div>

<!-- ── Charges table ── -->
<div class="section-title">Charges Breakdown</div>
<table>
  <thead>
    <tr>
      <th>Description</th>
      <th style="text-align:right">Amount</th>
    </tr>
  </thead>
  <tbody>
    ${partsCost > 0 ? `<tr><td>Parts &amp; Components</td><td>Rs. ${partsCost.toFixed(2)}</td></tr>` : ""}
    ${charges.map(c => `<tr><td>${escHtml(c.name)}</td><td>Rs. ${parseFloat(c.amount).toFixed(2)}</td></tr>`).join("")}
    ${partsCost === 0 && charges.length === 0 ? `<tr><td colspan="2" style="color:#9ca3af;text-align:center;padding:12px">No charges added yet</td></tr>` : ""}
    <tr class="total-row">
      <td>Total</td>
      <td>Rs. ${finalCost.toFixed(2)}</td>
    </tr>
  </tbody>
</table>

<!-- ── Footer row ── -->
<div class="footer-row">

  <!-- QR -->
  <div class="qr-block">
    <img src="${qrUrl}" alt="QR" width="90" height="90"/>
    <div class="qr-caption">Scan to track</div>
  </div>

  <!-- Signature -->
  <div class="sig-block">
    <div class="sig-label">Customer Signature</div>
    ${sig ? `<img class="sig-img" src="${sig}" alt="Signature"/>` : `<div style="font-size:10px;color:#d1d5db;font-style:italic;margin-top:8px">No signature captured</div>`}
  </div>

  <!-- Terms + Track link -->
  <div style="display:flex;flex-direction:column;gap:10px;flex:1">
    <div class="track-block">
      <div class="track-label">Track Your Repair</div>
      <div class="track-url">${escHtml(trackUrl)}</div>
    </div>
    <div class="terms-block">
      <strong>Terms &amp; Conditions</strong>
      All repaired devices carry a warranty only as specified above.
      Uncollected devices after 30 days may incur storage charges.
      Payment is due at the time of collection.
    </div>
  </div>

</div>

<script>window.onload = () => { setTimeout(() => window.print(), 400); }</script>
</body>
</html>`;

        win.document.open();
        win.document.write(html);
        win.document.close();
    }

    return (
        <button onClick={handlePrint}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted hover:bg-muted/80 text-foreground text-sm transition border border-border shadow-sm">
            <Printer className="w-4 h-4" /> Print Invoice
        </button>
    );
}

/** Minimal HTML escaping to prevent XSS in the print window */
function escHtml(s: string | null | undefined): string {
    return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="flex items-start justify-between py-3 border-b border-border last:border-0">
            <span className="text-muted-foreground text-sm">{label}</span>
            <span className="text-foreground text-sm font-medium text-right max-w-xs">{value}</span>
        </div>
    );
}

function StatusTimeline({ logs }: { logs: TicketDetail["status_logs"] }) {
    return (
        <div className="space-y-3">
            {logs.map((log, i) => (
                <div key={i} className="flex gap-3 items-start">
                    <div className="relative flex flex-col items-center">
                        <div className="w-2 h-2 rounded-full bg-primary mt-1.5" />
                        {i < logs.length - 1 && (
                            <div className="w-px flex-1 bg-border mt-1 min-h-6" />
                        )}
                    </div>
                    <div className="flex-1 pb-2">
                        <p className="text-sm text-foreground">
                            <StatusBadge status={log.to_status} />
                            {log.from_status && (
                                <span className="text-muted-foreground text-xs ml-2">from {log.from_status.replace(/_/g, " ")}</span>
                            )}
                        </p>
                        {log.notes && <p className="text-muted-foreground text-xs mt-1 italic">&quot;{log.notes}&quot;</p>}
                        <p className="text-muted-foreground opacity-80 text-xs mt-1">
                            {log.changed_by} · {new Date(log.changed_at).toLocaleString()}
                        </p>
                    </div>
                </div>
            ))}
        </div>
    );
}

export default function TicketDetailPage() {
    const { id } = useParams<{ id: string }>();
    const { user } = useAuthStore();
    const [ticket, setTicket] = useState<TicketDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [statusNotes, setStatusNotes] = useState("");
    const [changingStatus, setChangingStatus] = useState(false);
    const [statusError, setStatusError] = useState<string | null>(null);
    const [invoice, setInvoice] = useState<{ invoice_number: string; download_url: string } | null>(null);
    const [showStatusModal, setShowStatusModal] = useState(false);
    const [generatingInvoice, setGeneratingInvoice] = useState(false);
    const [checkoutLoading, setCheckoutLoading] = useState(false);

    // Const editing state
    const [editingCost, setEditingCost] = useState(false);
    const [costInput, setCostInput] = useState("");
    const [savingCost, setSavingCost] = useState(false);

    const [editingEstCost, setEditingEstCost] = useState(false);
    const [estCostInput, setEstCostInput] = useState("");
    const [savingEstCost, setSavingEstCost] = useState(false);

    // Technician assignment state
    const [team, setTeam] = useState<{ id: string; full_name?: string; email: string }[]>([]);
    const [assigningTech, setAssigningTech] = useState(false);

    // Charges state
    const [addingCharge, setAddingCharge] = useState(false);
    const [chargeName, setChargeName] = useState("");
    const [chargeAmount, setChargeAmount] = useState("");
    const [savingCharge, setSavingCharge] = useState(false);

    useEffect(() => {
        ticketsApi.get(id).then(setTicket).finally(() => setLoading(false));
        // Try to load existing invoice
        invoicesApi.get(id).then(setInvoice).catch(() => {/* not yet generated */ });
        // Load team members for assignment
        teamApi.list().then(setTeam).catch(() => {/* ignore */ });
    }, [id]);

    const handleGenerateInvoice = async () => {
        if (!ticket) return;
        setGeneratingInvoice(true);
        try {
            const res = await invoicesApi.generate(ticket.id);
            setInvoice(res);
        } catch (error) {
            alert("Failed to generate invoice.");
        } finally {
            setGeneratingInvoice(false);
        }
    };

    const handleCheckout = async () => {
        if (!ticket) return;
        setCheckoutLoading(true);
        try {
            const res = await ticketsApi.createCheckout(ticket.id, `Repair Ticket #${ticket.ticket_number}`);
            if (res.url) {
                window.location.href = res.url;
            }
        } catch (error) {
            alert("Failed to initiate payment.");
        } finally {
            setCheckoutLoading(false);
        }
    };

    // Notify via messaging state
    const [notifyWhatsApp, setNotifyWhatsApp] = useState(false);
    const [notifySMS, setNotifySMS] = useState(false);

    // Mark Ready Modal state
    const [showReadyModal, setShowReadyModal] = useState(false);
    const [readyFinalCost, setReadyFinalCost] = useState("");
    const [readyEstCost, setReadyEstCost] = useState("");
    const [pendingStatusNotes, setPendingStatusNotes] = useState("");

    const handleStatusChange = async (newStatus: string) => {
        if (!ticket) return;

        if (newStatus === "READY") {
            const pts = parseFloat(ticket.parts_cost) || 0;
            const chgs = ticket.charges?.reduce((acc, c) => acc + parseFloat(c.amount), 0) || 0;
            const total = pts + chgs;
            setReadyFinalCost(total > 0 ? total.toFixed(2) : (ticket.final_cost || ""));
            setReadyEstCost(ticket.estimated_cost?.toString() || "");
            setPendingStatusNotes(statusNotes);
            setShowReadyModal(true);
            return;
        }

        setChangingStatus(true);
        setStatusError(null);
        try {
            await ticketsApi.changeStatus(id, newStatus, statusNotes || undefined);
            const updated = await ticketsApi.get(id);
            setTicket(updated);

            // Trigger messaging if opted in
            const appUrl = typeof window !== "undefined" ? window.location.origin : "";
            const msgData = {
                ticketId: updated.id,
                ticketNumber: updated.ticket_number,
                deviceType: updated.device_type,
                deviceModel: updated.device_model,
                reportedIssue: updated.reported_issue,
                estimatedCost: updated.estimated_cost,
                finalCost: updated.final_cost,
                status: newStatus,
                customerName: updated.customer?.name,
                customerPhone: updated.customer?.phone,
            };
            const isDelivered = newStatus === "DELIVERED";
            const msg = isDelivered
                ? buildFeedbackMessage(msgData, appUrl)
                : buildStatusUpdateMessage(msgData, statusNotes || undefined);
            if (notifyWhatsApp && updated.customer?.phone) openWhatsApp(updated.customer.phone, msg);
            if (notifySMS && updated.customer?.phone) openSMS(updated.customer.phone, msg);

            setStatusNotes("");
        } catch (err: unknown) {
            const e = err as { response?: { data?: { detail?: string } } };
            setStatusError(e.response?.data?.detail || "Failed to change status.");
        } finally {
            setChangingStatus(false);
        }
    };

    const confirmMarkReady = async () => {
        if (!ticket) return;
        setChangingStatus(true);
        setStatusError(null);
        try {
            await ticketsApi.update(ticket.id, { 
                final_cost: readyFinalCost,
                estimated_cost: readyEstCost || undefined
            });
            await ticketsApi.changeStatus(ticket.id, "READY", pendingStatusNotes || undefined);
            const updated = await ticketsApi.get(ticket.id);
            setTicket(updated);
            setStatusNotes("");
            setShowReadyModal(false);
        } catch (err: unknown) {
            const e = err as { response?: { data?: { detail?: string } } };
            setStatusError(e.response?.data?.detail || "Failed to mark ready.");
            setShowReadyModal(false); // Close on error so they can read the statusError
        } finally {
            setChangingStatus(false);
        }
    };

    const handleSaveCost = async () => {
        if (!ticket) return;
        setSavingCost(true);
        try {
            const updated = await ticketsApi.update(id, {
                final_cost: costInput || undefined,
            });
            setTicket(updated);
            setEditingCost(false);
        } catch {
            alert("Failed to update final cost.");
        } finally {
            setSavingCost(false);
        }
    };

    const handleSaveEstCost = async () => {
        if (!ticket) return;
        setSavingEstCost(true);
        try {
            const updated = await ticketsApi.update(id, {
                estimated_cost: estCostInput || undefined,
            });
            setTicket(updated);
            setEditingEstCost(false);
        } catch {
            alert("Failed to update estimated cost.");
        } finally {
            setSavingEstCost(false);
        }
    };

    const handleAssignTech = async (userId: string | "unassign") => {
        if (!ticket) return;
        setAssigningTech(true);
        try {
            const val = userId === "unassign" ? null : userId;
            // The API expects assigned_to as string or undefined/null.
            const updated = await ticketsApi.update(id, { assigned_to: val as any });
            setTicket(updated);
        } catch {
            alert("Failed to assign technician.");
        } finally {
            setAssigningTech(false);
        }
    };

    // Calculate checklist format for presentation
    const parsedChecklist: ChecklistItem[] | null = ticket?.pre_repair_checklist
        ? defaultChecklist.map(base => {
            const stored = (ticket.pre_repair_checklist as any)[base.id];
            if (stored) return { ...base, status: stored.status, notes: stored.notes };
            return base;
        })
        : null;

    const handleAddCharge = async () => {
        if (!ticket || !chargeName || !chargeAmount) return;
        setSavingCharge(true);
        try {
            await ticketsApi.addCharge(id, { name: chargeName, amount: chargeAmount });
            const updated = await ticketsApi.get(id);
            setTicket(updated);
            setAddingCharge(false);
            setChargeName("");
            setChargeAmount("");
        } catch {
            alert("Failed to add charge.");
        } finally {
            setSavingCharge(false);
        }
    };

    const handleRemoveCharge = async (chargeId: string) => {
        if (!ticket || !confirm("Remove this charge?")) return;
        try {
            await ticketsApi.removeCharge(id, chargeId);
            const updated = await ticketsApi.get(id);
            setTicket(updated);
        } catch {
            alert("Failed to remove charge.");
        }
    };

    const autoCalcFinalCost = () => {
        if (!ticket) return;
        const pts = parseFloat(ticket.parts_cost) || 0;
        const chgs = ticket.charges?.reduce((acc, c) => acc + parseFloat(c.amount), 0) || 0;
        const total = (pts + chgs).toFixed(2);
        setCostInput(total.toString());
        setEditingCost(true);
    };

    if (loading) {
        return (
            <div className="p-6 flex items-center justify-center py-24">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
        );
    }
    if (!ticket) {
        return (
            <div className="p-6 text-center text-muted-foreground py-24">
                <p>Ticket not found.</p>
                <Link href="/tickets" className="text-primary hover:opacity-80 mt-2 inline-block font-medium">
                    ← Back to tickets
                </Link>
            </div>
        );
    }

    const availableTransitions = STATUS_TRANSITIONS[ticket.status] ?? [];

    return (
        <div className="p-4 sm:p-6 max-w-4xl mx-auto">
            {/* Header */}
            <div className="mb-6">
                <div className="flex items-center gap-3 mb-3">
                    <Link href="/tickets" className="text-muted-foreground hover:text-foreground shrink-0">
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <h1 className="text-xl sm:text-2xl font-bold text-foreground">{fmtTicketId(ticket.ticket_number)}</h1>
                            <StatusBadge status={ticket.status} />
                        </div>
                        <p className="text-muted-foreground font-medium text-sm mt-0.5">
                            Created {new Date(ticket.created_at).toLocaleDateString()}
                        </p>
                    </div>
                </div>
                {/* Invoice + Print buttons — wrap on mobile */}
                <div className="flex items-center gap-2 flex-wrap ml-8 sm:ml-0">
                    <PrintLabel ticket={ticket} shopName={(user as any)?.shop_name || "RepairDesk"} />
                    {invoice ? (
                        <>
                            <a href={invoice.download_url} target="_blank" rel="noopener noreferrer"
                                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted border border-border shadow-sm hover:bg-muted/80 text-foreground text-sm transition whitespace-nowrap">
                                <Download className="w-4 h-4" />{invoice.invoice_number}
                            </a>
                            <button onClick={handleCheckout} disabled={checkoutLoading}
                                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition shadow-sm disabled:opacity-50 whitespace-nowrap">
                                {checkoutLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
                                Pay Now
                            </button>
                        </>
                    ) : (
                        <button onClick={handleGenerateInvoice} disabled={generatingInvoice}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted border border-border shadow-sm hover:bg-muted/80 text-foreground text-sm transition disabled:opacity-50 whitespace-nowrap">
                            {generatingInvoice ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                            Invoice
                        </button>
                    )}
                </div>
            </div>

            {/* ── Status Change Panel — shown at TOP on mobile, in right column on desktop ── */}
            {availableTransitions.length > 0 && (
                <div className="md:hidden mb-5">
                    <div className="bg-card border border-border shadow-sm rounded-xl p-4">
                        <h2 className="text-sm font-semibold text-foreground mb-3">Change Status</h2>
                        {statusError && (
                            <p className="text-danger text-xs mb-3 p-2 bg-danger/10 rounded-lg border border-danger/20">{statusError}</p>
                        )}
                        {/* Quick Replies */}
                        <div className="mb-2">
                            <p className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1"><MessageSquare className="w-3 h-3" /> Quick replies</p>
                            <div className="flex flex-wrap gap-1.5">
                                {QUICK_REPLIES.map(r => (
                                    <button key={r.label} onClick={() => setStatusNotes(r.text)}
                                        className="text-xs px-2 py-1.5 rounded-md bg-muted hover:bg-primary/20 hover:text-primary text-muted-foreground border border-border hover:border-primary/50 transition min-h-[36px]">
                                        {r.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <textarea
                            value={statusNotes}
                            onChange={(e) => setStatusNotes(e.target.value)}
                            placeholder="Add a note (optional)…"
                            rows={2}
                            className="w-full px-3 py-2 rounded-lg bg-card border border-border shadow-sm text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:border-primary resize-none mb-3"
                        />
                        {ticket.customer?.phone && (
                            <div className="flex gap-4 mb-3 px-1">
                                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                                    <input type="checkbox" checked={notifyWhatsApp} onChange={e => setNotifyWhatsApp(e.target.checked)} className="rounded border-border accent-emerald-500" />
                                    <MessageCircle className="w-3.5 h-3.5 text-emerald-500" />
                                    Notify WhatsApp
                                </label>
                                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                                    <input type="checkbox" checked={notifySMS} onChange={e => setNotifySMS(e.target.checked)} className="rounded border-border accent-primary" />
                                    <PhoneIcon className="w-3.5 h-3.5 text-primary" />
                                    Notify SMS
                                </label>
                            </div>
                        )}
                        <div className="grid grid-cols-2 gap-2">
                            {availableTransitions.map((status) => (
                                <button key={status} onClick={() => handleStatusChange(status)}
                                    disabled={changingStatus}
                                    className="py-2.5 px-3 rounded-lg bg-muted border border-border shadow-sm hover:bg-muted/80 text-foreground font-medium text-sm text-center transition disabled:opacity-50 min-h-[44px] flex items-center justify-center">
                                    {changingStatus ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : (STATUS_LABELS[status] ?? status.replace(/_/g, " "))}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            <div className="grid md:grid-cols-3 gap-5">
                {/* Left column — details */}
                <div className="md:col-span-2 space-y-4">
                    {/* Device + Issue */}
                    <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
                        <div className="flex items-center justify-between mb-3">
                            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                                <Smartphone className="w-4 h-4 text-primary" /> Device
                            </h2>
                            {team.length > 0 && ticket.status !== "DELIVERED" && ticket.status !== "CANCELLED" && (
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-muted-foreground font-medium">Assign:</span>
                                    {assigningTech ? (
                                        <Loader2 className="w-4 h-4 text-primary animate-spin" />
                                    ) : (
                                        <select
                                            value={(ticket as any).assigned_to || ""}
                                            onChange={(e) => handleAssignTech(e.target.value || "unassign")}
                                            className="bg-muted text-foreground text-xs font-medium border border-border rounded-lg px-2 py-1.5 focus:outline-none focus:border-primary shadow-sm"
                                        >
                                            <option value="">Unassigned</option>
                                            {team.map((t) => (
                                                <option key={t.id} value={t.id}>{t.full_name || t.email}</option>
                                            ))}
                                        </select>
                                    )}
                                </div>
                            )}
                        </div>
                        <InfoRow label="Type" value={ticket.device_type} />
                        {ticket.device_model && <InfoRow label="Model" value={ticket.device_model} />}
                        <InfoRow label="Reported Issue" value={ticket.reported_issue} />
                        {ticket.technician_notes && (
                            <InfoRow label="Tech Notes" value={ticket.technician_notes} />
                        )}
                        <div className="flex items-center justify-between py-3 border-t border-border mt-2">
                            <span className="text-muted-foreground text-sm flex items-center gap-1.5">
                                <Shield className="w-3.5 h-3.5" /> Warranty
                            </span>
                            <span className="text-foreground text-sm font-medium text-right">
                                {!ticket.warranty_days ? (
                                    <span className="text-muted-foreground">None</span>
                                ) : ticket.status === "DELIVERED" ? (
                                    <span className="text-success flex items-center gap-1">
                                        Active ({ticket.warranty_days} Days)
                                    </span>
                                ) : (
                                    <span className="text-muted-foreground opacity-80">
                                        Pending Delivery ({ticket.warranty_days} Days)
                                    </span>
                                )}
                            </span>
                        </div>
                    </div>

                    {/* Customer */}
                    <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
                        <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                            <User className="w-4 h-4 text-primary" /> Customer
                        </h2>
                        {ticket.customer && (
                            <>
                                <InfoRow label="Name" value={ticket.customer.name} />
                                <InfoRow label="Phone" value={
                                    <a href={`tel:${ticket.customer.phone}`} className="text-primary hover:opacity-80">
                                        {ticket.customer.phone}
                                    </a>
                                } />
                                {/* Quick Message Buttons */}
                                <div className="pt-3 flex gap-2 flex-wrap">
                                    <button
                                        onClick={() => {
                                            const appUrl = typeof window !== "undefined" ? window.location.origin : "";
                                            const msg = buildStatusUpdateMessage({
                                                ticketId: ticket.id,
                                                ticketNumber: ticket.ticket_number,
                                                deviceType: ticket.device_type,
                                                deviceModel: ticket.device_model,
                                                reportedIssue: ticket.reported_issue,
                                                estimatedCost: ticket.estimated_cost,
                                                finalCost: ticket.final_cost,
                                                status: ticket.status,
                                                customerName: ticket.customer?.name,
                                            }, statusNotes || undefined);
                                            openWhatsApp(ticket.customer!.phone, msg);
                                        }}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-500 text-xs font-medium transition border border-emerald-600/30"
                                        title="Send current status via WhatsApp"
                                    >
                                        <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                                    </button>
                                    <button
                                        onClick={() => {
                                            const msg = buildStatusUpdateMessage({
                                                ticketId: ticket.id,
                                                ticketNumber: ticket.ticket_number,
                                                deviceType: ticket.device_type,
                                                deviceModel: ticket.device_model,
                                                reportedIssue: ticket.reported_issue,
                                                estimatedCost: ticket.estimated_cost,
                                                finalCost: ticket.final_cost,
                                                status: ticket.status,
                                                customerName: ticket.customer?.name,
                                            }, statusNotes || undefined);
                                            openSMS(ticket.customer!.phone, msg);
                                        }}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted hover:bg-muted/80 text-foreground/80 text-xs font-medium transition border border-border"
                                        title="Send current status via SMS"
                                    >
                                        <PhoneIcon className="w-3.5 h-3.5" /> SMS
                                    </button>
                                    {ticket.status === "DELIVERED" && (
                                        <button
                                            onClick={() => {
                                                const appUrl = typeof window !== "undefined" ? window.location.origin : "";
                                                const msg = buildFeedbackMessage({
                                                    ticketId: ticket.id,
                                                    ticketNumber: ticket.ticket_number,
                                                    deviceType: ticket.device_type,
                                                    deviceModel: ticket.device_model,
                                                    reportedIssue: ticket.reported_issue,
                                                    status: ticket.status,
                                                    customerName: ticket.customer?.name,
                                                }, appUrl);
                                                openWhatsApp(ticket.customer!.phone, msg);
                                            }}
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-warning/15 hover:bg-warning/25 text-warning text-xs font-medium transition border border-warning/30"
                                            title="Request feedback rating via WhatsApp"
                                        >
                                            <Star className="w-3.5 h-3.5" /> Feedback
                                        </button>
                                    )}
                                </div>
                            </>
                        )}
                    </div>

                    {/* Financials */}
                    <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
                        <div className="flex items-center justify-between mb-3">
                            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                                <IndianRupee className="w-4 h-4 text-primary" /> Financials
                            </h2>
                            {ticket.status !== "DELIVERED" && ticket.status !== "CANCELLED" && (
                                <button
                                    onClick={autoCalcFinalCost}
                                    className="text-xs bg-primary/10 text-primary hover:bg-primary/20 font-medium px-2 py-1 rounded transition"
                                >
                                    Auto Sum Parts + Charges
                                </button>
                            )}
                        </div>
                        <InfoRow label="Estimated Cost" value={
                            editingEstCost ? (
                                <div className="flex items-center gap-2">
                                    <span className="text-muted-foreground">₹</span>
                                    <input
                                        type="number"
                                        value={estCostInput}
                                        onChange={e => setEstCostInput(e.target.value)}
                                        className="w-24 bg-muted border border-border rounded px-2 py-1 text-sm text-foreground focus:outline-none focus:border-primary shadow-sm"
                                        autoFocus
                                        placeholder="0.00"
                                    />
                                    <button onClick={handleSaveEstCost} disabled={savingEstCost} className="p-2 hover:bg-success/20 text-success rounded transition disabled:opacity-50">
                                        {savingEstCost ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                    </button>
                                    <button onClick={() => setEditingEstCost(false)} disabled={savingEstCost} className="p-2 hover:bg-muted text-muted-foreground rounded transition disabled:opacity-50">
                                        <XIcon className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <span>{ticket.estimated_cost ? `₹${ticket.estimated_cost}` : "—"}</span>
                                    {ticket.status !== "DELIVERED" && ticket.status !== "CANCELLED" && (
                                        <button
                                            onClick={() => { setEstCostInput(ticket.estimated_cost?.toString() || ""); setEditingEstCost(true); }}
                                            className="text-muted-foreground hover:text-primary bg-muted hover:bg-muted/80 p-1 rounded transition-colors"
                                            title="Set Estimated Cost"
                                        >
                                            <Edit2 className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </div>
                            )
                        } />
                        <InfoRow label="Parts Cost" value={ticket.parts_cost ? `₹${ticket.parts_cost}` : "—"} />
                        <InfoRow label="Final Cost" value={
                            editingCost ? (
                                <div className="flex items-center gap-2">
                                    <span className="text-muted-foreground">₹</span>
                                    <input
                                        type="number"
                                        value={costInput}
                                        onChange={e => setCostInput(e.target.value)}
                                        className="w-24 bg-muted border border-border rounded px-2 py-1 text-sm text-foreground focus:outline-none focus:border-primary shadow-sm"
                                        autoFocus
                                        placeholder="0.00"
                                    />
                                    <button onClick={handleSaveCost} disabled={savingCost} className="p-2 hover:bg-success/20 text-success rounded transition disabled:opacity-50">
                                        {savingCost ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                    </button>
                                    <button onClick={() => setEditingCost(false)} disabled={savingCost} className="p-2 hover:bg-muted text-muted-foreground rounded transition disabled:opacity-50">
                                        <XIcon className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <span>{ticket.final_cost ? `₹${ticket.final_cost}` : "—"}</span>
                                    {ticket.status !== "DELIVERED" && ticket.status !== "CANCELLED" && (
                                        <button
                                            onClick={() => { setCostInput(ticket.final_cost?.toString() || ""); setEditingCost(true); }}
                                            className="text-muted-foreground hover:text-primary bg-muted hover:bg-muted/80 p-1 rounded transition-colors"
                                            title="Set Final Cost"
                                        >
                                            <Edit2 className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </div>
                            )
                        } />
                        <InfoRow
                            label="Profit"
                            value={ticket.profit ? (
                                <span className={parseFloat(ticket.profit) >= 0 ? "text-success font-semibold" : "text-danger flex font-semibold"}>
                                    ₹{ticket.profit}
                                </span>
                            ) : "—"}
                        />

                        {/* Charges breakdown */}
                        <div className="mt-8 border-t border-border pt-4">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-sm font-semibold text-foreground">Extra Charges</h3>
                                {ticket.status !== "DELIVERED" && ticket.status !== "CANCELLED" && !addingCharge && (
                                    <button
                                        onClick={() => setAddingCharge(true)}
                                        className="text-xs flex items-center gap-1 text-foreground font-medium bg-muted border border-border shadow-sm hover:bg-muted/80 px-2 py-1 rounded transition"
                                    >
                                        <Plus className="w-3 h-3" /> Add Charge
                                    </button>
                                )}
                            </div>

                            {addingCharge && (
                                <div className="flex gap-2 mb-3 bg-muted p-2 rounded-lg border border-border animate-fade-in shadow-sm">
                                    <input
                                        type="text"
                                        placeholder="Charge Name (e.g. Tax)"
                                        value={chargeName}
                                        onChange={(e) => setChargeName(e.target.value)}
                                        className="flex-1 bg-card border border-border rounded px-2 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary shadow-sm"
                                    />
                                    <div className="w-24 relative shadow-sm">
                                        <span className="absolute left-2 top-2 text-muted-foreground text-sm">₹</span>
                                        <input
                                            type="number"
                                            placeholder="0.00"
                                            value={chargeAmount}
                                            onChange={(e) => setChargeAmount(e.target.value)}
                                            className="w-full pl-6 pr-2 py-1.5 bg-card border border-border rounded text-sm text-foreground focus:outline-none focus:border-primary"
                                        />
                                    </div>
                                    <button
                                        onClick={handleAddCharge}
                                        disabled={savingCharge || !chargeName || !chargeAmount}
                                        className="px-2 bg-success text-white hover:opacity-90 rounded text-sm disabled:opacity-50 transition shadow-sm"
                                    >
                                        <Check className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => setAddingCharge(false)}
                                        className="px-2 bg-card border border-border text-muted-foreground hover:bg-muted rounded transition shadow-sm"
                                    >
                                        <XIcon className="w-4 h-4" />
                                    </button>
                                </div>
                            )}

                            {ticket.charges?.length === 0 ? (
                                <p className="text-xs text-muted-foreground opacity-80 italic">No extra charges applied.</p>
                            ) : (
                                <div className="space-y-2">
                                    {ticket.charges?.map((charge) => (
                                        <div key={String(charge.id)} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                                            <span className="text-xs text-foreground font-medium">{charge.name}</span>
                                            <div className="flex items-center gap-3">
                                                <span className="text-xs text-foreground bg-muted px-2 py-0.5 rounded border border-border shadow-sm">₹{charge.amount}</span>
                                                {ticket.status !== "DELIVERED" && ticket.status !== "CANCELLED" && (
                                                    <button
                                                        onClick={() => handleRemoveCharge(charge.id)}
                                                        className="p-2 text-muted-foreground hover:text-danger hover:bg-danger/10 rounded-lg transition"
                                                        title="Remove charge"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Images */}
                    {ticket.images && ticket.images.length > 0 && (
                        <div className="bg-card border border-border shadow-sm rounded-xl p-5">
                            <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                                <ImageIcon className="w-4 h-4 text-primary" /> Images ({ticket.images.length})
                            </h2>
                            <div className="grid grid-cols-3 gap-2">
                                {ticket.images.map((img) => (
                                    <a key={String(img.id)} href={img.url} target="_blank" rel="noopener noreferrer">
                                        <div className="aspect-square rounded-lg bg-card border border-border shadow-sm flex items-center justify-center hover:bg-muted transition text-muted-foreground text-xs text-center p-1 truncate">
                                            {img.filename || "image"}
                                        </div>
                                    </a>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Pre-Repair Checklist & Signature */}
                    {(parsedChecklist || ticket.customer_signature) && (
                        <div className="bg-card border border-border shadow-sm rounded-xl p-5 space-y-6">
                            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 border-b border-border pb-3">
                                <Check className="w-4 h-4 text-primary" /> Condition & Authorization
                            </h2>

                            {parsedChecklist && (
                                <PreRepairChecklist
                                    items={parsedChecklist}
                                    onChange={() => { }}
                                    readonly={true}
                                />
                            )}

                            {ticket.customer_signature && (
                                <div className="space-y-2 pt-4 border-t border-border">
                                    <h3 className="text-sm font-semibold text-foreground">Customer Signature</h3>
                                    <div className="border border-border rounded-xl overflow-hidden bg-white/5 p-2 max-w-sm">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={ticket.customer_signature}
                                            alt="Customer Signature"
                                            className="w-full h-auto"
                                        />
                                    </div>
                                    <p className="text-xs text-muted-foreground">Signed upon device drop-off</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Right column — status change + parts + timeline */}
                <div className="space-y-4">
                    {/* QR Code panel */}
                    <div className="bg-card border border-border shadow-sm rounded-xl p-5 flex flex-col items-center">
                        <h2 className="text-sm font-semibold text-foreground mb-4 w-full flex items-center gap-2">
                            <QrCode className="w-4 h-4 text-primary" /> Ticket QR Code
                        </h2>
                        <div className="bg-white p-3 rounded-xl border border-border shadow-sm mb-3">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(typeof window !== "undefined" ? btoa("RD-" + ticket.id) : ticket.id)}`}
                                alt="Ticket QR Code"
                                width={140}
                                height={140}
                                className="block"
                            />
                        </div>
                        <p className="text-xs text-muted-foreground text-center max-w-[200px]">
                            Scan to quickly open this ticket on another device.
                        </p>
                    </div>

                    {/* Status change panel — hidden on mobile (shown at top instead) */}
                    {availableTransitions.length > 0 && (
                        <div className="hidden md:block bg-card border border-border shadow-sm rounded-xl p-5">
                            <h2 className="text-sm font-semibold text-foreground mb-3">Change Status</h2>
                            {statusError && (
                                <p className="text-danger text-xs mb-3 p-2 bg-danger/10 rounded-lg border border-danger/20">{statusError}</p>
                            )}
                            {/* Quick Replies */}
                            <div className="mb-2">
                                <p className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1"><MessageSquare className="w-3 h-3" /> Quick replies</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {QUICK_REPLIES.map(r => (
                                        <button key={r.label} onClick={() => setStatusNotes(r.text)}
                                            className="text-xs px-2 py-1 rounded-md bg-muted hover:bg-primary/20 hover:text-primary text-muted-foreground border border-border hover:border-primary/50 transition">
                                            {r.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <textarea
                                value={statusNotes}
                                onChange={(e) => setStatusNotes(e.target.value)}
                                placeholder="Add a note (optional)…"
                                rows={3}
                                className="w-full px-3 py-2 rounded-lg bg-card border border-border shadow-sm text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:border-primary resize-none mb-3"
                            />
                            {/* Notify checkboxes */}
                            {ticket.customer?.phone && (
                                <div className="flex gap-4 mb-3 px-1">
                                    <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                                        <input
                                            type="checkbox"
                                            checked={notifyWhatsApp}
                                            onChange={e => setNotifyWhatsApp(e.target.checked)}
                                            className="rounded border-border accent-emerald-500"
                                        />
                                        <MessageCircle className="w-3.5 h-3.5 text-emerald-500" />
                                        Notify WhatsApp
                                    </label>
                                    <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                                        <input
                                            type="checkbox"
                                            checked={notifySMS}
                                            onChange={e => setNotifySMS(e.target.checked)}
                                            className="rounded border-border accent-primary"
                                        />
                                        <PhoneIcon className="w-3.5 h-3.5 text-primary" />
                                        Notify SMS
                                    </label>
                                </div>
                            )}
                            <div className="grid grid-cols-2 md:grid-cols-1 gap-2">
                                {availableTransitions.map((status) => (
                                    <button key={status} onClick={() => handleStatusChange(status)}
                                        disabled={changingStatus}
                                        className="py-2 px-3 rounded-lg bg-muted border border-border shadow-sm hover:bg-muted/80 text-foreground font-medium text-sm transition disabled:opacity-50 flex items-center justify-between min-h-[44px]">
                                        <span>{STATUS_LABELS[status] ?? status.replace(/_/g, " ")}</span>
                                        {changingStatus ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground -rotate-90" />}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Customer Rating — shown for delivered tickets */}
                    {ticket.status === "DELIVERED" && <StarRating ticket={ticket} onUpdate={setTicket} />}

                    {/* Parts Selector */}
                    {ticket.status !== "CANCELLED" && ticket.status !== "DELIVERED" && (
                        <PartsSelector ticket={ticket} onUpdate={setTicket} />
                    )}

                    {/* Activity log */}
                    <div className="bg-card border border-border shadow-sm rounded-xl p-5">
                        <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                            <Activity className="w-4 h-4 text-primary" /> Activity Log
                        </h2>
                        {ticket.status_logs && ticket.status_logs.length > 0 ? (
                            <StatusTimeline logs={ticket.status_logs} />
                        ) : (
                            <p className="text-muted-foreground text-sm">No activity yet.</p>
                        )}
                    </div>
                </div>
            </div>

            {/* Mark Ready Modal */}
            {showReadyModal && ticket && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
                    <div className="bg-card border border-border shadow-2xl rounded-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                                <CheckCircle className="w-5 h-5 text-emerald-500" />
                                Mark as Ready
                            </h2>
                            <button
                                onClick={() => setShowReadyModal(false)}
                                className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-lg hover:bg-muted"
                            >
                                <XIcon className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 space-y-6">
                            <div className="bg-muted/50 rounded-xl p-4 border border-border">
                                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                                    <IndianRupee className="w-4 h-4 text-muted-foreground" /> Cost Breakdown
                                </h3>
                                <div className="space-y-2 text-sm">
                                    {ticket.estimated_cost && (
                                        <div className="flex justify-between text-muted-foreground">
                                            <span>Original Estimate:</span>
                                            <span>₹{ticket.estimated_cost}</span>
                                        </div>
                                    )}
                                    <div className="flex justify-between text-foreground">
                                        <span>Parts Cost:</span>
                                        <span>₹{parseFloat(ticket.parts_cost || "0").toFixed(2)}</span>
                                    </div>

                                    {ticket.charges && ticket.charges.length > 0 && (
                                        <div className="pt-2 mt-2 border-t border-border border-dashed">
                                            <p className="text-xs text-muted-foreground mb-1 font-medium">Extra Charges:</p>
                                            {ticket.charges.map(c => (
                                                <div key={String(c.id)} className="flex justify-between text-muted-foreground text-xs pl-2">
                                                    <span>{c.name}:</span>
                                                    <span>₹{parseFloat(c.amount).toFixed(2)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    <div className="flex justify-between text-foreground">
                                        <span>Total Extra Charges:</span>
                                        <span>
                                            ₹{(ticket.charges?.reduce((acc, c) => acc + parseFloat(c.amount), 0) || 0).toFixed(2)}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-1">
                                        Estimated Cost (₹)
                                    </label>
                                    <p className="text-xs text-muted-foreground mb-2">
                                        Update the estimate if needed.
                                    </p>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">₹</span>
                                        <input
                                            type="number"
                                            value={readyEstCost}
                                            onChange={e => setReadyEstCost(e.target.value)}
                                            className="w-full pl-8 pr-4 py-2.5 bg-card border border-border rounded-xl text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition shadow-sm text-lg font-mono font-medium"
                                            placeholder="0.00"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-1">
                                        Final Cost (₹)
                                    </label>
                                    <p className="text-xs text-muted-foreground mb-2">
                                        The final cost to charge.
                                    </p>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">₹</span>
                                        <input
                                            type="number"
                                            value={readyFinalCost}
                                            onChange={e => setReadyFinalCost(e.target.value)}
                                            className="w-full pl-8 pr-4 py-2.5 bg-card border border-border rounded-xl text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition shadow-sm text-lg font-mono font-medium"
                                            placeholder="0.00"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="px-6 py-4 bg-muted border-t border-border flex justify-end gap-3">
                            <button
                                onClick={() => setShowReadyModal(false)}
                                className="px-4 py-2 text-sm font-medium text-foreground bg-card border border-border rounded-lg hover:bg-accent transition"
                                disabled={changingStatus}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmMarkReady}
                                className="px-5 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition flex items-center gap-2 shadow-sm disabled:opacity-50"
                                disabled={changingStatus}
                            >
                                {changingStatus ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                                Confirm & Mark Ready
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
