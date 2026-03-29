"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Loader2, Phone, Smartphone, Wrench, Plus, Trash2, Receipt, PenTool } from "lucide-react";
import { ticketsApi } from "@/lib/api/tickets";
import { getErrorMessage } from "@/lib/api/client";
import { PreRepairChecklist, defaultChecklist, type ChecklistItem } from "@/components/tickets/PreRepairChecklist";
import { SignaturePad } from "@/components/tickets/SignaturePad";
import { api } from "@/lib/api/client";
import { useEffect } from "react";

const schema = z.object({
    customer_phone: z.string().min(5, "Enter customer phone number"),
    customer_name: z.string().min(1, "Enter customer name"),
    device_type: z.string().min(1, "Device type is required"),
    device_model: z.string().optional(),
    reported_issue: z.string().min(5, "Describe the issue (min. 5 chars)"),
    estimated_cost: z.string().optional(),
    initial_charges: z.array(
        z.object({
            name: z.string().min(1, "Charge name required"),
            amount: z.string().min(1, "Charge amount required"),
        })
    ).optional(),
    warranty_days: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

const DEVICE_TYPES = [
    "Smartphone",
    "Tablet",
    "Laptop",
    "Desktop",
    "Smartwatch",
    "Console",
    "Printer",
    "Other",
];

export default function NewTicketPage() {
    const router = useRouter();
    const [serverError, setServerError] = useState<string | null>(null);
    const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>(defaultChecklist);
    const [signature, setSignature] = useState<string | null>(null);

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
        watch,
        setValue,
    } = useForm<FormData>({
        resolver: zodResolver(schema),
        defaultValues: { initial_charges: [] }
    });

    useEffect(() => {
        api.get("/shops/me").then(r => {
            if (!r.data?.address) {
                router.push("/onboarding?from=tickets");
            }
        }).catch(() => {});
    }, [router]);

    const initialCharges = watch("initial_charges") || [];

    const addCharge = () => {
        setValue("initial_charges", [...initialCharges, { name: "", amount: "" }]);
    };

    const removeCharge = (index: number) => {
        const newCharges = [...initialCharges];
        newCharges.splice(index, 1);
        setValue("initial_charges", newCharges);
    };

    const onSubmit = async (data: FormData) => {
        setServerError(null);
        try {
            const ticket = await ticketsApi.create({
                customer_phone: data.customer_phone,
                customer_name: data.customer_name,
                device_type: data.device_type,
                device_model: data.device_model || undefined,
                reported_issue: data.reported_issue,
                estimated_cost: data.estimated_cost || undefined,
                initial_charges: data.initial_charges?.length ? data.initial_charges : undefined,
                pre_repair_checklist: checklistItems.reduce((acc, cur) => {
                    acc[cur.id] = { status: cur.status, notes: cur.notes };
                    return acc;
                }, {} as Record<string, any>),
                customer_signature: signature,
                warranty_days: data.warranty_days ? parseInt(data.warranty_days, 10) : undefined,
            });
            router.push(`/tickets/${ticket.id}`);
        } catch (err: unknown) {
            setServerError(getErrorMessage(err, "Failed to create ticket."));
        }
    };

    return (
        <div className="p-6 max-w-2xl mx-auto">
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
                <Link href="/tickets" className="text-muted-foreground hover:text-foreground transition">
                    <ArrowLeft className="w-5 h-5" />
                </Link>
                <div>
                    <h1 className="text-2xl font-bold text-foreground">New Ticket</h1>
                    <p className="text-muted-foreground text-sm">Create a new repair job</p>
                </div>
            </div>

            {serverError && (
                <div className="mb-4 p-3 rounded-lg bg-red-900/40 border border-red-800 text-red-300 text-sm">
                    {serverError}
                </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                {/* Customer section */}
                <div className="glass rounded-xl p-5">
                    <h2 className="text-sm font-semibold text-foreground/90 mb-4 flex items-center gap-2">
                        <Phone className="w-4 h-4" /> Customer Info
                    </h2>
                    <div className="grid sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-foreground/90 mb-1">
                                Phone Number *
                            </label>
                            <input
                                {...register("customer_phone")}
                                type="tel"
                                placeholder="+2348012345678"
                                className="w-full px-4 py-2.5 rounded-lg bg-muted border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition text-sm"
                            />
                            {errors.customer_phone && (
                                <p className="text-red-400 text-xs mt-1">{errors.customer_phone.message}</p>
                            )}
                            <p className="text-muted-foreground text-xs mt-1">
                                Existing customer will be found automatically
                            </p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-foreground/90 mb-1">
                                Customer Name *
                            </label>
                            <input
                                {...register("customer_name")}
                                placeholder="John Doe"
                                className="w-full px-4 py-2.5 rounded-lg bg-muted border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition text-sm"
                            />
                            {errors.customer_name && (
                                <p className="text-red-400 text-xs mt-1">{errors.customer_name.message}</p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Device section */}
                <div className="glass rounded-xl p-5">
                    <h2 className="text-sm font-semibold text-foreground/90 mb-4 flex items-center gap-2">
                        <Smartphone className="w-4 h-4" /> Device Details
                    </h2>
                    <div className="grid sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-foreground/90 mb-1">
                                Device Type *
                            </label>
                            <select
                                {...register("device_type")}
                                className="w-full px-4 py-2.5 rounded-lg bg-muted border border-border text-foreground focus:outline-none focus:border-indigo-500 transition text-sm"
                            >
                                <option value="">Select device type</option>
                                {DEVICE_TYPES.map((d) => (
                                    <option key={d} value={d}>{d}</option>
                                ))}
                            </select>
                            {errors.device_type && (
                                <p className="text-red-400 text-xs mt-1">{errors.device_type.message}</p>
                            )}
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-foreground/90 mb-1">
                                Model <span className="text-muted-foreground">(optional)</span>
                            </label>
                            <input
                                {...register("device_model")}
                                placeholder="e.g. iPhone 14, Galaxy S23"
                                className="w-full px-4 py-2.5 rounded-lg bg-muted border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition text-sm"
                            />
                        </div>
                        <div className="sm:col-span-2">
                            <label className="block text-sm font-medium text-foreground/90 mb-1">
                                Warranty <span className="text-muted-foreground">(optional)</span>
                            </label>
                            <select
                                {...register("warranty_days")}
                                className="w-full px-4 py-2.5 rounded-lg bg-muted border border-border text-foreground focus:outline-none focus:border-indigo-500 transition text-sm"
                            >
                                <option value="">No Warranty</option>
                                <option value="30">30 Days</option>
                                <option value="90">90 Days</option>
                                <option value="180">6 Months</option>
                                <option value="365">1 Year</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* Issue section */}
                <div className="glass rounded-xl p-5">
                    <h2 className="text-sm font-semibold text-foreground/90 mb-4 flex items-center gap-2">
                        <Wrench className="w-4 h-4" /> Issue & Estimate
                    </h2>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-foreground/90 mb-1">
                                Reported Issue *
                            </label>
                            <textarea
                                {...register("reported_issue")}
                                rows={3}
                                placeholder="Describe the problem in detail…"
                                className="w-full px-4 py-2.5 rounded-lg bg-muted border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition text-sm resize-none"
                            />
                            {errors.reported_issue && (
                                <p className="text-red-400 text-xs mt-1">{errors.reported_issue.message}</p>
                            )}
                        </div>
                        <div className="sm:w-1/2">
                            <label className="block text-sm font-medium text-foreground/90 mb-1">
                                Estimated Cost <span className="text-muted-foreground">(optional)</span>
                            </label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₹</span>
                                <input
                                    {...register("estimated_cost")}
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    placeholder="0.00"
                                    className="w-full pl-7 pr-4 py-2.5 rounded-lg bg-muted border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition text-sm"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Additional Charges section */}
                <div className="glass rounded-xl p-5">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-sm font-semibold text-foreground/90 flex items-center gap-2">
                            <Receipt className="w-4 h-4" /> Initial Charges <span className="text-muted-foreground font-normal">(optional)</span>
                        </h2>
                        <button
                            type="button"
                            onClick={addCharge}
                            className="text-xs bg-muted text-foreground/90 px-3 py-1.5 rounded-lg border border-border hover:bg-muted/80 hover:text-foreground transition flex items-center gap-1"
                        >
                            <Plus className="w-3 h-3" /> Add Charge
                        </button>
                    </div>

                    {initialCharges.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">No extra charges added. You can add labor, tax, or fees here or later.</p>
                    ) : (
                        <div className="space-y-3">
                            {initialCharges.map((_, index) => (
                                <div key={index} className="flex gap-3 items-start animate-fade-in">
                                    <div className="flex-1">
                                        <input
                                            {...register(`initial_charges.${index}.name`)}
                                            placeholder="Charge Name (e.g. Diagnostic Fee)"
                                            className="w-full px-4 py-2.5 rounded-lg bg-muted border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:border-indigo-500 transition text-sm"
                                        />
                                        {errors.initial_charges?.[index]?.name && (
                                            <p className="text-red-400 text-xs mt-1">{errors.initial_charges[index].name?.message}</p>
                                        )}
                                    </div>
                                    <div className="w-32 relative">
                                        <span className="absolute left-3 top-2.5 text-muted-foreground text-sm">₹</span>
                                        <input
                                            {...register(`initial_charges.${index}.amount`)}
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            placeholder="0.00"
                                            className="w-full pl-7 pr-4 py-2.5 rounded-lg bg-muted border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:border-indigo-500 transition text-sm"
                                        />
                                        {errors.initial_charges?.[index]?.amount && (
                                            <p className="text-red-400 text-xs mt-1">{errors.initial_charges[index].amount?.message}</p>
                                        )}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => removeCharge(index)}
                                        className="p-2.5 text-muted-foreground hover:text-red-400 hover:bg-red-950/30 rounded-lg transition"
                                        title="Remove charge"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Checklist & Signature section */}
                <div className="glass rounded-xl p-5 space-y-6">
                    <h2 className="text-sm font-semibold text-foreground/90 flex items-center gap-2 border-b border-border pb-2">
                        <PenTool className="w-4 h-4" /> Condition & Authorization
                    </h2>

                    <PreRepairChecklist items={checklistItems} onChange={setChecklistItems} />

                    <div className="pt-2">
                        <SignaturePad onChange={setSignature} />
                    </div>
                </div>

                {/* Submit */}
                <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-3 rounded-lg gradient-primary text-white font-semibold hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                    {isSubmitting ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Creating ticket…</>
                    ) : (
                        "Create Ticket"
                    )}
                </button>
            </form>
        </div>
    );
}
