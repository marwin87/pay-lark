/**
 * Flow 31: Amounts accept at most 2 decimal places
 * Risk: "2.600" typed as "two thousand six hundred" is silently saved as 2.60,
 *       with no sign that anything went wrong.
 * Real boundaries: auth, bill form and Mark as Paid dialog validation, PATCH/POST to the API.
 * Each test uses a fresh isolated user → exactly one bill / payment on the page.
 */
import { test, expect } from '@playwright/test';
import { loginNewUser, createBillViaApi, syncPaymentsViaApi } from './helpers';

const ERROR = 'Enter a valid amount (up to 2 decimal places).';

test('bill form rejects 3 decimal places and keeps 2630,55 and 2600', async ({ page }) => {
  const billName = `E2E Decimals ${Date.now()}`;
  await loginNewUser(page);
  await createBillViaApi(page, billName);

  await page.goto('/dashboard/bills');
  await page.getByText(billName, { exact: true }).hover();
  await page.getByRole('button', { name: 'Edit' }).click();

  const amount = page.getByLabel('Amount');
  await amount.fill('2.600');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText(ERROR)).toBeVisible();
  await expect(page.getByRole('status')).not.toBeVisible();

  await amount.fill('2630,55');
  await expect(page.getByText(ERROR)).not.toBeVisible();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status')).toContainText('saved');
  await expect(page.getByText('2630.55 PLN')).toBeVisible();
});

test('Mark as Paid dialog rejects 3 decimal places and accepts 2600', async ({ page }) => {
  const billName = `E2E Decimals Paid ${Date.now()}`;
  await loginNewUser(page);
  await createBillViaApi(page, billName);
  await syncPaymentsViaApi(page);

  await page.goto('/dashboard/payments');
  await page.getByRole('button', { name: 'Mark as Paid' }).click();
  const dialog = page.getByRole('dialog');

  await dialog.getByLabel('Amount paid').fill('2.600');
  await expect(dialog.getByText(ERROR)).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Mark as Paid' })).toBeDisabled();

  await dialog.getByLabel('Amount paid').fill('2600');
  await expect(dialog.getByText(ERROR)).not.toBeVisible();
  await dialog.getByRole('button', { name: 'Mark as Paid' }).click();
  await expect(page.getByLabel('Revert payment')).toBeVisible();
  await expect(page.getByText(/Paid on .*2600\.00 PLN/)).toBeVisible();
});
