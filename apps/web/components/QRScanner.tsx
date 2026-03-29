"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, QrCode, Loader2 } from "lucide-react";
import { Scanner } from "@yudiel/react-qr-scanner";

export function QRScannerModal({ onClose }: { onClose: () => void }) {
    const router = useRouter();
    const [scanned, setScanned] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleScan = (result: any) => {
        if (!result || scanned) return;

        try {
            const raw = result[0]?.rawValue || result;
            if (!raw) return;

            setScanned(true);

            // Expecting either a direct UUID or a URL containing the UUID (e.g., /tickets/uuid)
            // Or just a ticket number.
            // But we'll aggressively redirect to the search page or ticket details.

            // Check if it's a UUID (typical ticket ID)
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

            if (uuidRegex.test(raw)) {
                router.push(`/tickets/${raw}`);
            } else if (raw.includes("/tickets/")) {
                router.push(new URL(raw, window.location.origin).pathname);
            } else {
                // If it's a short text or ticket number, use search
                router.push(`/tickets?search=${encodeURIComponent(raw)}`);
            }

            onClose();
        } catch (e) {
            setError("Invalid QR Code payload.");
            setScanned(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-card border border-border rounded-3xl overflow-hidden shadow-2xl w-full max-w-sm flex flex-col items-center">
                <div className="w-full flex items-center justify-between p-4 border-b border-border/50 bg-muted/30">
                    <div className="flex items-center gap-2">
                        <QrCode className="w-5 h-5 text-primary" />
                        <h2 className="text-foreground font-bold tracking-tight">Scan Ticket QR</h2>
                    </div>
                    <button onClick={onClose} className="p-1 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="relative w-full aspect-square bg-black overflow-hidden flex items-center justify-center">
                    {scanned ? (
                        <div className="flex flex-col items-center gap-3">
                            <Loader2 className="w-8 h-8 animate-spin text-primary" />
                            <p className="text-foreground text-sm font-medium tracking-tight">Opening Ticket...</p>
                        </div>
                    ) : (
                        <Scanner
                            onScan={handleScan}
                            onError={(e) => setError("Camera access denied or failed.")}
                            styles={{
                                container: { width: "100%", height: "100%" },
                            }}
                        />
                    )}
                </div>

                <div className="p-4 w-full bg-muted/20 text-center">
                    {error ? (
                        <p className="text-sm font-medium text-red-400">{error}</p>
                    ) : (
                        <p className="text-sm text-muted-foreground font-medium">Position the QR code inside the frame.</p>
                    )}
                </div>
            </div>
        </div>
    );
}
