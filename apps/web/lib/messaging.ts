/**
 * Messaging helpers — build and open WhatsApp / SMS deep-links
 * All functions are purely client-side; they open native apps via URIs.
 */

/** Format a phone for wa.me (strip all non-digits, remove leading 0) */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  // If starts with 0, try to remove leading 0 (local format)
  return digits.startsWith("0") ? digits.slice(1) : digits;
}

export interface TicketMessageData {
  ticketId: string;
  ticketNumber: number;
  deviceType: string;
  deviceModel?: string | null;
  reportedIssue: string;
  estimatedCost?: string | null;
  finalCost?: string | null;
  status: string;
  customerName?: string;
  customerPhone?: string;
  shopName?: string;
}

const STATUS_LABELS: Record<string, string> = {
  RECEIVED: "Received",
  IN_PROGRESS: "In Progress",
  WAITING_PARTS: "Waiting on Parts",
  READY: "Ready for Pickup ✅",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

/** Builds the new ticket confirmation message */
export function buildNewTicketMessage(data: TicketMessageData, appUrl: string): string {
  const ticketId = `RD-${String(data.ticketNumber).padStart(5, "0")}`;
  const qr = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(data.ticketId)}`;
  const lines = [
    `✅ *Repair Ticket Confirmed!*`,
    ``,
    `Hi ${data.customerName || "there"},`,
    `Your device has been received at our repair shop.`,
    ``,
    `🎫 *Ticket ID:* ${ticketId}`,
    `📱 *Device:* ${data.deviceType}${data.deviceModel ? ` — ${data.deviceModel}` : ""}`,
    `🔧 *Issue:* ${data.reportedIssue}`,
    ...(data.estimatedCost ? [`💰 *Estimated Cost:* Rs. ${data.estimatedCost}`] : []),
    ``,
    `🔗 *Track your repair:* ${appUrl}/feedback/${data.ticketId}`,
    ``,
    `We'll keep you updated on the progress. Thank you! 🙏`,
  ];
  return lines.join("\n");
}

/** Builds a status update message */
export function buildStatusUpdateMessage(data: TicketMessageData, notes?: string): string {
  const ticketId = `RD-${String(data.ticketNumber).padStart(5, "0")}`;
  const statusLabel = STATUS_LABELS[data.status] ?? data.status.replace(/_/g, " ");
  const lines = [
    `🔔 *Repair Update — ${ticketId}*`,
    ``,
    `Hi ${data.customerName || "there"},`,
    `Your repair status has been updated.`,
    ``,
    `🎫 *Ticket:* ${ticketId}`,
    `📱 *Device:* ${data.deviceType}${data.deviceModel ? ` — ${data.deviceModel}` : ""}`,
    `📌 *New Status:* ${statusLabel}`,
    ...(notes ? [`💬 *Note:* ${notes}`] : []),
    ...(data.finalCost ? [`💰 *Final Cost:* Rs. ${data.finalCost}`] : []),
    ``,
    `Thank you for your patience! 🙏`,
  ];
  return lines.join("\n");
}

/** Builds the post-delivery feedback message with a link */
export function buildFeedbackMessage(data: TicketMessageData, appUrl: string): string {
  const ticketId = `RD-${String(data.ticketNumber).padStart(5, "0")}`;
  const lines = [
    `⭐ *How did we do, ${data.customerName || "there"}?*`,
    ``,
    `Your device (${ticketId}) has been delivered.`,
    `We'd love to hear your feedback!`,
    ``,
    `👇 *Rate your experience (takes 10 seconds):*`,
    `${appUrl}/feedback/${data.ticketId}`,
    ``,
    `Your rating helps us improve. Thank you! 🙏`,
  ];
  return lines.join("\n");
}

/** Opens WhatsApp with a pre-filled message */
export function openWhatsApp(phone: string, message: string): void {
  const normalized = normalizePhone(phone);
  const url = `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

/** Opens the native SMS app with a pre-filled message */
export function openSMS(phone: string, message: string): void {
  // sms: URI — body param works on most Android/iOS devices
  const url = `sms:${phone}?body=${encodeURIComponent(message)}`;
  window.location.href = url;
}
