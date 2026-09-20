import { clsx } from "clsx";

type TicketStatus =
    | "RECEIVED"
    | "IN_PROGRESS"
    | "WAITING_PARTS"
    | "READY"
    | "DELIVERED"
    | "CANCELLED";

/**
 * Status badge with precision left-border style:
 * - 4px border-radius (not pill)
 * - 3px solid left border in the status colour
 * - very light tinted background at ~8% opacity
 */
const STATUS_CONFIG: Record<TicketStatus, { label: string; style: React.CSSProperties }> = {
    RECEIVED: {
        label: "Received",
        style: {
            borderLeft: "3px solid #6B7280",
            background: "rgba(107, 114, 128, 0.08)",
            color: "#4B5563",
            borderRadius: "4px",
            padding: "2px 8px",
        },
    },
    IN_PROGRESS: {
        label: "In Progress",
        style: {
            borderLeft: "3px solid #2563EB",
            background: "rgba(37, 99, 235, 0.08)",
            color: "#1D4ED8",
            borderRadius: "4px",
            padding: "2px 8px",
        },
    },
    WAITING_PARTS: {
        label: "Waiting Parts",
        style: {
            borderLeft: "3px solid #D97706",
            background: "rgba(217, 119, 6, 0.08)",
            color: "#B45309",
            borderRadius: "4px",
            padding: "2px 8px",
        },
    },
    READY: {
        label: "Ready",
        style: {
            borderLeft: "3px solid #16A34A",
            background: "rgba(22, 163, 74, 0.08)",
            color: "#15803D",
            borderRadius: "4px",
            padding: "2px 8px",
        },
    },
    DELIVERED: {
        label: "Delivered",
        style: {
            borderLeft: "3px solid #059669",
            background: "rgba(5, 150, 105, 0.08)",
            color: "#047857",
            borderRadius: "4px",
            padding: "2px 8px",
        },
    },
    CANCELLED: {
        label: "Cancelled",
        style: {
            borderLeft: "3px solid #DC2626",
            background: "rgba(220, 38, 38, 0.08)",
            color: "#B91C1C",
            borderRadius: "4px",
            padding: "2px 8px",
        },
    },
};

export function StatusBadge({ status }: { status: string }) {
    const config = STATUS_CONFIG[status as TicketStatus] ?? {
        label: status,
        style: {
            borderLeft: "3px solid #6B7280",
            background: "rgba(107, 114, 128, 0.08)",
            color: "#4B5563",
            borderRadius: "4px",
            padding: "2px 8px",
        },
    };
    return (
        <span
            className="inline-flex items-center text-xs font-medium"
            style={config.style}
        >
            {config.label}
        </span>
    );
}

export function StatusDot({ status }: { status: string }) {
    const dotColor: Record<string, string> = {
        RECEIVED: "bg-zinc-400",
        IN_PROGRESS: "bg-blue-400",
        WAITING_PARTS: "bg-amber-400",
        READY: "bg-emerald-400",
        DELIVERED: "bg-green-400",
        CANCELLED: "bg-red-400",
    };
    return (
        <span
            className={clsx(
                "inline-block w-2 h-2 rounded-full",
                dotColor[status] ?? "bg-zinc-400"
            )}
        />
    );
}
