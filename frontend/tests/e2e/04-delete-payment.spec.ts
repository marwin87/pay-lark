/**
 * Flow 4: Delete a payment → disappears from list
 * Risk: DELETE API succeeds but UI retains the stale row — user thinks payment
 *       still exists and count never decrements.
 * Real boundaries: auth, DELETE /bills/payments/:id, UI list re-render.
 * Each test uses a fresh isolated user → exactly one payment row on the page.
 */
import { test, expect } from '@playwright/test';
import { loginNewUser, createBillViaApi, syncPaymentsViaApi } from './helpers';

test('deleted payment row disappears from the payments list', async ({ page }) => {
  const billName = `E2E Delete ${Date.now()}`;

  // Setup: authenticate + create bill + sync instances via API
  await loginNewUser(page);
  await createBillViaApi(page, billName);
  await syncPaymentsViaApi(page);

  // Step: navigate to payments page
  await page.goto('/dashboard/payments');
  await expect(page.getByText(billName, { exact: true })).toBeVisible();

  // Step: click "Delete payment" (only one row → no ambiguity)
  await page.getByLabel('Delete payment').click();

  // DeletePaymentDialog appears — confirm
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Delete' }).click();

  // Assert: the payment row is gone (exact: true avoids matching parent containers
  // whose combined text content includes billName + other text like frequency)
  await expect(page.getByRole('main').getByText(billName, { exact: true })).not.toBeVisible();

  // Assert: "Nothing to pay this month" empty state appears (first() because the text
  // shows both above the list and in the empty-state block)
  await expect(page.getByText('Nothing to pay this month').first()).toBeVisible();
});
