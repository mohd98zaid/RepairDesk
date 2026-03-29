"use client";

import React, { useRef, useEffect } from "react";
import SignatureCanvas from "react-signature-canvas";
import { Eraser } from "lucide-react";

interface Props {
    onChange: (signatureBase64: string | null) => void;
    readonly?: boolean;
    initialDataUrl?: string | null;
}

export function SignaturePad({ onChange, readonly = false, initialDataUrl }: Props) {
    const padRef = useRef<SignatureCanvas>(null);

    useEffect(() => {
        if (initialDataUrl && padRef.current) {
            padRef.current.fromDataURL(initialDataUrl);
        }
    }, [initialDataUrl]);

    const handleClear = () => {
        if (readonly || !padRef.current) return;
        padRef.current.clear();
        onChange(null);
    };

    const handleEnd = () => {
        if (readonly || !padRef.current) return;
        if (padRef.current.isEmpty()) {
            onChange(null);
            return;
        }
        // Export as base64 png
        onChange(padRef.current.getTrimmedCanvas().toDataURL("image/png"));
    };

    // Calculate dynamic styles based on theme but we can use Tailwind classes
    // since react-signature-canvas accepts a canvasProps object

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between border-b border-border pb-2">
                <h3 className="text-sm font-semibold text-foreground">
                    Customer Signature
                </h3>
                {!readonly && (
                    <button
                        type="button"
                        onClick={handleClear}
                        className="text-muted-foreground hover:text-danger flex items-center gap-1 text-xs px-2 py-1 rounded bg-muted/50 hover:bg-danger/10 transition"
                    >
                        <Eraser className="w-3.5 h-3.5" />
                        Clear
                    </button>
                )}
            </div>

            <div className={`border border-border rounded-xl overflow-hidden bg-card ${readonly ? 'opacity-80 pointer-events-none' : ''}`}>
                <SignatureCanvas
                    ref={padRef}
                    penColor="var(--color-foreground)"
                    canvasProps={{
                        className: "w-full h-40 touch-none cursor-crosshair",
                        // Note: SignatureCanvas might need fixed dimensions or specific CSS to not stretch.
                        // Setting it touch-none prevents scrolling on mobile while signing.
                    }}
                    onEnd={handleEnd}
                    backgroundColor="rgba(0,0,0,0)" // Transparent so card bg shows
                    clearOnResize={false}
                />
            </div>
            {!readonly && (
                <p className="text-xs text-muted-foreground text-center">
                    Sign inside the box to authorize repair
                </p>
            )}
        </div>
    );
}
