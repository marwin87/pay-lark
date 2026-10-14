/**
 * Flow 2: Create a bill → appears in payments list
 * Risk: bill creation succeeds but payment instances are not generated →
 *       bill name never appears in the current month's payments list.
 * Real boundaries: auth (cookie), Bills API (POST /bills), Payments API
 *                  (GET /bills/payments), DB (bill_templates + payment_instances).
 */
import { test, expect } from '@playwright/test';
import { loginNewUser } from './helpers';

test('created bill appears in current month payments', async ({ page }) => {
  const billName = `E2E Bill ${Date.now()}`;

  // Setup: authenticate via API
  await loginNewUser(page);

  // Step: navigate to bills page
  await page.goto('/dashboard/bills');
  await expect(page.getByRole('button', { name: 'New Bill' })).toBeVisible();

  // Step: open the new bill form
  await page.getByRole('button', { name: 'New Bill' }).click();

  // Step: fill the bill name
  await page.getByLabel('Name').fill(billName);

  // Step: fill amount
  await page.getByLabel('Amount').fill('45.00');

  // Step: select category (custom listbox, not a native <select>) — options
  // are keyed by numeric category_id (per-user categories), so match by
  // visible label, not value.
  await page.getByLabel('Category').click();
  await page.getByRole('option', { name: 'Utilities' }).click();

  // Step: save the bill
  await page.getByRole('button', { name: 'Save' }).click();

  // Assert: the user is told the bill was added
  await expect(page.getByRole('status')).toContainText(`Bill “${billName}” added`);

  // Assert: form closes and bill appears in the list
  await expect(page.getByText(billName, { exact: true })).toBeVisible();

  // A new bill is a draft: no payments until it is activated
  await page.getByRole('button', { name: 'Generate payments' }).click();
  await expect(page.getByRole('status')).toContainText('payments generated');

  // Step: navigate to payments page (triggers sync-instances on load)
  await page.goto('/dashboard/payments');

  // Assert: bill name visible in the current month's payment list
  await expect(page.getByText(billName, { exact: true })).toBeVisible();
});
