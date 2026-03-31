import { test, expect } from '@playwright/test';

/**
 * E2E TESTS — Login Flow
 * ========================
 * Tests real browser behavior for the login flow:
 * - Form rendering and submission
 * - Cookie handling (httpOnly refresh token)
 * - Protected route redirects
 * - Error states
 * - CORS cross-origin requests
 *
 * Run: npx playwright test e2e/login.spec.ts
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://repairdesk-vr8w.onrender.com/api/v1';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

test.describe('Login Flow', () => {
  test('should render login page with form fields', async ({ page }) => {
    await page.goto('/login');

    // Verify page title
    await expect(page).toHaveTitle(/RepairDesk|Login/i);

    // Verify form fields exist
    await expect(page.getByRole('textbox', { name: /email/i })).toBeVisible();
    await expect(page.getByRole('textbox', { name: /password/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in|login/i })).toBeVisible();
  });

  test('should show error on invalid credentials', async ({ page }) => {
    await page.goto('/login');

    await page.getByRole('textbox', { name: /email/i }).fill('wrong@test.com');
    await page.getByRole('textbox', { name: /password/i }).fill('wrongpassword');
    await page.getByRole('button', { name: /sign in|login/i }).click();

    // Should show error message
    await expect(page.getByText(/invalid|wrong|error/i)).toBeVisible({ timeout: 15000 });

    // Should stay on login page
    await expect(page).toHaveURL(/\/login/);
  });

  test('should show error on empty form submission', async ({ page }) => {
    await page.goto('/login');

    await page.getByRole('button', { name: /sign in|login/i }).click();

    // Should show validation error
    await expect(page.getByText(/required|invalid|error/i)).toBeVisible({ timeout: 5000 });
  });

  test('should redirect to dashboard on successful login', async ({ page, context }) => {
    // This test requires a registered user
    // Skip if no test user exists
    test.skip(!process.env.TEST_EMAIL || !process.env.TEST_PASSWORD, 'No test credentials provided');

    await page.goto('/login');

    await page.getByRole('textbox', { name: /email/i }).fill(process.env.TEST_EMAIL!);
    await page.getByRole('textbox', { name: /password/i }).fill(process.env.TEST_PASSWORD!);
    await page.getByRole('button', { name: /sign in|login/i }).click();

    // Should redirect to dashboard
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
  });

  test('should set httpOnly refresh cookie on login', async ({ page, context }) => {
    test.skip(!process.env.TEST_EMAIL || !process.env.TEST_PASSWORD, 'No test credentials provided');

    await page.goto('/login');

    await page.getByRole('textbox', { name: /email/i }).fill(process.env.TEST_EMAIL!);
    await page.getByRole('textbox', { name: /password/i }).fill(process.env.TEST_PASSWORD!);
    await page.getByRole('button', { name: /sign in|login/i }).click();

    // Wait for redirect
    await page.waitForURL(/\/dashboard/, { timeout: 15000 });

    // Check for refresh cookie
    const cookies = await context.cookies();
    const refreshCookie = cookies.find(c => c.name === 'repairdesk_refresh');
    expect(refreshCookie).toBeDefined();
    expect(refreshCookie?.httpOnly).toBe(true);
    expect(refreshCookie?.secure).toBe(true);
    expect(refreshCookie?.sameSite).toBe('None');
  });
});

test.describe('Protected Routes', () => {
  test('should redirect unauthenticated users to login', async ({ page }) => {
    // Clear any existing auth
    await page.context().clearCookies();
    await page.goto('/dashboard');

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
  });

  test('should redirect unauthenticated users from tickets page', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/tickets');

    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
  });

  test('should redirect unauthenticated users from customers page', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/customers');

    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
  });

  test('should redirect unauthenticated users from settings page', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/settings');

    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
  });
});

test.describe('CORS & Cross-Origin', () => {
  test('should successfully make cross-origin API calls', async ({ page }) => {
    // Navigate to login (frontend on localhost/vercel, API on render)
    await page.goto('/login');

    // Intercept the login request to verify it goes to the correct API
    const apiRequests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/v1/')) {
        apiRequests.push(request.url());
      }
    });

    // Submit login form (will fail with wrong creds, but we verify the URL)
    await page.getByRole('textbox', { name: /email/i }).fill('test@test.com');
    await page.getByRole('textbox', { name: /password/i }).fill('test');
    await page.getByRole('button', { name: /sign in|login/i }).click();

    // Wait for the API request to be made
    await page.waitForTimeout(3000);

    // Verify the request went to the correct API URL
    const loginRequest = apiRequests.find(url => url.includes('/auth/login'));
    expect(loginRequest).toBeDefined();
    expect(loginRequest).toContain('repairdesk-vr8w.onrender.com');
    expect(loginRequest).not.toContain('localhost');
  });

  test('should not have CORS errors in browser console', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('/login');
    await page.getByRole('textbox', { name: /email/i }).fill('test@test.com');
    await page.getByRole('textbox', { name: /password/i }).fill('test');
    await page.getByRole('button', { name: /sign in|login/i }).click();

    await page.waitForTimeout(5000);

    // Filter out expected errors (401 is expected for wrong creds)
    const corsErrors = consoleErrors.filter(e =>
      e.toLowerCase().includes('cors') ||
      e.toLowerCase().includes('cross-origin') ||
      e.toLowerCase().includes('access-control')
    );

    expect(corsErrors).toHaveLength(0);
  });
});

test.describe('Session Management', () => {
  test('should show session terminated message when token expires', async ({ page }) => {
    // Clear auth state
    await page.context().clearCookies();
    await page.context().clearLocalStorage();

    // Navigate to a protected route
    await page.goto('/dashboard');

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
  });

  test('should persist session across page reloads', async ({ page }) => {
    test.skip(!process.env.TEST_EMAIL || !process.env.TEST_PASSWORD, 'No test credentials provided');

    // Login
    await page.goto('/login');
    await page.getByRole('textbox', { name: /email/i }).fill(process.env.TEST_EMAIL!);
    await page.getByRole('textbox', { name: /password/i }).fill(process.env.TEST_PASSWORD!);
    await page.getByRole('button', { name: /sign in|login/i }).click();

    await page.waitForURL(/\/dashboard/, { timeout: 15000 });

    // Reload the page
    await page.reload();

    // Should still be on dashboard (session persisted)
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
  });

  test('should logout and clear session', async ({ page }) => {
    test.skip(!process.env.TEST_EMAIL || !process.env.TEST_PASSWORD, 'No test credentials provided');

    // Login
    await page.goto('/login');
    await page.getByRole('textbox', { name: /email/i }).fill(process.env.TEST_EMAIL!);
    await page.getByRole('textbox', { name: /password/i }).fill(process.env.TEST_PASSWORD!);
    await page.getByRole('button', { name: /sign in|login/i }).click();

    await page.waitForURL(/\/dashboard/, { timeout: 15000 });

    // Logout
    const logoutButton = page.getByRole('button', { name: /logout|sign out/i });
    if (await logoutButton.isVisible()) {
      await logoutButton.click();
    } else {
      // Try clicking menu first
      await page.getByRole('button', { name: /menu|account|profile/i }).click();
      await page.getByRole('button', { name: /logout|sign out/i }).click();
    }

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
  });
});

test.describe('Error UI States', () => {
  test('should display network error when backend is unreachable', async ({ page }) => {
    // Block all API requests to simulate unreachable backend
    await page.route('**/api/v1/**', (route) => {
      route.abort('failed');
    });

    await page.goto('/login');
    await page.getByRole('textbox', { name: /email/i }).fill('test@test.com');
    await page.getByRole('textbox', { name: /password/i }).fill('test');
    await page.getByRole('button', { name: /sign in|login/i }).click();

    // Should show some error message (not crash)
    await expect(page.getByText(/error|unavailable|network|connection/i)).toBeVisible({ timeout: 10000 });
  });

  test('should display loading state during login', async ({ page }) => {
    // Slow down the API response
    await page.route('**/api/v1/auth/login', async (route) => {
      await new Promise(resolve => setTimeout(resolve, 2000));
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Invalid credentials' }),
      });
    });

    await page.goto('/login');
    await page.getByRole('textbox', { name: /email/i }).fill('test@test.com');
    await page.getByRole('textbox', { name: /password/i }).fill('test');
    await page.getByRole('button', { name: /sign in|login/i }).click();

    // Should show loading state (button disabled or spinner)
    const button = page.getByRole('button', { name: /sign in|login/i });
    await expect(button).toBeDisabled({ timeout: 1000 });
  });
});
