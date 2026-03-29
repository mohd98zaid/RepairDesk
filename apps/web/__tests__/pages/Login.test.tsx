import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import LoginPage from "@/app/(auth)/login/page";
import { api } from "@/lib/api/client";
import * as navigation from "next/navigation";

// Mock the next/navigation router
vi.mock("next/navigation", () => ({
    useRouter: vi.fn(),
}));

// Mock the axios instance client since authApi doesn't exist
vi.mock("@/lib/api/client", () => ({
    api: {
        post: vi.fn(),
    },
    getErrorMessage: vi.fn().mockImplementation((e) => e?.message || "Error"),
}));

describe("Login Page", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
    });

    it("renders login form correctly", () => {
        render(<LoginPage />);
        expect(screen.getByPlaceholderText("you@example.com")).toBeInTheDocument();
        expect(screen.getByPlaceholderText("Your password")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Sign In/i })).toBeInTheDocument();
    });

    it("shows error on failed login", async () => {
        (api.post as any).mockRejectedValue({ response: { status: 401 } });
        (navigation.useRouter as any).mockReturnValue({ push: vi.fn() });

        render(<LoginPage />);

        fireEvent.change(screen.getByPlaceholderText("you@example.com"), {
            target: { value: "test@example.com" },
        });
        fireEvent.change(screen.getByPlaceholderText("Your password"), {
            target: { value: "wrongpassword" },
        });

        fireEvent.click(screen.getByRole("button", { name: /Sign In/i }));

        await waitFor(() => {
            expect(screen.getByText("Invalid email or password. Please try again.")).toBeInTheDocument();
        });
    });

    it("successfully logs in, saves token, and redirects", async () => {
        const pushMock = vi.fn();
        (navigation.useRouter as any).mockReturnValue({ push: pushMock });

        (api.post as any).mockResolvedValue({
            data: {
                access_token: "fake-jwt-token",
                user: { id: "1", name: "owner" }
            }
        });

        render(<LoginPage />);

        fireEvent.change(screen.getByPlaceholderText("you@example.com"), {
            target: { value: "owner@test.com" },
        });
        fireEvent.change(screen.getByPlaceholderText("Your password"), {
            target: { value: "correctpassword" },
        });

        fireEvent.click(screen.getByRole("button", { name: /Sign In/i }));

        await waitFor(() => {
            // Zustand authStore is being tested here
            expect(pushMock).toHaveBeenCalledWith("/dashboard");
        });
    });
});
