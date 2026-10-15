/**
 * Flow 28: Pausing a bill removes its unpaid payments from Payments; resuming brings them back
 * Risk: the user cancels a subscription (pauses the bill) but its unpaid payment
 *       keeps showing under Payments, so pausing looks broken — or resuming the
 *       bill leaves Payments empty.
 * Real boundaries: auth, POST /bills/:id/archive + /unarchive, GET /bills/payments,
 * POST /bills/sync-instances, the Bills and Payments pages.
 */
import { test, expect } from '@playwright/test';
import {
  createBillViaApi,
  loginNewUser,
  pauseViaApi,
  payFirstPaymentViaApi,
  syncPaymentsViaApi,
} from './helpers';

test('paused bill disappears from Payments and comes back when resumed', async ({ page }) => {
  const billName = `E2E Netflix ${Date.now()}`;
  const row = page.getByText(billName, { exact: true });

  await loginNewUser(page);
  await createBillViaApi(page, billName);
  await syncPaymentsViaApi(page);

  // The unpaid payment for this month is listed.
  await page.goto('/dashboard/payments');
  await expect(row).toBeVisible();

  // Pause the bill from the Bills page.
  await page.goto('/dashboard/bills');
  await row.hover();
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Pause' }).click();
  await expect(page.getByRole('status')).toContainText('paused');
  await expect(page.getByRole('dialog')).not.toBeVisible();

  // Its payment is gone from Payments.
  const paymentsLoaded = page.waitForResponse(
    (r) => r.url().includes('/bills/payments') && r.request().method() === 'GET',
  );
  await page.goto('/dashboard/payments');
  await paymentsLoaded;
  await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible();
  await expect(row).toHaveCount(0);

  // Resume it from the Bills page.
  await page.goto('/dashboard/bills');
  await page.getByRole('button', { name: /Show paused/ }).first().click();
  await expect(row).toBeVisible();
  await page.getByRole('button', { name: 'Resume' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Resume' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();

  // The payment is back on Payments.
  await page.goto('/dashboard/payments');
  await expect(row).toBeVisible();
});

test('editing a paused bill does not bring its hidden payments back', async ({ page }) => {
  const billName = `E2E Linked ${Date.now()}`;
  const row = page.getByText(billName, { exact: true });

  await loginNewUser(page);
  await createBillViaApi(page, billName);
  await syncPaymentsViaApi(page);

  // Pause, then edit the paused bill.
  await page.goto('/dashboard/bills');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Pause' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('button', { name: /Show paused/ }).first().click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Amount').fill('120.00');
  await page.getByRole('button', { name: 'Save' }).click();

  // Pausing hid those payments; the edit must not ask to "restore deleted payments".
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('saved');

  // Still paused, and still absent from Payments.
  const paymentsLoaded = page.waitForResponse(
    (r) => r.url().includes('/bills/payments') && r.request().method() === 'GET',
  );
  await page.goto('/dashboard/payments');
  await paymentsLoaded;
  await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible();
  await expect(row).toHaveCount(0);
});

test('a paid payment of a paused bill cannot be reverted until the bill is resumed', async ({ page }) => {
  const billName = `E2E Frozen ${Date.now()}`;
  await loginNewUser(page);
  const id = await createBillViaApi(page, billName);
  await syncPaymentsViaApi(page);
  await payFirstPaymentViaApi(page);
  await pauseViaApi(page, id);

  // Paid history stays visible after pausing.
  await page.goto('/dashboard/payments');
  await expect(page.getByText(billName, { exact: true })).toBeVisible();
  await expect(page.getByText(/Paid on/)).toBeVisible();

  // The dialog says why up front and offers no revert; the payment stays paid.
  await page.getByLabel('Revert payment').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('This bill is paused. Resume it first to revert this payment.')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Revert payment', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByText(/Paid on/)).toBeVisible();

  // After resuming, the same revert goes through.
  await page.goto('/dashboard/bills');
  await page.getByRole('button', { name: /Show paused/ }).first().click();
  await page.getByRole('button', { name: 'Resume' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Resume' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.goto('/dashboard/payments');
  await page.getByLabel('Revert payment').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Revert payment', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Mark as Paid' })).toBeVisible();
});
