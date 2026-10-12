/**
 * Flow 21: Edit a paid payment (amount + note) without reverting it
 * Risk: the edit dialog closes but the change is not saved (or the payment silently
 *       becomes unpaid / a duplicate next-period row appears), so the user sees wrong data.
 * Real boundaries: auth, POST /bills/payments/:id/pay + PATCH /bills/payments/:id, UI state, reload.
 * Each test uses a fresh isolated user → exactly one payment row on the page.
 */
import { test, expect } from '@playwright/test';
import { loginNewUser, createBillViaApi, syncPaymentsViaApi } from './helpers';

test('editing a paid payment keeps it paid, saves new amount and note, survives reload', async ({ page }) => {
  const billName = `E2E EditPaid ${Date.now()}`;

  await loginNewUser(page);
  await createBillViaApi(page, billName);
  await syncPaymentsViaApi(page);

  await page.goto('/dashboard/payments');
  await expect(page.getByText(billName, { exact: true })).toBeVisible();

  // Step: pay it with an initial amount and note
  await page.getByRole('button', { name: 'Mark as Paid' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Amount paid').fill('100');
  await dialog.getByLabel('Notes').fill('first note');
  await dialog.getByRole('button', { name: 'Mark as Paid' }).click();
  await expect(page.getByText('first note')).toBeVisible();

  // Step: edit it — dialog is prefilled with what was recorded
  await page.getByLabel('Edit payment').click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Amount paid')).toHaveValue('100.00');
  await expect(dialog.getByLabel('Notes')).toHaveValue('first note');
  await dialog.getByLabel('Amount paid').fill('87.50');
  await dialog.getByLabel('Notes').fill('second note');
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(dialog).not.toBeVisible();

  // Assert: still paid, with the new values
  await expect(page.getByText(/Paid on/)).toContainText('87.50');
  await expect(page.getByText('second note')).toBeVisible();
  await expect(page.getByText('first note')).not.toBeVisible();

  // Assert: the server agrees, and the note can be cleared
  await page.reload();
  await expect(page.getByText(/Paid on/)).toContainText('87.50');
  await expect(page.getByText('second note')).toBeVisible();

  await page.getByLabel('Edit payment').click();
  await dialog.getByLabel('Notes').fill('');
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await expect(page.getByText(/Paid on/)).toBeVisible();
  await expect(page.getByText('second note')).not.toBeVisible();
});

test('editing an unpaid payment sets its own amount and note, then paying defaults to it', async ({ page }) => {
  const billName = `E2E EditUnpaid ${Date.now()}`;

  await loginNewUser(page);
  await createBillViaApi(page, billName);
  await syncPaymentsViaApi(page);

  await page.goto('/dashboard/payments');
  await expect(page.getByText(billName, { exact: true })).toBeVisible();

  // Step: set this payment's own amount + a note before paying (no date field)
  await page.getByLabel('Edit payment').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Amount due')).toHaveValue('');
  await dialog.getByLabel('Amount due').fill('143.20');
  await dialog.getByLabel('Notes').fill('invoice 7');
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(dialog).not.toBeVisible();

  // Assert: shown as still unpaid, with the new amount and note — and it survives reload
  await expect(page.getByText('143.20')).toBeVisible();
  await expect(page.getByText('invoice 7')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mark as Paid' })).toBeVisible();
  await page.reload();
  await expect(page.getByText('143.20')).toBeVisible();
  await expect(page.getByText('invoice 7')).toBeVisible();

  // Step: paying prefills the overridden amount and the note
  await page.getByRole('button', { name: 'Mark as Paid' }).click();
  await expect(dialog.getByLabel('Amount paid')).toHaveValue('143.20');
  await expect(dialog.getByLabel('Notes')).toHaveValue('invoice 7');
  await dialog.getByRole('button', { name: 'Mark as Paid' }).click();
  await expect(page.getByText(/Paid on/)).toContainText('143.20');
});
