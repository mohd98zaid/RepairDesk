import { test, expect } from '@playwright/test';

test.use({
  camera: true,
  launchOptions: {
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
    ],
  },
});

test('Camera should open successfully', async ({ page }) => {
  await page.goto('http://localhost:3000/login');
  
  // Login
  await page.fill('input[type="email"]', "mohd98zaid@gmail.com");
  await page.fill('input[type="password"]', "Zaidzaid1");
  await page.click('button[type="submit"]');
  
  // Wait for dashboard and scanner button
  await page.waitForURL('**/dashboard*');
  
  // Find scanner button in GlobalSearch using the title attribute
  await page.click('button[title="Scan QR Code"]');
  
  await expect(page.locator("h2:has-text('Scan Ticket QR')")).toBeVisible();
  
  // Give scanner a few seconds to start
  await page.waitForTimeout(3000);
  
  // If "Camera Access Failed" appears, test should fail. We can negate this:
  await expect(page.locator('text=Camera Access Failed')).toHaveCount(0);
});
