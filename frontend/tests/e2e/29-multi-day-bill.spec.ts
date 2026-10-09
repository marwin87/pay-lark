/**
 * Flow 29: A bill paid on several days of the month → one payment tile per day
 * Risk: the form sends only one day (or the backend collapses the days), so the
 *       month shows a single payment, or editing the days leaves stale tiles.
 * Real boundaries: auth, POST/PATCH /bills (due_days), sync-instances, GET /bills/payments.
 */
import { test, expect, type Page } from '@playwright/test';
import { loginNewUser } from './helpers';

/** Open the days calendar and make exactly `wanted` the selected days. */
async function pickDays(page: Page, wanted: number[]) {
  await page.getByLabel('Payment days').click();
  for (let d = 1; d <= 28; d++) {
    const btn = page.getByRole('button', { name: String(d), exact: true });
    const pressed = (await btn.getAttribute('aria-pressed')) === 'true';
    if (pressed !== wanted.includes(d)) await btn.click();
  }
  await page.keyboard.press('Escape');
}

test('a bill with three days gets three payments, and editing the days updates them', async ({ page }) => {
  const billName = `E2E Gym ${Date.now()}`;
  await loginNewUser(page);

  await page.goto('/dashboard/bills');
  await page.getByRole('button', { name: 'New Bill' }).click();
  await page.getByLabel('Name').fill(billName);
  await page.getByLabel('Amount').fill('25.00');
  await page.getByLabel('Category').click();
  await page.getByRole('option', { name: 'Utilities' }).click();
  await pickDays(page, [3, 10, 17]);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status')).toContainText(`Bill “${billName}” added`);

  // The bills list shows every day
  await expect(page.getByText(/Due on/)).toContainText('3, 10, 17');

  // One tile per day on the Payments page
  await page.goto('/dashboard/payments');
  await expect(page.getByText(billName, { exact: true })).toHaveCount(3);

  // Edit down to two days: the dropped slot's unpaid tile disappears
  await page.goto('/dashboard/bills');
  await page.getByText(billName, { exact: true }).hover();
  await page.getByRole('button', { name: 'Edit' }).click();
  await pickDays(page, [3, 12]);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status')).toContainText('saved');

  await page.goto('/dashboard/payments');
  await expect(page.getByText(billName, { exact: true })).toHaveCount(2);
});
