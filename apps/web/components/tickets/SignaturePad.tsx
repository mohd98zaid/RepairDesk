"use client";

import React, { useRef, useEffect, useCallback, useState } from "react";
import { Eraser, PenLine } from "lucide-react";

interface Props {
    onChange: (signatureBase64: string | null) => void;
    readonly?: boolean;
    initialDataUrl?: string | null;
}

/**
 * SignaturePad — works on all input devices:
 *   • Laptop / desktop  → mouse events
 *   • Tablet / phone    → touch events
 *   • Pen / stylus      → pointer events with pressure
 *
 * Uses a raw <canvas> + unified PointerEvent API instead of react-signature-canvas
 * so it reliably captures strokes on every device category.
 */
export function SignaturePad({ onChange, readonly = false, initialDataUrl }: Props) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const drawing = useRef(false);
    const isEmpty = useRef(true);
    const [hasSignature, setHasSignature] = useState(false);

    // ── Canvas sizing ──────────────────────────────────────────────────────────
    const resize = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.parentElement!.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;

        // Save the current drawing
        const snapshot = canvas.toDataURL();

        canvas.width  = Math.round(rect.width  * dpr);
        canvas.height = Math.round(rect.height * dpr);
        canvas.style.width  = `${rect.width}px`;
        canvas.style.height = `${rect.height}px`;

        const ctx = canvas.getContext("2d")!;
        ctx.scale(dpr, dpr);
        ctx.strokeStyle = "#1e293b";
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        // Re-draw existing content
        if (!isEmpty.current) {
            const img = new Image();
            img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
            img.src = snapshot;
        }
    }, []);

    // ── Initial render & resize observer ──────────────────────────────────────
    useEffect(() => {
        resize();
        const ro = new ResizeObserver(resize);
        if (canvasRef.current?.parentElement) ro.observe(canvasRef.current.parentElement);
        return () => ro.disconnect();
    }, [resize]);

    // ── Load initial data URL (view mode) ─────────────────────────────────────
    useEffect(() => {
        if (!initialDataUrl || !canvasRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d")!;
        const img = new Image();
        img.onload = () => {
            ctx.drawImage(img, 0, 0, canvas.offsetWidth, canvas.offsetHeight);
            isEmpty.current = false;
            setHasSignature(true);
        };
        img.src = initialDataUrl;
    }, [initialDataUrl]);

    // ── Pointer helpers ────────────────────────────────────────────────────────
    function getPos(e: React.PointerEvent<HTMLCanvasElement>) {
        const rect = canvasRef.current!.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    function ctxOf() {
        const canvas = canvasRef.current!;
        const ctx = canvas.getContext("2d")!;
        ctx.strokeStyle = "#1e293b";
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        return ctx;
    }

    const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (readonly) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        drawing.current = true;
        const { x, y } = getPos(e);
        const ctx = ctxOf();
        ctx.beginPath();
        ctx.moveTo(x, y);
    };

    const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (!drawing.current || readonly) return;
        const { x, y } = getPos(e);
        const ctx = ctxOf();
        ctx.lineTo(x, y);
        ctx.stroke();
        isEmpty.current = false;
    };

    const onPointerUp = () => {
        if (!drawing.current) return;
        drawing.current = false;
        if (!isEmpty.current && canvasRef.current) {
            // Trim whitespace via off-screen canvas
            const src = canvasRef.current;
            const trimmed = trimCanvas(src);
            const dataUrl = trimmed.toDataURL("image/png");
            setHasSignature(true);
            onChange(dataUrl);
        }
    };

    const handleClear = () => {
        if (readonly || !canvasRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d")!;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        isEmpty.current = true;
        setHasSignature(false);
        onChange(null);
    };

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between border-b border-border pb-2">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    <PenLine className="w-3.5 h-3.5 text-primary" />
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

            <div
                className={`relative border rounded-xl overflow-hidden bg-white dark:bg-slate-900 ${
                    readonly ? "opacity-80" : "cursor-crosshair"
                } ${!hasSignature && !readonly ? "border-border border-dashed" : "border-border"}`}
                style={{ height: 160 }}
            >
                {/* Placeholder text when empty and not readonly */}
                {!hasSignature && !readonly && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
                        <span className="text-muted-foreground/40 text-sm">
                            Sign here with your finger, mouse, or stylus
                        </span>
                    </div>
                )}

                <canvas
                    ref={canvasRef}
                    style={{ display: "block", width: "100%", height: "100%", touchAction: "none" }}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerLeave={onPointerUp}
                />
            </div>

            {!readonly && (
                <p className="text-xs text-muted-foreground text-center">
                    Touch, pen, or mouse — sign inside the box to authorize repair
                </p>
            )}
        </div>
    );
}

/** Trims transparent pixels from canvas edges (returns a smaller canvas) */
function trimCanvas(canvas: HTMLCanvasElement): HTMLCanvasElement {
    const ctx = canvas.getContext("2d")!;
    const { width, height } = canvas;
    const pixels = ctx.getImageData(0, 0, width, height);
    const data = pixels.data;

    let top = height, bottom = 0, left = width, right = 0;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const alpha = data[(y * width + x) * 4 + 3];
            if (alpha > 0) {
                if (y < top)    top    = y;
                if (y > bottom) bottom = y;
                if (x < left)   left   = x;
                if (x > right)  right  = x;
            }
        }
    }

    const trimmed = document.createElement("canvas");
    const pad = 8;
    trimmed.width  = Math.max(right  - left + 1 + pad * 2, 1);
    trimmed.height = Math.max(bottom - top  + 1 + pad * 2, 1);
    trimmed.getContext("2d")!.drawImage(canvas, left - pad, top - pad, trimmed.width, trimmed.height, 0, 0, trimmed.width, trimmed.height);
    return trimmed;
}
