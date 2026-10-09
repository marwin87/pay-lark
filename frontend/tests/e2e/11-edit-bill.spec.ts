/**
 * Flow 11: Edit an existing bill template — amount, category, frequency, due day, pause
 * Risk: the edit form saves only a subset of the changed fields, or the list keeps
 *       showing stale values / the old category grouping after a successful save.
 * Real boundaries: auth, PATCH /bills/:id, bills list re-fetch and category grouping.
 * Each test uses a fresh isolated user → exactly one bill on the list.
 */
import { test, expect } from '@playwright/test';
import { loginNewUser, createBillViaApi } from './helpers';

test('editing a bill persists amount, category, frequency, due day and pause', async ({ page }) => {
  const billName = `E2E Edit ${Date.now()}`;

  await loginNewUser(page);
  await createBillViaApi(page, billName); // utilities, monthly, 99.99 PLN, due day 15

  await page.goto('/dashboard/bills');
  await expect(page.getByText(billName, { exact: true })).toBeVisible();

  // Step: open the inline edit form (Edit is hover-revealed on sm+)
  await page.getByText(billName, { exact: true }).hover();
  await page.getByRole('button', { name: 'Edit' }).click();

  // Step: amount
  await page.getByLabel('Amount').fill('150.00');

  // Step: category (custom listbox)
  await page.getByLabel('Category').click();
  await page.getByRole('option', { name: 'Housing' }).click();

  // Step: cycle
  await page.locator('#bill-interval').click();
  await page.getByRole('option', { name: '3 months' }).click();

  // Step: due day — open the days calendar (15 is selected), swap it for 20
  await page.getByLabel('Payment days').click();
  await page.getByRole('button', { name: '15', exact: true }).click();
  await page.getByRole('button', { name: '20', exact: true }).click();
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Save' }).click();

  // Assert: the user is told the changes were saved
  await expect(page.getByRole('status')).toContainText('saved');

  // Assert: every edited field is reflected on the collapsed row
  await expect(page.getByText('150.00 PLN')).toBeVisible();
  await expect(page.getByText('Every 3 months')).toBeVisible();
  await expect(page.getByText(/Due on/)).toContainText('20');

  // Assert: persisted (not just optimistic) and regrouped under the new category
  await page.reload();
  await expect(page.getByText(billName, { exact: true })).toBeVisible();
  await expect(page.getByText('150.00 PLN')).toBeVisible();
  await expect(page.getByText('Housing', { exact: true })).toBeVisible();
  await expect(page.getByText('Utilities', { exact: true })).not.toBeVisible();
});
