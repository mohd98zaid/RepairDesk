import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { StatusBadge } from "@/components/tickets/StatusBadge";

describe("StatusBadge Component", () => {
    it("renders RECEIVED status correctly", () => {
        render(<StatusBadge status="RECEIVED" />);
        const badge = screen.getByText("Received");
        expect(badge).toBeInTheDocument();
        // Precision left-border style: grey border, tinted background
        expect(badge).toHaveStyle({ borderLeft: "3px solid #6B7280" });
        expect(badge).toHaveStyle({ borderRadius: "4px" });
    });

    it("renders DELIVERED status correctly", () => {
        render(<StatusBadge status="DELIVERED" />);
        const badge = screen.getByText("Delivered");
        expect(badge).toBeInTheDocument();
        // Precision left-border style: teal-green border
        expect(badge).toHaveStyle({ borderLeft: "3px solid #059669" });
        expect(badge).toHaveStyle({ borderRadius: "4px" });
    });

    it("renders fallback for unknown status", () => {
        render(<StatusBadge status="UNKNOWN_STATE" />);
        const badge = screen.getByText("UNKNOWN_STATE");
        expect(badge).toBeInTheDocument();
        // Falls back to grey precision border style
        expect(badge).toHaveStyle({ borderLeft: "3px solid #6B7280" });
        expect(badge).toHaveStyle({ borderRadius: "4px" });
    });
});
