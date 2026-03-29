import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { StatusBadge } from "@/components/tickets/StatusBadge";

describe("StatusBadge Component", () => {
    it("renders RECEIVED status correctly", () => {
        render(<StatusBadge status="RECEIVED" />);
        const badge = screen.getByText("Received");
        expect(badge).toBeInTheDocument();
        expect(badge).toHaveClass("bg-zinc-700 text-foreground");
    });

    it("renders DELIVERED status correctly", () => {
        render(<StatusBadge status="DELIVERED" />);
        const badge = screen.getByText("Delivered");
        expect(badge).toBeInTheDocument();
        expect(badge).toHaveClass("bg-green-900/70 text-green-300");
    });

    it("renders fallback for unknown status", () => {
        render(<StatusBadge status="UNKNOWN_STATE" />);
        const badge = screen.getByText("UNKNOWN_STATE");
        expect(badge).toBeInTheDocument();
        expect(badge).toHaveClass("bg-zinc-700 text-foreground/90");
    });
});
