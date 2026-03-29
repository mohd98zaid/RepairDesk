import { clsx } from "clsx";

type TicketStatus =
    | "RECEIVED"
    | "IN_PROGRESS"
    | "WAITING_PARTS"
    | "READY"
    | "DELIVERED"
    | "CANCELLED";

const STATUS_CONFIG: Record<TicketStatus, { label: string; className: string }> = {
    RECEIVED: { label: "Received", className: "bg-muted text-foreground" },
    IN_PROGRESS: { label: "In Progress", className: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
    WAITING_PARTS: { label: "Waiting Parts", className: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
    READY: { label: "Ready", className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
    DELIVERED: { label: "Delivered", className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
    CANCELLED: { label: "Cancelled", className: "bg-red-500/10 text-red-600 dark:text-red-400" },
};

export function StatusBadge({ status }: { status: string }) {
    const config = STATUS_CONFIG[status as TicketStatus] ?? {
        label: status,
        className: "bg-muted text-foreground/90",
    };
    return (
        <span
            className={clsx(
                "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
                config.className
            )}
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
