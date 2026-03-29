/**
 * Format a raw ticket_number integer as the display ticket ID.
 * e.g. 42 → "ZRD000042"
 */
export function fmtTicketId(ticketNumber: number): string {
    return `ZRD${String(ticketNumber).padStart(6, "0")}`;
}
