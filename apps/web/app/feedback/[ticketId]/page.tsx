"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ticketsApi } from "@/lib/api/tickets";
import { Star, Loader2, CheckCircle, AlertCircle, Wrench, Package, Clock, Truck, XCircle } from "lucide-react";

type FeedbackState = "idle" | "loading" | "submitting" | "submitted" | "error";

const RATING_LABELS = ["", "Poor", "Fair", "Good", "Great", "Excellent! 🎉"];
const RATING_COLORS = [
    "",
    "text-red-500",
    "text-orange-400",
    "text-yellow-400",
    "text-lime-400",
    "text-emerald-500",
];

// Status display configuration
const STATUS_STEPS = [
    { key: "RECEIVED",       label: "Received",          icon: Package,  color: "text-blue-400",    bg: "bg-blue-500/20",    border: "border-blue-500/40"   },
    { key: "IN_PROGRESS",    label: "In Progress",       icon: Wrench,   color: "text-amber-400",   bg: "bg-amber-500/20",   border: "border-amber-500/40"  },
    { key: "WAITING_PARTS",  label: "Waiting for Parts", icon: Clock,    color: "text-orange-400",  bg: "bg-orange-500/20",  border: "border-orange-500/40" },
    { key: "READY",          label: "Ready for Pickup",  icon: CheckCircle, color: "text-lime-400", bg: "bg-lime-500/20",    border: "border-lime-500/40"   },
    { key: "DELIVERED",      label: "Delivered",         icon: Truck,    color: "text-emerald-400", bg: "bg-emerald-500/20", border: "border-emerald-500/40"},
];

const STATUS_ORDER = ["RECEIVED", "IN_PROGRESS", "WAITING_PARTS", "READY", "DELIVERED"];

interface PublicInfo {
    id: string;
    ticket_number: number;
    device_type: string;
    device_model: string | null;
    status: string;
    customer_rating: number | null;
    customer_feedback: string | null;
}

function StatusTracker({ status }: { status: string }) {
    if (status === "CANCELLED") {
        return (
            <div className="flex items-center justify-center gap-2 py-4 px-4 rounded-xl bg-red-500/10 border border-red-500/30">
                <XCircle className="w-5 h-5 text-red-400 shrink-0" />
                <span className="text-red-300 text-sm font-medium">This repair has been cancelled.</span>
            </div>
        );
    }

    const currentIdx = STATUS_ORDER.indexOf(status);

    return (
        <div className="w-full">
            <div className="flex flex-col gap-2">
                {STATUS_STEPS.map((step, idx) => {
                    const isComplete = idx < currentIdx;
                    const isCurrent = idx === currentIdx;
                    const Icon = step.icon;

                    return (
                        <div
                            key={step.key}
                            className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-300 ${
                                isCurrent
                                    ? `${step.bg} ${step.border}`
                                    : isComplete
                                    ? "bg-white/5 border-white/10"
                                    : "bg-transparent border-white/5 opacity-40"
                            }`}
                        >
                            {/* Icon */}
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                                isCurrent ? step.bg : isComplete ? "bg-emerald-500/15" : "bg-white/5"
                            }`}>
                                {isComplete ? (
                                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                                ) : (
                                    <Icon className={`w-4 h-4 ${isCurrent ? step.color : "text-white/30"}`} />
                                )}
                            </div>

                            {/* Label */}
                            <span className={`text-sm font-medium flex-1 ${
                                isCurrent ? step.color : isComplete ? "text-white/70" : "text-white/25"
                            }`}>
                                {step.label}
                            </span>

                            {/* Badge */}
                            {isCurrent && (
                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${step.bg} ${step.color} border ${step.border}`}>
                                    Current
                                </span>
                            )}
                            {isComplete && (
                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                    Done
                                </span>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export default function FeedbackPage() {
    const { ticketId } = useParams<{ ticketId: string }>();
    const [ticket, setTicket] = useState<PublicInfo | null>(null);
    const [state, setState] = useState<FeedbackState>("loading");
    const [hover, setHover] = useState(0);
    const [rating, setRating] = useState(0);
    const [feedback, setFeedback] = useState("");
    const [errorMsg, setErrorMsg] = useState("");

    useEffect(() => {
        ticketsApi.getPublicInfo(ticketId)
            .then((info) => {
                setTicket(info);
                if (info.customer_rating) {
                    setRating(info.customer_rating);
                    setFeedback(info.customer_feedback ?? "");
                    setState("submitted");
                } else if (info.status === "DELIVERED") {
                    setState("idle");
                } else {
                    // Non-delivered — show status tracker (no error)
                    setState("idle");
                }
            })
            .catch(() => {
                setErrorMsg("Ticket not found. Please check your link.");
                setState("error");
            });
    }, [ticketId]);

    const handleSubmit = async () => {
        if (!rating || !ticket) return;
        setState("submitting");
        try {
            await ticketsApi.submitRating(ticket.id, rating, feedback || undefined);
            setState("submitted");
        } catch {
            setErrorMsg("Something went wrong. Please try again.");
            setState("error");
        }
    };

    const fmtId = ticket ? `RD-${String(ticket.ticket_number).padStart(5, "0")}` : "";
    const display = hover || rating;
    const isDelivered = ticket?.status === "DELIVERED";

    return (
        <div className="min-h-screen bg-gradient-to-br from-[#0f0f1a] via-[#13131f] to-[#0d1117] flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-sm">
                {/* Branding */}
                <div className="text-center mb-8">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-700 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-indigo-900/50">
                        <span className="text-white font-bold text-2xl">R</span>
                    </div>
                    <h1 className="text-white font-bold text-xl">RepairDesk</h1>
                    <p className="text-white/50 text-xs mt-1">Repair Tracker</p>
                </div>

                {/* Card */}
                <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-lg shadow-2xl">
                    {/* Loading */}
                    {state === "loading" && (
                        <div className="flex flex-col items-center py-8 gap-3">
                            <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
                            <p className="text-white/50 text-sm">Loading…</p>
                        </div>
                    )}

                    {/* Error */}
                    {state === "error" && (
                        <div className="flex flex-col items-center py-6 gap-3 text-center">
                            <AlertCircle className="w-10 h-10 text-red-400" />
                            <p className="text-white/80 text-sm">{errorMsg}</p>
                        </div>
                    )}

                    {/* Status Tracker + Feedback Form/Result */}
                    {(state === "idle" || state === "submitting" || state === "submitted") && ticket && (
                        <>
                            {/* Ticket Info */}
                            <div className="text-center mb-5">
                                <p className="text-white/40 text-xs font-medium mb-1">Ticket {fmtId}</p>
                                <h2 className="text-white font-bold text-lg leading-snug">
                                    {ticket.device_type}
                                    {ticket.device_model ? ` · ${ticket.device_model}` : ""}
                                </h2>
                            </div>

                            {/* Status Tracker */}
                            <div className="mb-6">
                                <p className="text-white/40 text-[11px] uppercase tracking-widest font-semibold mb-3">Repair Progress</p>
                                <StatusTracker status={ticket.status} />
                            </div>

                            {/* Feedback section — only for delivered tickets */}
                            {isDelivered && (
                                <div className="border-t border-white/10 pt-5">
                                    <p className="text-white/40 text-[11px] uppercase tracking-widest font-semibold mb-4">Your Feedback</p>

                                    {/* Already submitted */}
                                    {state === "submitted" && (
                                        <div className="flex flex-col items-center py-2 gap-3 text-center">
                                            <CheckCircle className="w-10 h-10 text-emerald-400" />
                                            <p className="text-white/70 text-sm font-medium">Thank you for your feedback!</p>
                                            <div className="flex gap-1 mt-1">
                                                {[1, 2, 3, 4, 5].map((s) => (
                                                    <Star
                                                        key={s}
                                                        className={`w-7 h-7 ${s <= rating ? "fill-yellow-400 text-yellow-400" : "text-white/20"}`}
                                                    />
                                                ))}
                                            </div>
                                            <p className={`text-sm font-semibold ${RATING_COLORS[rating]}`}>
                                                {RATING_LABELS[rating]}
                                            </p>
                                            {feedback && (
                                                <p className="text-white/50 text-xs italic mt-1">"{feedback}"</p>
                                            )}
                                        </div>
                                    )}

                                    {/* Rating form */}
                                    {(state === "idle" || state === "submitting") && (
                                        <>
                                            <p className="text-white/60 text-sm text-center mb-4">How was your repair experience?</p>

                                            {/* Star selector */}
                                            <div className="flex justify-center gap-2 mb-2">
                                                {[1, 2, 3, 4, 5].map((s) => (
                                                    <button
                                                        key={s}
                                                        onMouseEnter={() => setHover(s)}
                                                        onMouseLeave={() => setHover(0)}
                                                        onClick={() => setRating(s)}
                                                        className="transition-transform hover:scale-125 active:scale-110"
                                                    >
                                                        <Star
                                                            className={`w-10 h-10 transition-colors duration-150 ${
                                                                s <= display
                                                                    ? "fill-yellow-400 text-yellow-400"
                                                                    : "text-white/20"
                                                            }`}
                                                        />
                                                    </button>
                                                ))}
                                            </div>

                                            {display > 0 && (
                                                <p className={`text-center text-sm font-semibold mb-4 ${RATING_COLORS[display]}`}>
                                                    {RATING_LABELS[display]}
                                                </p>
                                            )}

                                            {/* Optional comment */}
                                            <textarea
                                                value={feedback}
                                                onChange={(e) => setFeedback(e.target.value)}
                                                placeholder="Leave a comment (optional)…"
                                                rows={3}
                                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white/80 placeholder-white/25 text-sm focus:outline-none focus:border-indigo-500 resize-none mb-4 transition"
                                            />

                                            <button
                                                onClick={handleSubmit}
                                                disabled={!rating || state === "submitting"}
                                                className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-700 text-white font-semibold text-sm flex items-center justify-center gap-2 hover:opacity-90 transition disabled:opacity-40 shadow-lg shadow-indigo-900/40"
                                            >
                                                {state === "submitting" ? (
                                                    <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</>
                                                ) : (
                                                    "Submit Feedback"
                                                )}
                                            </button>
                                        </>
                                    )}
                                </div>
                            )}

                            {/* Not delivered yet — friendly message */}
                            {!isDelivered && ticket.status !== "CANCELLED" && (
                                <p className="text-white/30 text-xs text-center mt-2">
                                    You can leave a review once your device is delivered.
                                </p>
                            )}
                        </>
                    )}
                </div>

                <p className="text-white/20 text-xs text-center mt-6">
                    Powered by RepairDesk &mdash; Professional Repair Management
                </p>
            </div>
        </div>
    );
}
