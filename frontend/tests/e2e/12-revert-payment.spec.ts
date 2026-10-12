/**
 * Flow 12: Revert a paid payment → it is genuinely unpaid again
 * Risk: the Revert button/dialog closes but the payment stays paid on the server
 *       (or the paid details linger), so the user believes a bill is open when it is not.
 * Real boundaries: auth, POST /bills/payments/:id/pay + revert, UI state, reload.
 * Each test uses a fresh isolated user → exactly one payment row on the page.
 */
import { test, expect } from '@playwright/test';
import { loginNewUser, createBillViaApi, syncPaymentsViaApi } from './helpers';

test('reverting a paid payment makes it payable again and survives reload', async ({ page }) => {
  const billName = `E2E Revert ${Date.now()}`;

  await loginNewUser(page);
  await createBillViaApi(page, billName);
  await syncPaymentsViaApi(page);

  await page.goto('/dashboard/payments');
  await expect(page.getByText(billName, { exact: true })).toBeVisible();

  // Step: pay it
  await page.getByRole('button', { name: 'Mark as Paid' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Mark as Paid' }).click();
  await expect(page.getByLabel('Revert payment')).toBeVisible();
  await expect(page.getByText(/Paid on/)).toBeVisible();

  // Step: revert it (confirmation dialog)
  await page.getByLabel('Revert payment').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Revert payment', exact: true }).click();
  await expect(dialog).not.toBeVisible();

  // Assert: unpaid again in the UI
  await expect(page.getByRole('button', { name: 'Mark as Paid' })).toBeVisible();
  await expect(page.getByLabel('Revert payment')).not.toBeVisible();
  await expect(page.getByText(/Paid on/)).not.toBeVisible();

  // Assert: the server agrees (not just optimistic state)
  await page.reload();
  await expect(page.getByText(billName, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mark as Paid' })).toBeVisible();
  await expect(page.getByText(/Paid on/)).not.toBeVisible();
});
