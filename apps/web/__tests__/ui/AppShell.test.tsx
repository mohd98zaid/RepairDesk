import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AppShell from '@/components/layout/AppShell';
import { useAuthStore } from '@/store/authStore';

// Mock next/navigation
vi.mock('next/navigation', () => ({
    useRouter: () => ({
        push: vi.fn(),
    }),
    usePathname: () => '/dashboard',
}));

// Mock OfflineSyncManager to avoid IndexedDB issues
vi.mock('@/components/OfflineSyncManager', () => ({
    OfflineSyncManager: () => null
}));

// Mock ResizeObserver for Responsive views
global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
};

// Mock BroadcastChannel
global.BroadcastChannel = class BroadcastChannel {
    name: string;
    onmessage: ((ev: MessageEvent) => any) | null = null;
    constructor(name: string) { this.name = name; }
    postMessage() {}
    close() {}
    addEventListener() {}
    removeEventListener() {}
    dispatchEvent() { return true; }
} as any;

// Mock EventSource
global.EventSource = class EventSource {
    onmessage: ((ev: MessageEvent) => any) | null = null;
    onerror: ((ev: Event) => any) | null = null;
    constructor() {}
    close() {}
} as any;

describe('AppShell Component', () => {
    beforeEach(() => {
        // setup mock user state
        useAuthStore.setState({
            user: {
                id: 'opt1',
                email: 'test@repairdesk.com',
                full_name: 'Test Setup',
                role: 'OWNER',
                shop_id: 'shop1'
            },
            accessToken: null
        });
        
        // Mock localStorage
        Storage.prototype.getItem = vi.fn((key: string) => {
            if (key === 'repairdesk-auth') return JSON.stringify({ state: { user: { id: 'opt1' } } });
            if (key === 'repairdesk_skip_onboarding') return 'true';
            return null;
        });
    });

    it('renders desktop sidebar navigation items', () => {
        render(<AppShell><div>Test Content</div></AppShell>);

        expect(screen.getAllByText('RepairDesk').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Dashboard').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Tickets').length).toBeGreaterThan(0);
    });

    it('toggles mobile menu on button click', async () => {
        render(<AppShell><div>Test Content</div></AppShell>);
        
        // Find toggle button
        const toggleBtn = screen.getByLabelText('Toggle Mobile Menu');
        expect(toggleBtn).toBeInTheDocument();
        
        // Mocking the mobile viewport by relying on the component state toggle
        fireEvent.click(toggleBtn);
        
        // The drawer has .md:hidden class, we can check if it rendered the backdrop
        await waitFor(() => {
            const drawerBg = document.querySelector('.bg-black\\/60');
            expect(drawerBg).toBeInTheDocument();
        });
    });

    it('toggles dark mode', () => {
        render(<AppShell><div>Test Content</div></AppShell>);
        
        const themeButton = screen.getByText(/Switch to/i);
        expect(themeButton).toBeInTheDocument();
        
        const initialState = document.documentElement.classList.contains('dark');
        
        fireEvent.click(themeButton);
        
        expect(document.documentElement.classList.contains('dark')).not.toBe(initialState);
    });
});
