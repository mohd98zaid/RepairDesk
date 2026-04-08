"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { X, QrCode, Loader2, CameraOff, Upload } from "lucide-react";
import { Scanner } from "@yudiel/react-qr-scanner";
import jsQR from "jsqr";

export function QRScannerModal({ onClose }: { onClose: () => void }) {
    const router = useRouter();
    const [scanned, setScanned] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [scanAttempts, setScanAttempts] = useState(0);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleScan = (result: any) => {
        if (!result || scanned) return;

        try {
            let raw = result[0]?.rawValue || result;
            if (!raw) return;

            setScanned(true);

            // Try to decode base64 "RD-<uuid>" (obfuscated payload)
            try {
                const decoded = atob(raw);
                if (decoded.startsWith("RD-")) {
                    raw = decoded.substring(3);
                }
            } catch (e) {
                // Not standard base64 or failed decode, process as raw text
            }

            // Expecting either a direct UUID or a URL containing the UUID (e.g., /tickets/uuid)
            // Or just a ticket number.
            // But we'll aggressively redirect to the search page or ticket details.

            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

            if (uuidRegex.test(raw)) {
                router.push(`/tickets/${raw}`);
            } else if (raw.includes("/tickets/")) {
                router.push(new URL(raw, window.location.origin).pathname);
            } else {
                router.push(`/tickets?search=${encodeURIComponent(raw)}`);
            }

            onClose();
        } catch (e) {
            setError("Invalid QR Code payload.");
            setScanned(false);
        }
    };

    const handleRetry = () => {
        setError(null);
        setScanAttempts(prev => prev + 1);
    };

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            const image = new Image();
            image.src = URL.createObjectURL(file);
            await new Promise((resolve, reject) => {
                image.onload = resolve;
                image.onerror = reject;
            });

            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d", { willReadFrequently: true });
            
            // Standardize size to help jsQR perform better
            const MAX_WIDTH = 800;
            let width = image.width;
            let height = image.height;
            if (width > MAX_WIDTH) {
                height = Math.floor((MAX_WIDTH / width) * height);
                width = MAX_WIDTH;
            }

            canvas.width = width;
            canvas.height = height;
            ctx?.drawImage(image, 0, 0, width, height);
            
            const imageData = ctx?.getImageData(0, 0, width, height);
            if (!imageData) throw new Error("Could not read image data");

            const code = jsQR(imageData.data, imageData.width, imageData.height);
            
            if (code) {
               handleScan([{ rawValue: code.data }]);
            } else {
               setError("No QR code found in the image. Please try a clearer picture.");
            }
        } catch (err) {
            console.error("Image processing error:", err);
            setError("Error processing image. Please try again.");
        }
        
        // Reset file input
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-card border border-border rounded-3xl overflow-hidden shadow-2xl w-full max-w-sm flex flex-col items-center animate-in fade-in zoom-in duration-200">
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
                            <p className="text-white text-sm font-medium tracking-tight">Opening Ticket...</p>
                        </div>
                    ) : error ? (
                        <div className="flex flex-col items-center justify-center p-6 text-center h-full bg-zinc-950 gap-4 w-full">
                            <div className="bg-red-500/20 p-4 rounded-full">
                                <CameraOff className="w-8 h-8 text-red-500" />
                            </div>
                            <div className="w-full">
                                <h3 className="text-red-400 font-semibold mb-1">Camera Access Failed</h3>
                                <p className="text-sm text-zinc-400 leading-relaxed mb-4">
                                    {error.includes("Permission denied") 
                                        ? "Your browser is blocking access to the camera." 
                                        : error}
                                </p>
                            </div>
                            <div className="flex flex-col w-full gap-3">
                                <input 
                                    type="file" 
                                    accept="image/*" 
                                    capture="environment"
                                    className="hidden" 
                                    ref={fileInputRef}
                                    onChange={handleFileUpload}
                                />
                                <button 
                                    onClick={() => fileInputRef.current?.click()}
                                    className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-primary text-primary-foreground font-medium rounded-xl transition-all shadow-sm hover:brightness-110"
                                >
                                    <Upload className="w-4 h-4" />
                                    Upload QR Photo
                                </button>
                                <button 
                                    onClick={handleRetry}
                                    className="w-full px-5 py-3 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 font-medium rounded-xl transition-all"
                                >
                                    Try Camera Again
                                </button>
                            </div>
                        </div>
                    ) : (
                        <Scanner
                            key={scanAttempts}
                            onScan={handleScan}
                            onError={(e: any) => {
                                console.error("QR Scanner Error:", e);
                                const msg = e?.message || String(e);
                                if (typeof window !== "undefined" && window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
                                    setError("Camera requires HTTPS or localhost. Error: " + msg);
                                } else {
                                    setError(msg.includes("Permission denied") ? "Permission denied" : "Camera error: " + msg);
                                }
                            }}
                            styles={{
                                container: { width: "100%", height: "100%" },
                            }}
                        />
                    )}
                </div>

                <div className="p-4 w-full bg-muted/20 text-center border-t border-border/50">
                    {error ? (
                        <p className="text-sm font-medium text-destructive">Unable to start scanner</p>
                    ) : (
                        <p className="text-sm text-muted-foreground font-medium">Position the QR code inside the frame.</p>
                    )}
                </div>
            </div>
        </div>
    );
}
