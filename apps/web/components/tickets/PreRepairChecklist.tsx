import React from "react";
import { CheckCircle2, Circle } from "lucide-react";

export type ChecklistItem = {
    id: string;
    label: string;
    status: "pass" | "fail" | "not_tested" | "n_a";
    notes?: string;
};

export const defaultChecklist: ChecklistItem[] = [
    { id: "power", label: "Powers On", status: "not_tested" },
    { id: "screen", label: "Screen / Display", status: "not_tested" },
    { id: "touch", label: "Touch Functionality", status: "not_tested" },
    { id: "battery", label: "Battery Charging", status: "not_tested" },
    { id: "camera_front", label: "Front Camera", status: "not_tested" },
    { id: "camera_rear", label: "Rear Camera", status: "not_tested" },
    { id: "speakers", label: "Speakers / Audio", status: "not_tested" },
    { id: "buttons", label: "Physical Buttons", status: "not_tested" },
    { id: "wifi", label: "Wi-Fi / Cellular", status: "not_tested" },
];

interface Props {
    items: ChecklistItem[];
    onChange: (items: ChecklistItem[]) => void;
    readonly?: boolean;
}

export function PreRepairChecklist({ items, onChange, readonly = false }: Props) {

    const handleStatusChange = (id: string, status: ChecklistItem["status"]) => {
        if (readonly) return;
        onChange(items.map((item) => (item.id === id ? { ...item, status } : item)));
    };

    const handleNotesChange = (id: string, notes: string) => {
        if (readonly) return;
        onChange(items.map((item) => (item.id === id ? { ...item, notes } : item)));
    };

    return (
        <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground border-b border-border pb-2">
                Pre-Repair Device Condition Checklist
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {items.map((item) => (
                    <div
                        key={item.id}
                        className="p-3 bg-muted/50 border border-border rounded-xl flex flex-col gap-3"
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-foreground">{item.label}</span>
                            <div className="flex items-center gap-1 bg-card rounded-lg border border-border p-1">
                                {(["pass", "fail", "not_tested", "n_a"] as const).map((status) => {
                                    const active = item.status === status;
                                    let activeClass = "bg-primary text-primary-foreground";
                                    if (status === "pass") activeClass = "bg-success text-white";
                                    if (status === "fail") activeClass = "bg-danger text-white";
                                    if (status === "n_a") activeClass = "bg-muted-foreground/20 text-foreground";

                                    const labelMap: Record<string, string> = {
                                        pass: "Pass",
                                        fail: "Fail",
                                        not_tested: "N/T",
                                        n_a: "N/A"
                                    };

                                    return (
                                        <button
                                            key={status}
                                            type="button"
                                            disabled={readonly}
                                            onClick={() => handleStatusChange(item.id, status)}
                                            className={`px-2 py-1 text-xs font-medium rounded-md transition-all ${active
                                                    ? activeClass
                                                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                                                } ${readonly ? "cursor-default opacity-80" : "cursor-pointer"}`}
                                        >
                                            {labelMap[status]}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                        {(!readonly || item.notes) && (
                            <input
                                type="text"
                                placeholder="Add notes (optional)..."
                                value={item.notes || ""}
                                onChange={(e) => handleNotesChange(item.id, e.target.value)}
                                disabled={readonly}
                                className="w-full text-xs px-2 py-1.5 bg-card border border-border rounded text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary disabled:opacity-75 disabled:bg-muted"
                            />
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
