import { test, expect } from '@playwright/test';

test.describe('Component Interactions', () => {

    test.beforeEach(async ({ page }) => {
        // Mock Auth
        await page.addInitScript(() => {
            localStorage.setItem('repairdesk-auth', JSON.stringify({ state: { accessToken: 'fake' } }));
        });

        // Mock shop
        await page.route('**/shops/me', async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    id: 'shop1',
                    address: '123 Fake Street',
                    shop_status: 'ACTIVE'
                })
            });
        });
        
        await page.goto('/dashboard');
    });

    test('Mobile Menu toggles correctly', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 667 });
        
        const menuBtn = page.getByRole('button', { name: 'Toggle Mobile Menu' });
        await expect(menuBtn).toBeVisible();
        await menuBtn.click();
        
        // Assert Drawer is open
        const drawerContent = page.locator('.md\\:hidden.fixed.inset-0.z-40');
        await expect(drawerContent).toBeVisible();

        // Close it
        await menuBtn.click();
        await expect(drawerContent).not.toBeVisible();
    });

    test('Theme toggle updates layout and localStorage', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 800 });
        
        const themeBtn = page.getByRole('button', { name: /Switch to (Light|Dark) mode/ });
        await expect(themeBtn).toBeVisible();
        
        // Check current class
        const html = page.locator('html');
        const isDark = await html.evaluate(node => node.classList.contains('dark'));
        
        await themeBtn.click();
        
        // Verify class toggled
        const isDarkNow = await html.evaluate(node => node.classList.contains('dark'));
        expect(isDarkNow).not.toBe(isDark);
    });

    // Test notification bell dropdown
    test('Notifications bell reveals empty state', async ({ page }) => {
        const notifBtn = page.getByRole('button', { name: 'Notifications' });
        await expect(notifBtn).toBeVisible();

        await notifBtn.click();
        const popup = page.locator('.bg-card.border.rounded-xl.shadow-2xl.z-50');
        await expect(popup).toBeVisible();
        
        await expect(page.locator('text=All caught up!')).toBeVisible();
    });
});
