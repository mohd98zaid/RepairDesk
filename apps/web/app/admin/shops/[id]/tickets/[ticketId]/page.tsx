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
    Package,
    Download
} from "lucide-react";
import AdminNav from "@/components/admin/AdminNav";
import { getShopTicket, getShopTicketInvoice, getShop } from "@/lib/admin-api";
import { StatusBadge } from "@/components/tickets/StatusBadge";
import { fmtTicketId } from "@/lib/utils/ticketId";
import type { TicketDetail } from "@/types";

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="flex items-start justify-between py-3 border-b border-border last:border-0">
            <span className="text-muted-foreground text-sm">{label}</span>
            <span className="text-foreground text-sm font-medium text-right max-w-xs">{value}</span>
        </div>
    );
}

function StatusTimeline({ logs }: { logs: NonNullable<TicketDetail["status_logs"]> }) {
    return (
        <div className="space-y-3">
            {logs.map((log, i) => (
                <div key={i} className="flex gap-3 items-start">
                    <div className="relative flex flex-col items-center">
                        <div className="w-2 h-2 rounded-full bg-indigo-500 mt-1.5" />
                        {i < logs.length - 1 && (
                            <div className="w-px flex-1 bg-muted mt-1 min-h-6" />
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
                        <p className="text-muted-foreground text-xs mt-1">
                            {log.changed_by} · {new Date(log.changed_at).toLocaleString()}
                        </p>
                    </div>
                </div>
            ))}
        </div>
    );
}

export default function AdminTicketDetailPage() {
    const { id: shopId, ticketId } = useParams<{ id: string; ticketId: string }>();
    const [ticket, setTicket] = useState<TicketDetail | null>(null);
    const [invoice, setInvoice] = useState<{ invoice_number: string; download_url: string } | null>(null);
    const [shop, setShop] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const currency = shop?.currency_symbol || "₹";

    useEffect(() => {
        Promise.all([
            getShopTicket(shopId, ticketId),
            getShop(shopId)
        ])
            .then(([tRes, sRes]) => {
                setTicket(tRes);
                setShop(sRes);
            })
            .catch(() => { /* handled in ui */ })
            .finally(() => setLoading(false));

        getShopTicketInvoice(shopId, ticketId)
            .then(setInvoice)
            .catch(() => { /* invoice might not be generated yet */ });
    }, [shopId, ticketId]);

    const content = () => {
        if (loading) {
            return (
                <div className="flex items-center justify-center py-24">
                    <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
                </div>
            );
        }

        if (!ticket) {
            return (
                <div className="text-center text-muted-foreground py-24">
                    <p>Ticket not found.</p>
                </div>
            );
        }

        return (
            <div className="max-w-4xl mx-auto">
                <div className="flex items-center gap-3 mb-6">
                    <div className="flex-1">
                        <div className="flex items-center gap-3">
                            <h1 className="text-2xl font-bold text-foreground">{fmtTicketId(ticket.ticket_number)}</h1>
                            <StatusBadge status={ticket.status} />
                        </div>
                        <p className="text-muted-foreground text-sm mt-0.5">
                            Created {new Date(ticket.created_at).toLocaleDateString()}
                        </p>
                    </div>
                    {invoice && (
                        <a
                            href={invoice.download_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted hover:bg-muted/80 text-foreground/90 text-sm transition"
                        >
                            <Download className="w-4 h-4" />
                            {invoice.invoice_number}
                        </a>
                    )}
                </div>

                <div className="grid md:grid-cols-3 gap-5">
                    <div className="md:col-span-2 space-y-4">
                        <div className="bg-card/50 border border-border rounded-xl p-5">
                            <h2 className="text-sm font-semibold text-foreground/90 mb-3 flex items-center gap-2">
                                <Smartphone className="w-4 h-4" /> Device
                            </h2>
                            <InfoRow label="Type" value={ticket.device_type} />
                            {ticket.device_model && <InfoRow label="Model" value={ticket.device_model} />}
                            <InfoRow label="Reported Issue" value={ticket.reported_issue} />
                            {ticket.technician_notes && (
                                <InfoRow label="Tech Notes" value={ticket.technician_notes} />
                            )}
                        </div>

                        <div className="bg-card/50 border border-border rounded-xl p-5">
                            <h2 className="text-sm font-semibold text-foreground/90 mb-3 flex items-center gap-2">
                                <User className="w-4 h-4" /> Customer
                            </h2>
                            {ticket.customer && (
                                <>
                                    <InfoRow label="Name" value={ticket.customer.name} />
                                    <InfoRow label="Phone" value={
                                        <a href={`tel:${ticket.customer.phone}`} className="text-indigo-400 hover:text-indigo-300">
                                            {ticket.customer.phone}
                                        </a>
                                    } />
                                </>
                            )}
                        </div>

                        <div className="bg-card/50 border border-border rounded-xl p-5">
                            <h2 className="text-sm font-semibold text-foreground/90 mb-3 flex items-center gap-2">
                                <IndianRupee className="w-4 h-4" /> Financials
                            </h2>
                            <InfoRow label="Estimated Cost" value={ticket.estimated_cost ? `${currency}${ticket.estimated_cost}` : "—"} />
                            <InfoRow label="Parts Cost" value={ticket.parts_cost ? `${currency}${ticket.parts_cost}` : "—"} />
                            <InfoRow label="Final Cost" value={ticket.final_cost ? `${currency}${ticket.final_cost}` : "—"} />
                            <InfoRow
                                label="Profit"
                                value={ticket.profit ? (
                                    <span className={parseFloat(ticket.profit) >= 0 ? "text-emerald-400" : "text-red-400"}>
                                        {currency}{ticket.profit}
                                    </span>
                                ) : "—"}
                            />
                        </div>

                        {ticket.images && ticket.images.length > 0 && (
                            <div className="bg-card/50 border border-border rounded-xl p-5">
                                <h2 className="text-sm font-semibold text-foreground/90 mb-3 flex items-center gap-2">
                                    <ImageIcon className="w-4 h-4" /> Images ({ticket.images.length})
                                </h2>
                                <div className="grid grid-cols-3 gap-2">
                                    {ticket.images.map((img) => (
                                        <a key={String(img.id)} href={img.url} target="_blank" rel="noopener noreferrer">
                                            <div className="aspect-square rounded-lg bg-muted flex items-center justify-center hover:bg-muted/80 transition text-muted-foreground text-xs text-center p-1 truncate">
                                                {img.filename || "image"}
                                            </div>
                                        </a>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="space-y-4">
                        {ticket.parts && ticket.parts.length > 0 && (
                            <div className="bg-card/50 border border-border rounded-xl p-5">
                                <h2 className="text-sm font-semibold text-foreground/90 mb-4 flex items-center gap-2">
                                    <Package className="w-4 h-4" /> Parts Used
                                </h2>
                                <div className="space-y-3">
                                    {ticket.parts.map(part => (
                                        <div key={part.id} className="flex justify-between text-sm pb-2 border-b border-border/50 last:border-0 last:pb-0">
                                            <div>
                                                <p className="text-foreground">{part.name}</p>
                                                <p className="text-xs text-muted-foreground">Qty: {part.quantity}</p>
                                            </div>
                                            <p className="text-foreground/90">{currency}{parseFloat(part.cost || "0") * part.quantity}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="bg-card/50 border border-border rounded-xl p-5">
                            <h2 className="text-sm font-semibold text-foreground/90 mb-4 flex items-center gap-2">
                                <Activity className="w-4 h-4" /> Activity Log
                            </h2>
                            {ticket.status_logs && ticket.status_logs.length > 0 ? (
                                <StatusTimeline logs={ticket.status_logs} />
                            ) : (
                                <p className="text-muted-foreground text-sm">No activity yet.</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="admin-layout">
            <AdminNav />
            <main className="admin-main">
                <Link href={`/admin/shops/${shopId}`} className="back-link">
                    <ArrowLeft size={16} /> Back to Shop Details
                </Link>
                {content()}
            </main>
        </div>
    );
}
