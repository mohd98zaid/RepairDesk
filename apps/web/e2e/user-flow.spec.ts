import { test, expect } from '@playwright/test';

test.describe('User Core Workflows', () => {

    test('Login Flow -> Dashboard -> Logout', async ({ page }) => {
        // Go to login page
        await page.goto('/login');
        
        // Ensure form is visible
        await expect(page.locator('form')).toBeVisible();

        // Normally we'd use valid credentials to test this,
        // Since this is an audit test suite skeleton, we'll mock the response to test frontend behavior
        await page.route('**/auth/login', async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    access_token: 'fake-token',
                    user: {
                        id: 'opt1',
                        email: 'test@repairdesk.com',
                        full_name: 'Test Setup',
                        role: 'OWNER'
                    }
                })
            });
        });

        // Mock the shops/me to prevent redirecting to onboarding
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

        // Submit form
        await page.fill('input[type="email"]', 'test@repairdesk.com');
        await page.fill('input[type="password"]', 'password123');
        await page.click('button[type="submit"]');

        // Verify successful navigation to dashboard
        await expect(page).toHaveURL(/.*dashboard/);

        // Verify AppShell is visible
        await expect(page.locator('aside.hidden.md\\:flex')).toBeVisible(); // Desktop Sidebar
        
        // Log out
        const logoutBtn = page.getByRole('button', { name: 'Sign Out' }).first();
        await logoutBtn.click();

        // Verify redirect to login
        await expect(page).toHaveURL(/.*login/);
    });

});
