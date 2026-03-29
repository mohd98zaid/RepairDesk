"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

export default function InventoryLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();

    const tabs = [
        { name: "Items", href: "/inventory" },
        { name: "Vendors", href: "/inventory/vendors" },
        { name: "Purchase Orders", href: "/inventory/purchase-orders" },
    ];

    return (
        <div className="flex-1 overflow-y-auto bg-background flex flex-col relative w-full h-full max-h-screen">
            {/* Header section w/ Tabs */}
            <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-xl border-b border-border/50 px-6 py-4 flex flex-col gap-4">
                <div>
                    <h1 className="text-2xl font-black text-foreground tracking-tight">Inventory</h1>
                    <p className="text-muted-foreground text-sm font-medium mt-1 pr-12">
                        Manage parts, suppliers, and purchase orders.
                    </p>
                </div>

                <div className="flex gap-2 p-1 bg-muted/50 rounded-lg w-fit">
                    {tabs.map((tab) => (
                        <Link
                            key={tab.href}
                            href={tab.href}
                            className={clsx(
                                "px-4 py-2 rounded-md text-sm font-medium transition-all duration-200",
                                pathname === tab.href
                                    ? "bg-card text-foreground shadow-sm ring-1 ring-border"
                                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                            )}
                        >
                            {tab.name}
                        </Link>
                    ))}
                </div>
            </div>

            {/* Content body */}
            <div className="flex-1 w-full bg-background relative flex flex-col p-6">
                {children}
            </div>
        </div>
    );
}
