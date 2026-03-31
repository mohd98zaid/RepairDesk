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

// ── Emoji Safe Definitions ──
// We use String.fromCodePoint at runtime to absolutely guarantee that 
// file encoding, bundlers, and web servers cannot corrupt the emoji characters.
const EMOJI = {
  check: String.fromCodePoint(0x2705),    // ✅
  ticket: String.fromCodePoint(0x1F3AB),  // 🎫
  phone: String.fromCodePoint(0x1F4F1),   // 📱
  wrench: String.fromCodePoint(0x1F527),  // 🔧
  money: String.fromCodePoint(0x1F4B0),   // 💰
  link: String.fromCodePoint(0x1F517),    // 🔗
  pray: String.fromCodePoint(0x1F64F),    // 🙏
  bell: String.fromCodePoint(0x1F514),    // 🔔
  pin: String.fromCodePoint(0x1F4CC),     // 📌
  speech: String.fromCodePoint(0x1F4AC),  // 💬
  star: String.fromCodePoint(0x2B50),     // ⭐
  down: String.fromCodePoint(0x1F447),    // 👇
  em_dash: String.fromCodePoint(0x2014),  // —
};



const STATUS_LABELS: Record<string, string> = {
  RECEIVED: "Received",
  IN_PROGRESS: "In Progress",
  WAITING_PARTS: "Waiting on Parts",
  READY: `Ready for Pickup ${EMOJI.check}`,
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

/** Builds the new ticket confirmation message */
export function buildNewTicketMessage(data: TicketMessageData, appUrl: string): string {
  const ticketId = `RD-${String(data.ticketNumber).padStart(5, "0")}`;
  const lines = [
    `${EMOJI.check} *Repair Ticket Confirmed!*`,
    ``,
    `Hi ${data.customerName || "there"},`,
    `Your device has been received at our repair shop.`,
    ``,
    `${EMOJI.ticket} *Ticket ID:* ${ticketId}`,
    `${EMOJI.phone} *Device:* ${data.deviceType}${data.deviceModel ? ` ${EMOJI.em_dash} ${data.deviceModel}` : ""}`,
    `${EMOJI.wrench} *Issue:* ${data.reportedIssue}`,
    ...(data.estimatedCost ? [`${EMOJI.money} *Estimated Cost:* Rs. ${data.estimatedCost}`] : []),
    ``,
    `${EMOJI.link} *Track your repair:* ${appUrl}/feedback/${data.ticketId}`,
    ``,
    `We'll keep you updated on the progress. Thank you! ${EMOJI.pray}`,
  ];
  return lines.join("\n");
}

/** Builds a status update message */
export function buildStatusUpdateMessage(data: TicketMessageData, notes?: string): string {
  const ticketId = `RD-${String(data.ticketNumber).padStart(5, "0")}`;
  const statusLabel = STATUS_LABELS[data.status] ?? data.status.replace(/_/g, " ");
  const appUrl = typeof window !== "undefined" ? window.location.origin : "";
  const lines = [
    `${EMOJI.bell} *Repair Update ${EMOJI.em_dash} ${ticketId}*`,
    ``,
    `Hi ${data.customerName || "there"},`,
    `Your repair status has been updated.`,
    ``,
    `${EMOJI.ticket} *Ticket:* ${ticketId}`,
    `${EMOJI.phone} *Device:* ${data.deviceType}${data.deviceModel ? ` ${EMOJI.em_dash} ${data.deviceModel}` : ""}`,
    `${EMOJI.pin} *New Status:* ${statusLabel}`,
    ...(notes ? [`${EMOJI.speech} *Note:* ${notes}`] : []),
    ...(data.finalCost ? [`${EMOJI.money} *Final Cost:* Rs. ${data.finalCost}`] : []),
    ``,
    `${EMOJI.link} *Track your repair:* ${appUrl}/feedback/${ticketId}`,
    ``,
    `Thank you for your patience! ${EMOJI.pray}`,
  ];
  return lines.join("\n");
}

/** Builds the post-delivery feedback message with a link */
export function buildFeedbackMessage(data: TicketMessageData, appUrl: string): string {
  const ticketId = `RD-${String(data.ticketNumber).padStart(5, "0")}`;
  const lines = [
    `${EMOJI.star} *How did we do, ${data.customerName || "there"}?*`,
    ``,
    `Your device (${ticketId}) has been delivered.`,
    `We'd love to hear your feedback!`,
    ``,
    `${EMOJI.down} *Rate your experience (takes 10 seconds):*`,
    `${appUrl}/feedback/${data.ticketId}`,
    ``,
    `Your rating helps us improve. Thank you! ${EMOJI.pray}`,
  ];
  return lines.join("\n");
}

/** Opens WhatsApp with a pre-formatted message. */
export function openWhatsApp(phone: string, message: string): void {
  const normalized = normalizePhone(phone);
  // Encode the entire string correctly here
  const url = `https://api.whatsapp.com/send?phone=${normalized}&text=${encodeURIComponent(message)}`;
  
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/** Opens the native SMS app with a pre-filled message */
export function openSMS(phone: string, message: string): void {
  const url = `sms:${phone}?body=${encodeURIComponent(message)}`;
  window.location.href = url;
}
