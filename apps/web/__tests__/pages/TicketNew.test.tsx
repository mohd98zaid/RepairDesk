import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import NewTicketPage from "@/app/(app)/tickets/new/page";
import { ticketsApi } from "@/lib/api/tickets";
import * as navigation from "next/navigation";

vi.mock("next/navigation", () => ({
    useRouter: vi.fn(),
}));

vi.mock("@/lib/api/tickets", () => ({
    ticketsApi: {
        create: vi.fn(),
    },
}));

describe("New Ticket Page", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("renders new ticket form fields", async () => {
        (navigation.useRouter as any).mockReturnValue({ push: vi.fn() });
        render(<NewTicketPage />);

        expect(screen.getByText("New Ticket")).toBeInTheDocument();
        expect(await screen.findByPlaceholderText("+2348012345678")).toBeInTheDocument();
        expect(await screen.findByPlaceholderText("Describe the problem in detail…")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Create Ticket/i })).toBeInTheDocument();
    });

    it("submits the form successfully and redirects", async () => {
        const pushMock = vi.fn();
        (navigation.useRouter as any).mockReturnValue({ push: pushMock });

        (ticketsApi.create as any).mockResolvedValue({
            id: "ticket-123",
            ticket_number: 101,
        });

        render(<NewTicketPage />);

        // Fill required fields by placeholder or role
        fireEvent.change(await screen.findByPlaceholderText("+2348012345678"), { target: { value: "+1234567890" } });
        fireEvent.change(await screen.findByPlaceholderText("John Doe"), { target: { value: "Test User" } });

        // Select dropdown doesn't have placeholder, use standard select fetch
        const selects = screen.getAllByRole("combobox");
        // device_type is the first one
        fireEvent.change(selects[0], { target: { value: "Smartphone" } });

        fireEvent.change(await screen.findByPlaceholderText("Describe the problem in detail…"), { target: { value: "Battery won't charge" } });

        // Submit
        fireEvent.click(screen.getByRole("button", { name: /Create Ticket/i }));

        await waitFor(() => {
            expect(ticketsApi.create).toHaveBeenCalledWith(expect.objectContaining({
                customer_phone: "+1234567890",
                customer_name: "Test User",
                device_type: "Smartphone",
                reported_issue: "Battery won't charge"
            }));
            expect(pushMock).toHaveBeenCalledWith("/tickets/ticket-123");
        });
    });
});
