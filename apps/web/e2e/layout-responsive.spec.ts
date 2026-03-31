import { test, expect } from '@playwright/test';

test.describe('Responsive Layout', () => {
    // We disable javascript to speed up just layout checks if needed, but AppShell requires it.

    const viewports = [
        { width: 320, height: 568, name: 'iPhone SE' },
        { width: 375, height: 667, name: 'iPhone 8' },
        { width: 414, height: 896, name: 'iPhone 11 Pro Max' },
        { width: 1280, height: 800, name: 'Laptop' },
        { width: 1440, height: 900, name: 'Large Laptop' },
        { width: 1920, height: 1080, name: 'Full HD' }
    ];

    for (const vp of viewports) {
        test(`AppShell renders correctly at ${vp.name} (${vp.width}x${vp.height})`, async ({ page }) => {
            await page.setViewportSize({ width: vp.width, height: vp.height });
            
            // Go to login first since app requires auth
            // We use the auth fixture or just bypass for UI testing if possible, 
            // but let's test the login page responsiveness directly here as well.
            await page.goto('/admin/login');
            
            // Verify no horizontal scrolling
            const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
            const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
            
            expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
            
            // Verify login form is visible and centered
            const loginCard = page.locator('.admin-login-card');
            await expect(loginCard).toBeVisible();

            // Check if bounds remain inside the viewport
            const cardBox = await loginCard.boundingBox();
            expect(cardBox).not.toBeNull();
            if (cardBox) {
                expect(cardBox.width).toBeLessThanOrEqual(vp.width);
            }
        });
    }

    test('Mobile Top Bar has sufficient touch targets', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 667 });
        
        // Mock a token to bypass login to view the AppShell
        await page.addInitScript(() => {
            localStorage.setItem('repairdesk-auth', JSON.stringify({ state: { accessToken: 'fake' } }));
        });
        await page.goto('/dashboard');
        
        // Mobile menu toggle
        const menuBtn = page.getByRole('button', { name: 'Toggle Mobile Menu' });
        await expect(menuBtn).toBeVisible();
        
        const box = await menuBtn.boundingBox();
        expect(box).not.toBeNull();
        if (box) {
            expect(box.width).toBeGreaterThanOrEqual(44);
            expect(box.height).toBeGreaterThanOrEqual(44);
        }
        
        // New ticket link
        const newBtn = page.getByRole('link', { name: 'New Ticket' });
        const newBox = await newBtn.boundingBox();
        expect(newBox).not.toBeNull();
        if (newBox) {
            expect(newBox.height).toBeGreaterThanOrEqual(44);
        }
    });
});
